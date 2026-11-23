// Receipt scanner request handler.
//
// Kept apart from index.ts so it can be tested without Deno or the network:
// everything that touches the outside world (the Auth server, Gemini, the API
// key) arrives through `ScanDeps`.
//
// Order of checks is deliberate, cheapest and most decisive first:
//   method -> caller identity -> server config -> content type -> body size
//   -> JSON shape -> image -> category list -> model call
// An unauthenticated caller never gets as far as having a body read or a model
// called on their behalf.

import { authenticate, type GetUser } from "../_shared/auth.ts";
import { validateAmount } from "../_shared/amount.ts";
import { validateConfidence, validateDateString } from "../_shared/date.ts";
import {
  corsHeaders,
  errorResponse,
  json,
  readTextLimited,
} from "../_shared/http.ts";
import { logProviderError, logUnexpected } from "../_shared/log.ts";
import { sanitizeText } from "../_shared/sanitize.ts";
import type { QuotaResult } from "../_shared/kapy/ratelimit.ts";
import {
  sniffImageMime,
  validateBase64,
  validateCategoryList,
} from "../_shared/validate.ts";

// ~6 MB of base64, roughly a 4.5 MB photo. The app compresses to quality 0.5,
// so a genuine receipt lands far under this.
export const MAX_BASE64 = 6_000_000;
// A real photo is thousands of bytes. This only rejects obvious non-images.
export const MIN_BASE64 = 100;
// The JSON envelope (field names, category list) on top of the image itself.
export const MAX_BODY_BYTES = MAX_BASE64 + 100_000;
export const GEMINI_TIMEOUT_MS = 30_000;

// A merchant name is a few words. The cap is a security control, not
// cosmetics: this string is read off a photograph, so whoever printed the
// receipt chose its content, and it later reaches a tool-calling model.
export const MAX_MERCHANT = 40;

export interface ScanDeps {
  /** Verifies a bearer token with the Auth server. */
  getUser: GetUser;
  /** The Gemini key, or undefined when the secret is not set. */
  geminiApiKey: string | undefined;
  /** Performs the Gemini request. Injected so tests never reach the network. */
  callGemini: (body: unknown, signal: AbortSignal) => Promise<Response>;
  /**
   * Counts this request against the caller's allowance. Given the verified
   * token; returns whether to proceed. Optional so the handler can be used (and
   * tested) without a database, but production wiring always supplies it.
   */
  quota?: (token: string) => Promise<QuotaResult>;
}

const UNREADABLE = "Couldn't read that receipt. Try again.";

function buildPrompt(categories: string[]): string {
  return `You are a receipt scanner for a Malaysian money-tracking app.
Read this receipt image and extract:
- amount: the TOTAL paid, as a plain number (no "RM", no commas)
- merchant: the shop or business name
- category: pick the single best id from this list: ${categories.join(", ")}
- date: the date printed on the receipt, as YYYY-MM-DD.
  Malaysian receipts are DAY-first: 03/04/2026 means 3 April 2026, not 4 March.
  Use null if no date is legible. Never guess today's date.
- confidence: 0 to 1, how sure you are that amount and merchant are correct.
  Use a low value for blurry, cropped or partly unreadable receipts.

Reply with JSON only:
{"amount": number, "merchant": string, "category": string, "date": string, "confidence": number}
If a value is unreadable, use null for amount/merchant/date and "other" for category.`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function handleScanReceipt(
  req: Request,
  deps: ScanDeps
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return errorResponse(405, "Method not allowed.", "method_not_allowed", {
      Allow: "POST, OPTIONS",
    });
  }

  // 1. Who is calling? Never delegated to `verify_jwt` alone.
  const auth = await authenticate(req, deps.getUser);
  if (!auth.ok) return auth.response;

  // 1b. Is this caller within their allowance? Checked before the body is read,
  // so a refused request costs almost nothing.
  if (deps.quota) {
    const q = await deps.quota(auth.token);
    if (!q.allowed) {
      return q.reason === "limit"
        ? errorResponse(429, "You've scanned a lot just now. Please wait a moment and try again.", "rate_limited", {
            "Retry-After": String(q.retryAfterSec),
          })
        : errorResponse(503, "Scanning isn't available right now. Try again in a moment.", "quota_unavailable", {
            "Retry-After": String(q.retryAfterSec),
          });
    }
  }

  // 2. Is the server able to do the work? The reason stays in the logs; the
  // caller is only told it is unavailable (not which secret is missing).
  if (!deps.geminiApiKey) {
    console.error("[scan-receipt] model API key is not configured");
    return errorResponse(
      503,
      "Scanning isn't available right now. Try again later.",
      "not_configured"
    );
  }

  // 3. Shape of the request.
  const contentType = req.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(contentType)) {
    return errorResponse(415, "Send the request as JSON.", "unsupported_media_type");
  }

  const body = await readTextLimited(req, MAX_BODY_BYTES);
  if (!body.ok) {
    return body.reason === "too_large"
      ? errorResponse(413, "That image is too large. Try a smaller photo.", "payload_too_large")
      : errorResponse(400, "Invalid request body.", "invalid_body");
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(body.text);
  } catch {
    return errorResponse(400, "Invalid request body.", "invalid_body");
  }
  if (!isPlainObject(parsedBody)) {
    return errorResponse(400, "Invalid request body.", "invalid_body");
  }

  // 4. The image.
  const image = validateBase64(parsedBody.base64, { max: MAX_BASE64, min: MIN_BASE64 });
  if (!image.ok) {
    if (image.reason === "too_large") {
      return errorResponse(413, "That image is too large. Try a smaller photo.", "payload_too_large");
    }
    if (image.reason === "missing") {
      return errorResponse(400, "No image provided.", "missing_image");
    }
    return errorResponse(400, "That doesn't look like a valid image.", "invalid_image");
  }

  // The format is decided by what the bytes are, not by what the caller says.
  const mimeType = sniffImageMime(image.value);
  if (!mimeType) {
    return errorResponse(
      415,
      "That image format isn't supported. Use a JPEG, PNG, WebP or HEIC photo.",
      "unsupported_image"
    );
  }

  // 5. The category list. The app sends it so constants/categories.ts stays the
  // single source of truth; here it is only checked for being safe to use.
  const categories = validateCategoryList(parsedBody.categories);
  if (!categories) {
    return errorResponse(400, "No valid category list provided.", "invalid_categories");
  }

  // 6. The model call.
  try {
    const res = await deps.callGemini(
      {
        contents: [
          {
            parts: [
              { inline_data: { mime_type: mimeType, data: image.value } },
              { text: buildPrompt(categories) },
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json" },
      },
      AbortSignal.timeout(GEMINI_TIMEOUT_MS)
    );

    if (!res.ok) {
      await logProviderError("scan-receipt", res);
      return errorResponse(502, UNREADABLE, "provider_failed");
    }

    const data = await res.json();
    const parts: unknown[] = data?.candidates?.[0]?.content?.parts ?? [];
    const textPart = parts.find(
      (p): p is { text: string } =>
        isPlainObject(p) && typeof (p as { text?: unknown }).text === "string"
    );
    const text = textPart?.text ?? "{}";

    // responseMimeType should give clean JSON, but models occasionally wrap it
    // in a ```json fence — strip and retry once before giving up.
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      try {
        parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      } catch {
        return errorResponse(502, UNREADABLE, "unreadable_result");
      }
    }
    if (!isPlainObject(parsed)) {
      return errorResponse(502, UNREADABLE, "unreadable_result");
    }

    return json({
      amount: validateAmount(parsed.amount),
      // Cleaned here, at the point untrusted text enters the system, rather
      // than at each place it is later used — one of those would be forgotten.
      merchant: sanitizeText(parsed.merchant, MAX_MERCHANT),
      // Validated again on the client against the real category list.
      category:
        typeof parsed.category === "string" && categories.includes(parsed.category)
          ? parsed.category
          : "other",
      // Plain YYYY-MM-DD rather than a timestamp: the app builds a local Date
      // from the parts, so a receipt dated the 3rd never lands on the 2nd
      // because of a UTC conversion.
      date: validateDateString(parsed.date),
      confidence: validateConfidence(parsed.confidence),
    });
  } catch (e) {
    logUnexpected("scan-receipt", e);
    const timedOut =
      e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return timedOut
      ? errorResponse(504, "That took too long. Try again.", "timeout")
      : errorResponse(500, UNREADABLE, "internal_error");
  }
}
