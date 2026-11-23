// Turning failures into messages a person can read, and nothing more.
//
// The Supabase client hands back errors written for developers: Postgres
// constraint names, row contents (Postgres puts the failing row in `details`),
// provider messages, and — for Edge Functions — a generic "non-2xx status code"
// that hides the message the function actually sent. Showing those is both
// unhelpful and a leak, so every error that can reach a screen goes through
// here first.
//
// The rule: a message is only ever *chosen* by this file or by our own Edge
// Functions. An unrecognised error becomes a generic one; its text is never
// passed through.
//
// No React Native imports, so the logic is testable under Node.

export const GENERIC_ERROR = "Something went wrong. Please try again.";
export const NETWORK_ERROR = "Couldn't reach the server. Check your connection and try again.";
export const SESSION_EXPIRED = "Your session expired. Please log in again.";
const UNAVAILABLE = "The service is temporarily unavailable. Try again in a moment.";

/** An error whose `message` is safe to show. The original is kept as `cause`. */
export class AppError extends Error {
  code: string;
  constructor(message: string, code = "app_error", cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "AppError";
    this.code = code;
  }
}

type Loose = {
  name?: unknown;
  code?: unknown;
  status?: unknown;
  message?: unknown;
  context?: unknown;
};

const asLoose = (e: unknown): Loose =>
  typeof e === "object" && e !== null ? (e as Loose) : {};

const text = (v: unknown) => (typeof v === "string" ? v : "");

function isNetworkFailure(e: unknown): boolean {
  const { name, message } = asLoose(e);
  if (name === "FunctionsFetchError" || name === "AuthRetryableFetchError") return true;
  return /network request failed|failed to fetch|fetch failed|networkerror|load failed|timed out/i.test(
    text(message)
  );
}

// Which rule was broken is read from the constraint's name (the migration that
// adds each one is supabase/migrations/20261122100000_*). Only the *name* is
// matched — the original text is never returned.
const CONSTRAINT_MESSAGES: [RegExp, string][] = [
  [/transactions_amount_max_chk/, "That amount is too large."],
  [/transactions_amount_check/, "Enter an amount greater than zero."],
  [/transactions_category_format_chk/, "That category isn't valid."],
  [/transactions_note_length_chk/, "That note is too long."],
  [/transactions_date_range_chk/, "That date isn't valid."],
  [/profiles_income_nonneg_chk|profiles_savings_goal_nonneg_chk/, "Amounts can't be negative."],
  [/profiles_username_length_chk/, "That name isn't valid. Use 2–20 characters."],
  [/profiles_budgets_valid_chk/, "Budgets must be amounts of zero or more."],
  [/transactions_type_check/, "That transaction type isn't valid."],
];

/** Maps a Postgres / PostgREST error to a safe message and a stable code. */
function describeDatabaseError(e: unknown, fallback: string): { message: string; code: string } {
  if (isNetworkFailure(e)) return { message: NETWORK_ERROR, code: "network" };

  const { code, message } = asLoose(e);
  const sqlstate = text(code);

  switch (sqlstate) {
    case "23514": {
      const hit = CONSTRAINT_MESSAGES.find(([re]) => re.test(text(message)));
      return { message: hit ? hit[1] : "Some of those values aren't allowed.", code: "invalid_value" };
    }
    case "22003":
      return { message: "That number is too large.", code: "invalid_value" };
    case "22P02":
      return { message: "Some of those values aren't valid.", code: "invalid_value" };
    case "23502":
      return { message: "A required field is missing.", code: "invalid_value" };
    case "23503":
      return { message: "We couldn't find your account. Please log in again.", code: "no_account" };
    case "23505":
      return { message: "That already exists.", code: "conflict" };
    case "42501":
      return { message: "You don't have permission to do that.", code: "forbidden" };
    case "PGRST301":
    case "PGRST303":
      return { message: SESSION_EXPIRED, code: "session_expired" };
    case "57014":
      return { message: "That took too long. Please try again.", code: "timeout" };
  }
  if (/jwt (expired|invalid)|invalid jwt/i.test(text(message))) {
    return { message: SESSION_EXPIRED, code: "session_expired" };
  }
  return { message: fallback, code: "unknown" };
}

/**
 * Converts anything thrown by a Supabase database call into an `AppError`
 * whose message is safe to display.
 */
export function toSafeError(e: unknown, fallback = GENERIC_ERROR): AppError {
  if (e instanceof AppError) return e;
  const { message, code } = describeDatabaseError(e, fallback);
  return new AppError(message, code, e);
}

/** The user-facing text for an HTTP status from an Edge Function. */
export function messageForStatus(status: number): string {
  if (status === 400) return "That request wasn't valid. Please try again.";
  if (status === 401 || status === 403) return SESSION_EXPIRED;
  if (status === 404) return "That isn't available any more.";
  if (status === 413) return "That file is too large. Try a smaller one.";
  if (status === 415) return "That file type isn't supported.";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if (status === 503) return UNAVAILABLE;
  if (status === 504) return "That took too long. Please try again.";
  if (status >= 500) return "Something went wrong on our side. Please try again in a moment.";
  return GENERIC_ERROR;
}

/**
 * A message sent by one of our own Edge Functions, if it is fit to show.
 * They write short, user-facing sentences (`{ error: "..." }`); anything long,
 * multi-line or non-string is not one of those, so it is dropped.
 */
export function safeServerMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return null;
  // Control characters are unprintable; no stack trace fits on one clean line.
  for (const ch of trimmed) {
    const c = ch.codePointAt(0) as number;
    if (c < 0x20 || c === 0x7f) return null;
  }
  return trimmed;
}

type ResponseLike = { status?: unknown; clone?: () => ResponseLike; json?: () => Promise<unknown> };

async function readBodyError(context: unknown): Promise<{ status: number | null; message: string | null }> {
  const res = (typeof context === "object" && context !== null ? context : {}) as ResponseLike;
  const status = typeof res.status === "number" ? res.status : null;
  try {
    // clone(): the body can only be read once, and the caller may want it.
    const source = typeof res.clone === "function" ? res.clone() : res;
    const body = (await source.json?.()) as { error?: unknown } | null;
    return { status, message: safeServerMessage(body?.error) };
  } catch {
    return { status, message: null };
  }
}

/**
 * Converts the error from `supabase.functions.invoke` into an `AppError`.
 *
 * supabase-js reports any non-2xx response as a generic "Edge Function returned
 * a non-2xx status code" and keeps the real response in `error.context`; this
 * reads it, so a person sees "That image is too large" instead.
 */
export async function toSafeFunctionError(e: unknown, fallback = GENERIC_ERROR): Promise<AppError> {
  if (e instanceof AppError) return e;
  const { name, context } = asLoose(e);

  if (name === "FunctionsFetchError" || isNetworkFailure(e)) {
    return new AppError(NETWORK_ERROR, "network", e);
  }
  if (name === "FunctionsRelayError") {
    return new AppError(UNAVAILABLE, "unavailable", e);
  }
  if (name === "FunctionsHttpError") {
    const { status, message } = await readBodyError(context);
    return new AppError(message ?? (status !== null ? messageForStatus(status) : fallback), "http_error", e);
  }
  return new AppError(fallback, "unknown", e);
}
