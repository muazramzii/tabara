// Reading the user's own financial data, server-side.
//
// Authorisation is not done here. The client passed in is built from the
// caller's own JWT (see handler.ts), so Postgres Row Level Security decides
// what a query can see — a bug in this file cannot widen it. The explicit
// `user_id` filter is belt and braces, and so that the planner can use the
// (user_id, date) index; it is the id from the *verified token*, never one the
// request supplied.
//
// Minimum data: aggregate questions fetch only id, amount, type, category and
// date. Free-text notes are fetched only when the person asked to see
// transactions, and only a handful of them.
//
// Pagination matters. The Supabase API caps a response (1000 rows by default),
// so a "month total" computed from one page would be silently short for a busy
// month. Pages are fetched until the data runs out, up to a hard ceiling, and
// if the ceiling is hit the result says `truncated` so no one reports a total
// that is known to be incomplete.

import { normalizeProfile, type Profile } from "./finance.ts";

/** Just enough of supabase-js to query with; keeps this file free of `npm:` imports. */
// deno-lint-ignore no-explicit-any
export type SupabaseLike = { from(table: string): any };

export const PAGE_SIZE = 1000;
export const MAX_PAGES = 10;
export const MAX_DETAIL_ROWS = 10;

export class StoreError extends Error {
  /** A Postgres/PostgREST code only — never the message, which can quote rows. */
  code: string;
  constructor(code: string) {
    super(`store_error:${code}`);
    this.name = "StoreError";
    this.code = code;
  }
}

export interface TxnQuery {
  startUtc: string;
  endUtc: string;
  category?: string;
  type?: "expense" | "income";
  /** Include notes and return at most `limit` rows, newest first. */
  detail?: { limit: number };
}

export interface FinanceStore {
  /** The caller's profile, or null if they have none yet. */
  profile(): Promise<Profile | null>;
  transactions(q: TxnQuery): Promise<{ rows: unknown[]; truncated: boolean }>;
}

const AGGREGATE_COLUMNS = "id, amount, type, category, date";
const DETAIL_COLUMNS = "id, amount, type, category, note, date";

export function makeSupabaseStore(
  client: SupabaseLike,
  userId: string,
  limits: { pageSize?: number; maxPages?: number } = {}
): FinanceStore {
  const pageSize = limits.pageSize ?? PAGE_SIZE;
  const maxPages = limits.maxPages ?? MAX_PAGES;

  // A fresh builder per request: supabase-js builders are single-use.
  const build = (q: TxnQuery) => {
    let b = client
      .from("transactions")
      .select(q.detail ? DETAIL_COLUMNS : AGGREGATE_COLUMNS)
      .eq("user_id", userId)
      .gte("date", q.startUtc)
      .lt("date", q.endUtc);
    if (q.category) b = b.eq("category", q.category);
    if (q.type) b = b.eq("type", q.type);
    // A stable total order, so pages never overlap or skip.
    return b.order("date", { ascending: false }).order("id", { ascending: false });
  };

  return {
    async profile() {
      const { data, error } = await client
        .from("profiles")
        .select("income, savings_goal, budgets")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw new StoreError(String(error.code ?? "unknown"));
      return data ? normalizeProfile(data) : null;
    },

    async transactions(q) {
      if (q.detail) {
        const limit = Math.max(1, Math.min(q.detail.limit, MAX_DETAIL_ROWS));
        const { data, error } = await build(q).limit(limit);
        if (error) throw new StoreError(String(error.code ?? "unknown"));
        return { rows: data ?? [], truncated: false };
      }

      const rows: unknown[] = [];
      const seen = new Set<string>();
      let lastPageFull = false;
      for (let page = 0; page < maxPages; page++) {
        const from = page * pageSize;
        const { data, error } = await build(q).range(from, from + pageSize - 1);
        if (error) throw new StoreError(String(error.code ?? "unknown"));
        const batch: unknown[] = data ?? [];
        for (const row of batch) {
          // New rows arriving mid-read can shift offsets; never count one twice.
          const id = (row as { id?: unknown }).id;
          if (typeof id === "string") {
            if (seen.has(id)) continue;
            seen.add(id);
          }
          rows.push(row);
        }
        lastPageFull = batch.length === pageSize;
        if (!lastPageFull) return { rows, truncated: false };
      }
      return { rows, truncated: lastPageFull };
    },
  };
}
