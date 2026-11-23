import { CATEGORIES } from "../constants/categories";
import { AppError, GENERIC_ERROR, safeServerMessage, toSafeFunctionError } from "./errors";
import {
  parseConfirmation,
  parseReply,
  type Confirmation,
  type KapyMessage,
  type Proposal,
} from "./kapy-chat";
import { supabase } from "./supabase";

// The Gemini API key used to live in .env with an EXPO_PUBLIC_ prefix, which
// meant it shipped inside the app bundle where anyone could extract it from
// the APK. It now lives in a Supabase secret, and these two functions call
// Edge Functions instead of Google directly. Same signatures as before, so
// the screens calling them didn't have to change.
//
// supabase.functions.invoke attaches the logged-in user's token automatically,
// and the functions authenticate it themselves (supabase/functions/_shared/auth.ts).

/**
 * Unwraps an Edge Function response, turning every failure into a thrown
 * `AppError` whose message is safe to show.
 *
 * Our functions answer failures with a non-2xx status and `{ error, code }`.
 * supabase-js reports every non-2xx as a generic "non-2xx status code" error
 * and leaves the real response in `error.context`, so the message has to be
 * read from there (see errors.ts) — otherwise "Your session expired" or "That
 * image is too large" would never reach the person.
 */
async function callFunction<T>(
  name: string,
  body: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });

  if (error) throw await toSafeFunctionError(error);
  // A 2xx that still carries an error message: keep it only if it is fit to show.
  if (data?.error) {
    throw new AppError(safeServerMessage(data.error) ?? GENERIC_ERROR, "function_error");
  }
  if (!data) throw new AppError(GENERIC_ERROR, "empty_response");

  return data as T;
}

export interface ReceiptResult {
  amount: number | null;
  merchant: string | null;
  category: string;
  /** Date printed on the receipt. Null when unreadable — caller uses today. */
  date: Date | null;
  /** 0–1 from the model, or null when it didn't give a usable number. */
  confidence: number | null;
}

/**
 * Builds a local Date from a YYYY-MM-DD string.
 *
 * Deliberately not `new Date("2026-08-03")` — that parses as UTC midnight, so
 * anywhere west of Greenwich the receipt lands on the previous day. Passing
 * the parts to the constructor keeps it on the date actually printed.
 */
function localDateFrom(raw: unknown): Date | null {
  if (typeof raw !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export async function scanReceipt(
  base64: string,
  mimeType = "image/jpeg"
): Promise<ReceiptResult> {
  // The wire shape isn't the return shape — date arrives as a string.
  const result = await callFunction<{
    amount: unknown;
    merchant: string | null;
    category: string;
    date: unknown;
    confidence: unknown;
  }>("scan-receipt", {
    base64,
    mimeType,
    // Sent from here so constants/categories.ts stays the single source of
    // truth — the function never keeps its own copy of the list.
    categories: CATEGORIES.map((c) => c.id),
  });

  // Trust but verify: re-check the category against the real list in case the
  // model returned something unexpected. A receipt is always an expense, so
  // only the expense list is valid here.
  const category = CATEGORIES.some((c) => c.id === result.category)
    ? result.category
    : "other";

  // The function already range-checks the date, but parse defensively here
  // too — this layer must hold up on its own, not because the server happened
  // to behave.
  const date = localDateFrom(result.date);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const confidence =
    typeof result.confidence === "number" && Number.isFinite(result.confidence)
      ? Math.min(Math.max(result.confidence, 0), 1)
      : null;

  return {
    amount: typeof result.amount === "number" ? result.amount : null,
    merchant: result.merchant ?? null,
    category,
    date: date && date <= tomorrow ? date : null,
    confidence,
  };
}

export type { KapyMessage } from "./kapy-chat";

export interface KapyReply {
  reply: string;
  /** Opaque: what the server wants remembered about the conversation. Send it back as it is. */
  context: Record<string, unknown> | null;
  /** A transaction for the person to confirm. Nothing is saved until they do. */
  proposal: Proposal | null;
}

/**
 * One chat turn. The server reads the user's real figures itself, from the
 * database, for every question: this sends no financial summary and no category
 * list, so there is nothing stale to trust and nothing to tamper with.
 */
export async function askKapy(history: KapyMessage[], context: Record<string, unknown> | null): Promise<KapyReply> {
  const raw = await callFunction<unknown>("kapy", { protocol: 2, history, context });
  const parsed = parseReply(raw);
  if (!parsed) throw new AppError("Kapy didn't send a usable answer. Please try again.", "bad_reply");
  return parsed;
}

/**
 * Saves a transaction the person confirmed. Safe to call again with the same
 * proposal (a double tap, a retry after a lost response): the server answers
 * "already_recorded" instead of saving twice.
 */
export async function confirmKapyTransaction(proposal: Proposal): Promise<NonNullable<Confirmation>> {
  const raw = await callFunction<unknown>("kapy", { action: "confirm_transaction", proposal });
  const parsed = parseConfirmation(raw);
  if (!parsed) throw new AppError("Couldn't confirm that it was saved. Check History before trying again.", "bad_confirmation");
  return parsed;
}
