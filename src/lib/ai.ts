import { ALL_CATEGORIES, CATEGORIES } from "../constants/categories";
import { supabase } from "./supabase";

// The Gemini API key used to live in .env with an EXPO_PUBLIC_ prefix, which
// meant it shipped inside the app bundle where anyone could extract it from
// the APK. It now lives in a Supabase secret, and these two functions call
// Edge Functions instead of Google directly. Same signatures as before, so
// the screens calling them didn't have to change.
//
// supabase.functions.invoke attaches the logged-in user's token automatically,
// and the functions reject unauthenticated callers.

/** Unwraps an Edge Function response, turning either failure mode into a throw. */
async function callFunction<T>(
  name: string,
  body: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });

  // A non-2xx status arrives as `error`; a handled failure arrives as
  // `data.error` with a message worth showing the user.
  if (error) throw new Error(error.message ?? `${name} failed.`);
  if (data?.error) throw new Error(data.error);
  if (!data) throw new Error(`${name} returned nothing.`);

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

export interface KapyMessage {
  role: "user" | "model";
  text: string;
}

export async function askKapy(
  history: KapyMessage[],
  financialSummary: string
): Promise<string> {
  const { reply } = await callFunction<{ reply: string }>("kapy", {
    history,
    financialSummary,
    // Kapy records income as well as expenses ("dapat gaji 2000"), so it needs
    // both lists — otherwise a salary would have to be filed under a spending
    // category. Sent from here so constants/categories.ts stays the single
    // source of truth.
    categories: ALL_CATEGORIES.map((c) => c.id),
  });
  return reply?.trim() || "Hmm, I blanked out 🦫 try again?";
}
