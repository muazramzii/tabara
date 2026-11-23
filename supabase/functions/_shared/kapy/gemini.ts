// Calling Gemini: bounded in time, retried only where that is safe, and with
// failures reported by kind instead of as one vague error.
//
// What was wrong before
// ---------------------
// The previous client had no timeout (a stalled request held the function until
// the platform killed it), no retry (one 503 was a failed chat), and treated
// every non-2xx identically. It also never read why a reply ended, so a reply
// cut off at the token limit or blocked by a safety filter looked like a normal
// one, and it never recorded token usage.
//
// Policy
// ------
// - One deadline for the whole request, passed in; every attempt and every wait
//   between attempts fits inside it.
// - Retry only transient failures: 429, 500, 502, 503, 504, a network error, or a
//   per-attempt timeout. Up to `maxAttempts` in total, exponential backoff with
//   jitter, honouring a short `Retry-After`. Never retry a 400 (our request is
//   wrong; trying again cannot fix it) or a 401/403 (the key is wrong).
// - A model call is a read: retrying cannot duplicate anything. (Database writes
//   never go through here.)
// - Blocked or empty replies are classified, not returned as if they were text.
// - Token usage is returned for telemetry.
//
// Everything that touches the outside world is injected, so the retry and
// timeout behaviour is tested with fake time rather than real waiting.

export interface ModelConfig {
  apiKey: string;
  model: string;
  /** Base URL up to and including `/models/`. Overridable for tests. */
  baseUrl?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export type Part = Record<string, unknown>;
export interface Content {
  role: string;
  parts: Part[];
}

export interface ModelRequest {
  system: string;
  contents: Content[];
  tools: unknown[];
}

export interface ModelUsage {
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface ModelTurn {
  content: Content;
  usage: ModelUsage;
  finishReason: string | null;
}

export type ModelErrorKind =
  | "timeout"
  | "rate_limited"
  | "unavailable"
  | "blocked"
  | "bad_response"
  | "invalid_request"
  | "auth";

export class ModelError extends Error {
  kind: ModelErrorKind;
  status: number | null;
  constructor(kind: ModelErrorKind, status: number | null = null) {
    super(`model_error:${kind}${status ? `:${status}` : ""}`);
    this.name = "ModelError";
    this.kind = kind;
    this.status = status;
  }
}

export interface CallOptions {
  fetch: typeof fetch;
  /** Absolute time (ms since epoch) by which everything must be finished. */
  deadline: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  maxAttempts?: number;
  /** Cap on a single attempt, so one stall cannot use the whole budget. */
  attemptTimeoutMs?: number;
  signal?: AbortSignal;
}

export const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/";
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_BACKOFF_MS = 4000;

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function backoffMs(attempt: number, random: () => number, retryAfterSec: number | null): number {
  if (retryAfterSec !== null && retryAfterSec >= 0 && retryAfterSec <= 3) return retryAfterSec * 1000;
  return Math.min(400 * 2 ** attempt + Math.floor(random() * 250), MAX_BACKOFF_MS);
}

function parseTurn(data: unknown): ModelTurn {
  const d = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
  const feedback = d.promptFeedback as { blockReason?: unknown } | undefined;
  if (feedback?.blockReason) throw new ModelError("blocked");

  const candidates = d.candidates;
  const cand = Array.isArray(candidates) ? (candidates[0] as Record<string, unknown> | undefined) : undefined;
  const finishReason = typeof cand?.finishReason === "string" ? cand.finishReason : null;
  if (finishReason === "SAFETY" || finishReason === "PROHIBITED_CONTENT" || finishReason === "BLOCKLIST" || finishReason === "SPII") {
    throw new ModelError("blocked");
  }

  const content = cand?.content as { role?: unknown; parts?: unknown } | undefined;
  const parts = Array.isArray(content?.parts) ? (content!.parts as Part[]) : [];
  if (parts.length === 0) throw new ModelError("bad_response");

  const u = (d.usageMetadata ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const prompt = n(u.promptTokenCount);
  const output = n(u.candidatesTokenCount);
  return {
    content: { role: "model", parts },
    usage: { promptTokens: prompt, outputTokens: output, totalTokens: n(u.totalTokenCount) || prompt + output },
    finishReason,
  };
}

export async function callGemini(cfg: ModelConfig, req: ModelRequest, opts: CallOptions): Promise<ModelTurn> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? realSleep;
  const random = opts.random ?? Math.random;
  const maxAttempts = opts.maxAttempts ?? 3;
  const attemptTimeout = opts.attemptTimeoutMs ?? 20_000;
  const url = `${cfg.baseUrl ?? DEFAULT_BASE_URL}${cfg.model}:generateContent`;

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: req.system }] },
    contents: req.contents,
    tools: req.tools,
    generationConfig: {
      // Low: this assistant states figures and fills tool arguments. Variety in
      // wording is not worth a wrong number. (Chosen, not measured.)
      temperature: cfg.temperature ?? 0.3,
      maxOutputTokens: cfg.maxOutputTokens ?? 800,
    },
  });

  let last: ModelError | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const remaining = opts.deadline - now();
    if (remaining <= 250) throw last ?? new ModelError("timeout");

    const signals = [AbortSignal.timeout(Math.min(attemptTimeout, remaining))];
    if (opts.signal) signals.push(opts.signal);

    let retryAfter: number | null = null;
    try {
      const res = await opts.fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // A header, not ?key=, so the secret never appears in a URL or a log.
          "x-goog-api-key": cfg.apiKey,
        },
        body,
        signal: AbortSignal.any(signals),
      });

      if (res.ok) {
        let data: unknown;
        try {
          data = await res.json();
        } catch {
          throw new ModelError("bad_response");
        }
        try {
          return parseTurn(data);
        } catch (e) {
          // An empty reply is worth one more try; a block is not.
          if (e instanceof ModelError && e.kind === "bad_response") {
            last = e;
            continue;
          }
          throw e;
        }
      }

      if (res.status === 400 || res.status === 404) throw new ModelError("invalid_request", res.status);
      if (res.status === 401 || res.status === 403) throw new ModelError("auth", res.status);
      if (RETRYABLE_STATUS.has(res.status)) {
        const ra = Number(res.headers.get("retry-after"));
        retryAfter = Number.isFinite(ra) && res.headers.get("retry-after") !== null ? ra : null;
        last = new ModelError(res.status === 429 ? "rate_limited" : "unavailable", res.status);
      } else {
        throw new ModelError("invalid_request", res.status);
      }
    } catch (e) {
      if (e instanceof ModelError) {
        if (e.kind === "invalid_request" || e.kind === "auth" || e.kind === "blocked") throw e;
        last = e;
      } else if (opts.signal?.aborted) {
        throw new ModelError("timeout");
      } else if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) {
        last = new ModelError("timeout");
      } else {
        // A network failure; transient.
        last = new ModelError("unavailable");
      }
    }

    if (attempt === maxAttempts - 1) break;
    const wait = backoffMs(attempt, random, retryAfter);
    // Do not start a wait that leaves no room for the next attempt.
    if (opts.deadline - now() < wait + 1000) break;
    await sleep(wait);
  }
  throw last ?? new ModelError("unavailable");
}
