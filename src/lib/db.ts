import { supabase } from "./supabase";

export type TxnType = "expense" | "income";

export interface Transaction {
  id: string;
  amount: number;
  type: TxnType;
  category: string;
  note?: string;
  date: Date;
}

export interface UserProfile {
  income: number;
  savingsGoal: number;
  budgets?: Record<string, number>; // categoryId -> monthly limit
  /** What the app calls you. Set at signup; a display name, not an identifier. */
  username?: string;
}

// Postgres uses snake_case, the app uses camelCase — map at this boundary
// so no screen has to care about column names.
type TransactionRow = {
  id: string;
  amount: number | string;
  type: string;
  category: string | null;
  note: string | null;
  date: string;
};

function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    amount: Number(row.amount) || 0,
    type: (row.type === "income" ? "income" : "expense") as TxnType,
    category: row.category ?? "other",
    note: row.note ?? undefined,
    date: row.date ? new Date(row.date) : new Date(),
  };
}

// ── Profile ──────────────────────────────────────────────
export async function saveUserProfile(uid: string, p: UserProfile) {
  // Only send the fields we were given. Postgres leaves untouched columns
  // alone on conflict, which preserves Firestore's merge:true behaviour —
  // saving income here won't wipe budgets saved elsewhere.
  const payload: Record<string, unknown> = {
    id: uid,
    income: p.income,
    savings_goal: p.savingsGoal,
    updated_at: new Date().toISOString(),
  };
  if (p.budgets) payload.budgets = p.budgets;
  // Same reasoning as budgets: only send it when we were actually given one,
  // so saving income from onboarding can't blank the name set at signup.
  if (p.username !== undefined) payload.username = p.username;

  const { error } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("income, savings_goal, budgets, username")
    .eq("id", uid)
    .maybeSingle(); // no row yet is a normal state, not an error

  if (error) throw error;
  if (!data) return null;

  return {
    income: Number(data.income) || 0,
    savingsGoal: Number(data.savings_goal) || 0,
    budgets: (data.budgets as Record<string, number>) ?? {},
    username: (data.username as string) ?? undefined,
  };
}

/**
 * Permanently delete the signed-in user's account and everything in it.
 *
 * Handled by an Edge Function because removing an auth user needs the
 * service_role key, which must never ship inside the app. The function
 * identifies the account from the caller's token — this passes no user id,
 * because there is no way for one user to delete another.
 */
export async function deleteAccount(): Promise<void> {
  const { data, error } = await supabase.functions.invoke("delete-account", {
    body: {},
  });
  if (error) throw new Error(error.message ?? "Couldn't delete the account.");
  if (data?.error) throw new Error(data.error);
}

/**
 * Update only the display name.
 *
 * Deliberately not routed through saveUserProfile: that one always sends
 * income and savings_goal, so renaming yourself before the profile had
 * finished loading would write zeros over both. Sending just this column
 * makes that impossible rather than merely unlikely. Every other column has
 * a default, so this still works if the row somehow doesn't exist yet.
 */
export async function saveUsername(uid: string, username: string) {
  const { error } = await supabase
    .from("profiles")
    .upsert(
      { id: uid, username, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );
  if (error) throw error;
}

export async function saveBudgets(uid: string, budgets: Record<string, number>) {
  // Upsert rather than update, so this still works before onboarding has
  // created the profile row.
  const { error } = await supabase.from("profiles").upsert(
    { id: uid, budgets, updated_at: new Date().toISOString() },
    { onConflict: "id" }
  );
  if (error) throw error;
}

// ── Transactions ─────────────────────────────────────────
export async function addTransaction(
  uid: string,
  txn: {
    amount: number;
    type: TxnType;
    category: string;
    note?: string;
    /** When it actually happened. Defaults to now, so old callers are unaffected. */
    date?: Date;
  }
) {
  const { error } = await supabase.from("transactions").insert({
    user_id: uid,
    amount: txn.amount,
    type: txn.type,
    category: txn.category,
    note: txn.note ? txn.note : null, // empty note stays null, not ""
    date: (txn.date ?? new Date()).toISOString(),
  });
  if (error) throw error;
}

export async function deleteTransaction(uid: string, id: string) {
  // The user_id filter is belt-and-braces — RLS already blocks deleting
  // someone else's row, but this makes the intent explicit.
  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", id)
    .eq("user_id", uid);
  if (error) throw error;
}

export async function fetchTransactions(uid: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("id, amount, type, category, note, date")
    .eq("user_id", uid)
    .order("date", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => toTransaction(row as TransactionRow));
}

// Realtime rejects `.on()` on a channel that has already been subscribed, and
// channels are keyed by topic. Several screens listen at once (the tabs
// provider, Profile, Budgets), so a topic of just `transactions:<uid>` collides
// and the second subscriber crashes. Each call gets its own topic instead.
let channelSeq = 0;

// Live listener — calls cb with the full list now, and again after every
// change. Returns unsubscribe fn.
//
// Realtime delivers one changed row at a time; rather than patching the
// local array (and risking drift), we just re-run the query. The lists
// here are small, so this stays cheap and is always correct.
export function listenTransactions(
  uid: string,
  cb: (txns: Transaction[]) => void,
  /**
   * Called when the fetch fails. Without this the caller can't tell "you have
   * no transactions" apart from "we couldn't reach the server" — which used to
   * make an offline app claim your records were gone.
   */
  onError?: (message: string) => void
) {
  let cancelled = false;

  const load = async () => {
    try {
      const txns = await fetchTransactions(uid);
      if (!cancelled) cb(txns);
    } catch (e: any) {
      if (!cancelled) {
        if (onError) onError(e?.message ?? "Couldn't load your transactions.");
        else cb([]); // no handler passed — keep the old behaviour
      }
    }
  };

  load();

  const channel = supabase
    .channel(`transactions:${uid}:${++channelSeq}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "transactions",
        filter: `user_id=eq.${uid}`,
      },
      load
    )
    .subscribe();

  return () => {
    cancelled = true;
    supabase.removeChannel(channel);
  };
}
