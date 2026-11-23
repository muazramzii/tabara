// Per-user request quotas for the AI endpoints.
//
// Before this, nothing limited how often a signed-in account could call Kapy or
// the receipt scanner; sign-up is open, so anyone could spend the Gemini budget.
// Each request now consumes one unit from two fixed windows — one minute (burst)
// and one Malaysian day (volume) — through the `ai_consume` database function
// (see supabase/migrations/20261122120000_*). That function:
//   - takes the user from the JWT (auth.uid()), never from an argument, so a
//     caller cannot spend or reset someone else's allowance;
//   - increments atomically, and refuses without incrementing once the cap is hit;
//   - is the only way to touch the counters (RLS denies the table to everyone).
//
// Failure policy: if the quota function is MISSING (the migration has not been
// applied yet) the request is allowed and the gap is logged, so deploying code
// before the migration does not take Kapy down. Any OTHER failure refuses the
// request: unknown is not "allowed".

export type QuotaKind = "kapy" | "kapy_confirm" | "scan";

export interface QuotaLimits {
  perMinute: number;
  perDay: number;
}

export const DEFAULT_LIMITS: Record<QuotaKind, QuotaLimits> = {
  kapy: { perMinute: 10, perDay: 150 },
  kapy_confirm: { perMinute: 20, perDay: 300 },
  scan: { perMinute: 6, perDay: 60 },
};

/** Seconds added to UTC so the daily window resets at midnight in Malaysia. */
export const MYT_OFFSET_SECONDS = 8 * 3600;

/** Reads optional overrides such as KAPY_RATE_PER_MINUTE; anything out of range is ignored. */
export function limitsFromEnv(kind: QuotaKind, env: (k: string) => string | undefined): QuotaLimits {
  const base = DEFAULT_LIMITS[kind];
  const prefix = kind === "kapy" ? "KAPY" : kind === "kapy_confirm" ? "KAPY_CONFIRM" : "SCAN";
  const read = (suffix: string, fallback: number) => {
    const raw = env(`${prefix}_RATE_${suffix}`);
    const n = raw === undefined ? NaN : Number(raw);
    return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n : fallback;
  };
  return { perMinute: read("PER_MINUTE", base.perMinute), perDay: read("PER_DAY", base.perDay) };
}

export type QuotaResult =
  | { allowed: true; unavailable: boolean }
  | { allowed: false; reason: "limit"; window: "minute" | "day"; retryAfterSec: number }
  | { allowed: false; reason: "error"; retryAfterSec: number };

interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

const code = (e: unknown) => String((e as { code?: unknown } | null)?.code ?? "");
/** PostgREST: no such function in the schema cache; Postgres: undefined_function. */
const isMissingFunction = (e: unknown) => code(e) === "PGRST202" || code(e) === "42883";

async function consumeWindow(
  client: RpcClient,
  kind: QuotaKind,
  seconds: 60 | 86400,
  max: number,
  offset: number
): Promise<{ allowed: boolean; retryAfterSec: number } | "missing" | "error"> {
  const { data, error } = await client.rpc("ai_consume", {
    p_kind: kind,
    p_window_seconds: seconds,
    p_max: max,
    p_offset_seconds: offset,
  });
  if (error) return isMissingFunction(error) ? "missing" : "error";
  const d = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
  if (typeof d.allowed !== "boolean") return "error";
  const retry = typeof d.retry_after_seconds === "number" && Number.isFinite(d.retry_after_seconds) ? Math.max(0, Math.ceil(d.retry_after_seconds)) : 0;
  return { allowed: d.allowed, retryAfterSec: retry };
}

export async function consumeQuota(client: RpcClient, kind: QuotaKind, limits: QuotaLimits): Promise<QuotaResult> {
  const minute = await consumeWindow(client, kind, 60, limits.perMinute, 0);
  if (minute === "missing") return { allowed: true, unavailable: true };
  if (minute === "error") return { allowed: false, reason: "error", retryAfterSec: 5 };
  if (!minute.allowed) return { allowed: false, reason: "limit", window: "minute", retryAfterSec: Math.max(1, minute.retryAfterSec) };

  const day = await consumeWindow(client, kind, 86400, limits.perDay, MYT_OFFSET_SECONDS);
  if (day === "missing") return { allowed: true, unavailable: true };
  if (day === "error") return { allowed: false, reason: "error", retryAfterSec: 5 };
  if (!day.allowed) return { allowed: false, reason: "limit", window: "day", retryAfterSec: Math.max(1, day.retryAfterSec) };

  return { allowed: true, unavailable: false };
}
