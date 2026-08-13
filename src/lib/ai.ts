import { CATEGORIES } from "../constants/categories";
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
}

export async function scanReceipt(
  base64: string,
  mimeType = "image/jpeg"
): Promise<ReceiptResult> {
  const result = await callFunction<ReceiptResult>("scan-receipt", {
    base64,
    mimeType,
    // Sent from here so constants/categories.ts stays the single source of
    // truth — the function never keeps its own copy of the list.
    categories: CATEGORIES.map((c) => c.id),
  });

  // Trust but verify: re-check the category against the real list in case the
  // model returned something unexpected.
  const category = CATEGORIES.some((c) => c.id === result.category)
    ? result.category
    : "other";

  return {
    amount: typeof result.amount === "number" ? result.amount : null,
    merchant: result.merchant ?? null,
    category,
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
    // Kapy can record transactions, so it needs the valid category ids to
    // choose from. Sent from here so constants/categories.ts stays the single
    // source of truth.
    categories: CATEGORIES.map((c) => c.id),
  });
  return reply?.trim() || "Hmm, I blanked out 🦫 try again?";
}
