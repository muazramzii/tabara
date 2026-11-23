// Saving a transaction — the only write Kapy can cause, and only after the person
// has seen it and confirmed it.
//
// The flow
// --------
//   1. The model calls `propose_transaction`. Nothing is written. The server
//      returns a `Proposal` (below) with a fresh `requestId`.
//   2. The app shows a confirmation card: amount, category, date, note.
//   3. The person taps Confirm. The app calls this module via the function's
//      `confirm_transaction` action, sending the proposal back.
//   4. The row is inserted with the caller's own client (so Row Level Security
//      applies) and the reply is built from the row the DATABASE returns. Kapy
//      never says "saved" before this succeeds.
//
// Why confirmation is not an authorisation check
// ----------------------------------------------
// The client sends the proposal back, so a modified client could send anything.
// That is fine: it could equally insert its own rows through the REST API, which
// RLS permits for its own data. The confirmation exists to protect the person
// from a MISTAKE — a mishearing, a prompt-injected receipt — not from
// themselves. What the server guarantees is that the model alone can never
// cause a write, and that whatever is written has passed the same validation as
// everything else.
//
// Duplicates
// ----------
// `requestId` is stored in transactions.client_request_id, under a unique index
// per user. Tapping Confirm twice, a retry after a lost response, or a replayed
// request all hit that index; the second is answered with the existing row
// ("already recorded") and nothing is inserted twice.

import { validateAmount } from "../amount.ts";
import { validateDateString, toTimestamp } from "../date.ts";
import { sanitizeText } from "../sanitize.ts";
import { categoryLabel, isValidCategoryFor } from "./categories.ts";
import { formatSen, toSen } from "./money.ts";
import { dateLabel, mytParts } from "./period.ts";
import type { SupabaseLike } from "./store.ts";

export const MAX_NOTE = 80;

/** What the app shows for confirmation, and sends back to save. */
export interface Proposal {
  requestId: string;
  /** Ringgit. */
  amount: number;
  formatted: string;
  currency: "MYR";
  type: "expense" | "income";
  category: string;
  categoryLabel: string;
  /** YYYY-MM-DD in Malaysia time. */
  date: string;
  dateLabel: string;
  note: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildProposal(input: {
  requestId: string;
  amountSen: number;
  type: "expense" | "income";
  category: string;
  /** null = today */
  date: string | null;
  note: string | null;
  now: number;
}): Proposal {
  const date = input.date ?? mytParts(input.now).date;
  return {
    requestId: input.requestId,
    amount: input.amountSen / 100,
    formatted: formatSen(input.amountSen),
    currency: "MYR",
    type: input.type,
    category: input.category,
    categoryLabel: categoryLabel(input.category),
    date,
    dateLabel: dateLabel(date),
    note: input.note,
  };
}

export interface SavedTransaction {
  id: string;
  amount: number;
  formatted: string;
  type: "expense" | "income";
  category: string;
  categoryLabel: string;
  note: string | null;
  /** YYYY-MM-DD in Malaysia time, as stored. */
  date: string;
  dateLabel: string;
}

export type ConfirmResult =
  | { status: "recorded"; transaction: SavedTransaction }
  | { status: "already_recorded"; transaction: SavedTransaction | null }
  | { status: "invalid"; reason: string }
  | { status: "rejected"; reason: "database_rule" | "forbidden" }
  | { status: "failed"; reason: "unavailable" | "schema_outdated" | "unknown" };

type Parsed =
  | { ok: true; requestId: string; amountSen: number; type: "expense" | "income"; category: string; date: string | null; note: string | null }
  | { ok: false; reason: string };

/** Validates a proposal sent back by the client. Nothing in it is trusted. */
export function parseConfirmation(raw: unknown): Parsed {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, reason: "malformed" };
  const r = raw as Record<string, unknown>;

  if (typeof r.requestId !== "string" || !UUID.test(r.requestId)) return { ok: false, reason: "invalid_request_id" };
  const amount = validateAmount(r.amount);
  const sen = amount === null ? null : toSen(amount);
  if (sen === null) return { ok: false, reason: "invalid_amount" };
  if (r.type !== "expense" && r.type !== "income") return { ok: false, reason: "invalid_type" };
  if (typeof r.category !== "string" || !isValidCategoryFor(r.type, r.category)) return { ok: false, reason: "invalid_category" };

  let date: string | null = null;
  if (r.date !== undefined && r.date !== null && r.date !== "") {
    date = validateDateString(r.date);
    if (!date) return { ok: false, reason: "invalid_date" };
  }
  return {
    ok: true,
    requestId: r.requestId.toLowerCase(),
    amountSen: sen,
    type: r.type,
    category: r.category,
    date,
    note: sanitizeText(r.note, MAX_NOTE),
  };
}

function toSaved(row: Record<string, unknown>): SavedTransaction | null {
  const sen = toSen(row.amount);
  if (sen === null || typeof row.id !== "string" || typeof row.date !== "string") return null;
  const type = row.type === "income" ? "income" : "expense";
  const category = typeof row.category === "string" ? row.category : "other";
  const date = mytParts(new Date(row.date).getTime()).date;
  return {
    id: row.id,
    amount: sen / 100,
    formatted: formatSen(sen),
    type,
    category,
    categoryLabel: categoryLabel(category),
    note: typeof row.note === "string" ? row.note : null,
    date,
    dateLabel: dateLabel(date),
  };
}

const COLUMNS = "id, amount, type, category, note, date, client_request_id";

/**
 * Saves a confirmed transaction for `userId` using a client bound to that user's
 * token. Returns what the database actually stored.
 */
export async function confirmTransaction(
  client: SupabaseLike,
  userId: string,
  raw: unknown,
  now: number
): Promise<ConfirmResult & { code?: string }> {
  const p = parseConfirmation(raw);
  if (!p.ok) return { status: "invalid", reason: p.reason };

  // A transaction dated today keeps the time it was confirmed at, as the Add
  // screen does; one dated another day is stored at noon UTC so it displays on
  // that day in every time zone.
  const today = mytParts(now).date;
  const when = p.date === null || p.date === today ? new Date(now).toISOString() : toTimestamp(p.date);

  const { data, error } = await client
    .from("transactions")
    .insert({
      user_id: userId,
      amount: p.amountSen / 100,
      type: p.type,
      category: p.category,
      note: p.note,
      date: when,
      client_request_id: p.requestId,
    })
    .select(COLUMNS)
    .single();

  if (!error) {
    const saved = data ? toSaved(data as Record<string, unknown>) : null;
    // An insert that reports success but returns nothing usable is not a confirmation.
    return saved ? { status: "recorded", transaction: saved } : { status: "failed", reason: "unknown" };
  }

  const code = String((error as { code?: unknown }).code ?? "unknown");

  if (code === "23505") {
    // The same confirmation arrived before. Report what was stored then.
    const { data: existing } = await client
      .from("transactions")
      .select(COLUMNS)
      .eq("user_id", userId)
      .eq("client_request_id", p.requestId)
      .maybeSingle();
    return { status: "already_recorded", transaction: existing ? toSaved(existing as Record<string, unknown>) : null, code };
  }
  if (code === "42501") return { status: "rejected", reason: "forbidden", code };
  if (code === "23514" || code === "22003" || code === "23502" || code === "22P02") {
    return { status: "rejected", reason: "database_rule", code };
  }
  // 42703 / PGRST204: the client_request_id column does not exist yet, i.e. the
  // migration has not been applied. Distinguished so it is easy to diagnose.
  if (code === "42703" || code === "PGRST204") return { status: "failed", reason: "schema_outdated", code };
  return { status: "failed", reason: "unavailable", code };
}
