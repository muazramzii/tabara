// Operational metrics for Kapy, as one structured log line per request.
//
// What is recorded: counts, durations, token totals, enumerated outcomes.
// What is NOT, ever: the user's message, the model's reply, amounts, categories,
// notes, merchant names or the user id. A log of "how many tool calls failed" is
// useful operationally; a log of what someone spent is a privacy incident.
// `assertSafeMetrics` makes that property checkable: every value in the event is
// a number, a boolean, or one of a fixed set of words, and tests enforce it.
//
// Where they go: Supabase Edge Function logs (Dashboard -> Edge Functions -> kapy
// -> Logs), one JSON line each, easy to filter on `"evt":"kapy.request"`.
// Nothing is written to the database.

import type { Lang } from "./language.ts";
import type { Intent } from "./intent.ts";

export type Outcome =
  | "ok"
  | "proposal"
  | "needs_clarification"
  | "grounding_repaired"
  | "grounding_fallback"
  | "claim_repaired"
  | "claim_fallback"
  | "tool_budget_exhausted"
  | "rounds_exhausted"
  | "model_error"
  | "model_timeout"
  | "model_blocked"
  | "rate_limited"
  | "bad_request";

export interface RequestMetrics {
  evt: "kapy.request";
  protocol: 1 | 2;
  lang: Lang;
  intent: Intent;
  /** Rounded to one decimal so it cannot fingerprint a message. */
  intentConfidence: number;
  rounds: number;
  modelCalls: number;
  toolCalls: Record<string, { ok: number; fail: number }>;
  toolCallsTotal: number;
  tokens: { prompt: number; output: number; total: number };
  ms: { total: number; model: number; tools: number };
  outcome: Outcome;
  grounding: { checked: boolean; failures: number; repaired: boolean; fellBack: boolean };
  claimRepairs: number;
  dataTruncated: boolean;
  storeErrors: number;
  quotaUnavailable: boolean;
  proposed: boolean;
}

export function newMetrics(protocol: 1 | 2): RequestMetrics {
  return {
    evt: "kapy.request",
    protocol,
    lang: "unknown",
    intent: "unknown",
    intentConfidence: 0,
    rounds: 0,
    modelCalls: 0,
    toolCalls: {},
    toolCallsTotal: 0,
    tokens: { prompt: 0, output: 0, total: 0 },
    ms: { total: 0, model: 0, tools: 0 },
    outcome: "ok",
    grounding: { checked: false, failures: 0, repaired: false, fellBack: false },
    claimRepairs: 0,
    dataTruncated: false,
    storeErrors: 0,
    quotaUnavailable: false,
    proposed: false,
  };
}

export function recordTool(m: RequestMetrics, name: string, ok: boolean) {
  const e = (m.toolCalls[name] ??= { ok: 0, fail: 0 });
  if (ok) e.ok++;
  else e.fail++;
  m.toolCallsTotal++;
}

/** Other events, for rate limiting and confirmation. Counts and enums only. */
export interface SimpleEvent {
  evt: "kapy.rate_limited" | "kapy.confirm" | "kapy.auth_failed" | "kapy.quota_unavailable";
  [key: string]: string | number | boolean;
}

const ALLOWED_STRING_KEYS = new Set([
  "evt", "lang", "intent", "outcome", "status", "reason", "kind", "window", "code",
]);

/**
 * Throws if an event could carry personal content: a string anywhere other than
 * a short enumerated field, or any string that is long or contains spaces.
 */
export function assertSafeMetrics(event: unknown, path = ""): void {
  if (event === null || typeof event === "number" || typeof event === "boolean") return;
  if (typeof event === "string") {
    const key = path.split(".").pop() ?? "";
    const leaf = key.replace(/\[\d+\]$/, "");
    if (!ALLOWED_STRING_KEYS.has(leaf) && !/^(?:toolCalls)\./.test(path)) {
      throw new Error(`unsafe string at ${path}`);
    }
    if (event.length > 40 || /\s/.test(event)) throw new Error(`unsafe string value at ${path}`);
    return;
  }
  if (Array.isArray(event)) {
    event.forEach((v, i) => assertSafeMetrics(v, `${path}[${i}]`));
    return;
  }
  if (typeof event === "object") {
    for (const [k, v] of Object.entries(event as Record<string, unknown>)) {
      // Keys are tool names or fixed field names, never content.
      if (k.length > 40 || /\s/.test(k)) throw new Error(`unsafe key ${k}`);
      assertSafeMetrics(v, path ? `${path}.${k}` : k);
    }
    return;
  }
  throw new Error(`unsupported value at ${path}`);
}

export type Logger = (line: string) => void;

export function emit(log: Logger, event: RequestMetrics | SimpleEvent): void {
  let line: string;
  try {
    assertSafeMetrics(event);
    line = JSON.stringify(event);
  } catch {
    // Never log an event that could carry personal content.
    line = JSON.stringify({ evt: "kapy.metrics_dropped" });
  }
  try {
    log(line);
  } catch {
    // A broken log sink must never affect a request.
  }
}
