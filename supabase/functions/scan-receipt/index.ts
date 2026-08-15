// Receipt scanner — reads a photo of a receipt and pulls out the total,
// merchant and category.
//
// Same reason as kapy/: the Gemini key stays on the server. Supabase verifies
// the caller's JWT before this runs.
//
// Deploy:
//   npx supabase functions deploy scan-receipt

import { validateConfidence, validateDateString } from "../_shared/date.ts";
import { sanitizeText } from "../_shared/sanitize.ts";
import { logProviderError, logUnexpected } from "../_shared/log.ts";

// Pinned rather than `gemini-flash-latest` — see the note in kapy/index.ts.
// Override with a GEMINI_MODEL secret to switch without redeploying code.
const MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.7-flash";

// ~6 MB of base64, roughly a 4.5 MB photo. The app already compresses to
// quality 0.5, so a genuine receipt lands far under this; the cap is here so
// one account can't push arbitrarily large payloads through Gemini.
const MAX_BASE64 = 6_000_000;

// A merchant name is a few words. The cap is a security control, not
// cosmetics: this string is read off a photograph, so its content is chosen
// by whoever printed the receipt, and it later reaches a tool-calling model.
// Anything long enough to argue with a system prompt is not a merchant name.
const MAX_MERCHANT = 40;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return json(
      { error: "Scanning isn't configured yet — GEMINI_API_KEY is missing." },
      500
    );
  }

  let base64: string;
  let mimeType: string;
  let categories: string[];
  try {
    const body = await req.json();
    base64 = String(body?.base64 ?? "");
    mimeType = String(body?.mimeType ?? "image/jpeg");
    // The category list comes from the app so constants/categories.ts stays
    // the single source of truth — no duplicated list to drift out of sync.
    categories = Array.isArray(body?.categories) ? body.categories : [];
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  if (!base64) return json({ error: "No image provided." }, 400);
  if (base64.length > MAX_BASE64) {
    return json({ error: "That image is too large. Try a smaller photo." }, 413);
  }
  if (!ALLOWED_MIME.includes(mimeType)) {
    // Don't forward an arbitrary caller-supplied MIME type to Gemini.
    mimeType = "image/jpeg";
  }
  if (categories.length === 0) {
    return json({ error: "No category list provided." }, 400);
  }

  const prompt = `You are a receipt scanner for a Malaysian money-tracking app.
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

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: mimeType, data: base64 } },
                { text: prompt },
              ],
            },
          ],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );

    if (!res.ok) {
      await logProviderError("scan-receipt", res);
      return json({ error: "Couldn't read that receipt. Try again." }, 502);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

    // responseMimeType should give us clean JSON, but models occasionally
    // still wrap it in a ```json fence — strip and retry once before giving up.
    let parsed: any = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      try {
        parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      } catch {
        return json({ error: "Couldn't read that receipt. Try again." }, 502);
      }
    }

    const amount =
      typeof parsed.amount === "number"
        ? parsed.amount
        : parseFloat(parsed.amount) || null;

    return json({
      amount,
      // Cleaned here, at the point untrusted text enters the system, rather
      // than at each place it is later used — one of those places would
      // eventually be forgotten.
      merchant: sanitizeText(parsed.merchant, MAX_MERCHANT),
      // Validated again on the client against the real category list.
      category: categories.includes(parsed.category) ? parsed.category : "other",
      // Plain YYYY-MM-DD rather than a timestamp: the app builds a local Date
      // from the parts, so a receipt dated the 3rd never lands on the 2nd
      // because of a UTC conversion.
      date: validateDateString(parsed.date),
      confidence: validateConfidence(parsed.confidence),
    });
  } catch (e) {
    logUnexpected("scan-receipt", e);
    return json({ error: "Couldn't read that receipt. Try again." }, 500);
  }
});
