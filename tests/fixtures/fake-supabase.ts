// A stand-in for supabase-js that behaves like PostgREST under Row Level Security.
//
// What it simulates, because the Kapy code depends on each:
//   - RLS: it only ever returns rows whose user_id equals the *authenticated*
//     user (the one the "JWT" belongs to) — whatever filters the query asks for.
//   - The API row cap (default 1000): a response never exceeds it.
//   - range(), limit(), order(), eq/gte/lt filters, select(columns).
//   - Inserts with a unique (user_id, client_request_id) index, and RLS's
//     WITH CHECK on user_id.
//
// It records every query so tests can assert on the columns and filters used.

export interface FakeRow {
  id: string;
  user_id: string;
  amount: number;
  type: string;
  category: string;
  note?: string | null;
  date: string;
  client_request_id?: string | null;
}

export interface FakeDb {
  transactions: FakeRow[];
  profiles: { id: string; income: number; savings_goal: number; budgets: Record<string, number> }[];
}

export interface QueryLog {
  table: string;
  columns: string;
  filters: [string, string, unknown][];
  range?: [number, number];
  limit?: number;
  orders: string[];
}

export interface FakeOptions {
  /** The user the JWT belongs to. RLS is applied for this user. */
  authUser: string;
  apiMaxRows?: number;
  /** Make every query fail with this PostgREST code. */
  failWith?: string;
  /** Called after each insert, to let a test observe or break it. */
  onInsert?: (row: FakeRow) => void;
  /** Make inserts (only) fail with this PostgREST/Postgres code. */
  insertFail?: string;
}

export function makeFakeSupabase(db: FakeDb, opts: FakeOptions) {
  const log: QueryLog[] = [];
  const maxRows = opts.apiMaxRows ?? 1000;
  let nextId = 1;

  class Builder {
    private q: QueryLog;
    private mode: "select" | "insert" = "select";
    private payload: Partial<FakeRow> | null = null;
    private wantsOne = false;

    private table: "transactions" | "profiles";
    constructor(table: "transactions" | "profiles") {
      this.table = table;
      this.q = { table, columns: "*", filters: [], orders: [] };
    }
    select(columns = "*") {
      this.q.columns = columns;
      return this;
    }
    insert(payload: Partial<FakeRow>) {
      this.mode = "insert";
      this.payload = payload;
      return this;
    }
    eq(c: string, v: unknown) { this.q.filters.push(["eq", c, v]); return this; }
    gte(c: string, v: unknown) { this.q.filters.push(["gte", c, v]); return this; }
    lt(c: string, v: unknown) { this.q.filters.push(["lt", c, v]); return this; }
    order(c: string, o?: { ascending?: boolean }) { this.q.orders.push(`${c} ${o?.ascending === false ? "desc" : "asc"}`); return this; }
    range(a: number, b: number) { this.q.range = [a, b]; return this; }
    limit(n: number) { this.q.limit = n; return this; }
    maybeSingle() { this.wantsOne = true; return this; }
    // supabase-js: .single() after an insert/select returns the one row.
    single() { this.wantsOne = true; return this; }
    // deno-lint-ignore no-explicit-any
    then(resolve: (v: any) => unknown, reject?: (e: unknown) => unknown) {
      return Promise.resolve(this.run()).then(resolve, reject);
    }

    private run() {
      if (opts.failWith) return { data: null, error: { code: opts.failWith, message: "boom: secret row data 12345" } };

      if (this.mode === "insert") {
        const p = this.payload ?? {};
        if (opts.insertFail) return { data: null, error: { code: opts.insertFail, message: "boom: secret row data 12345" } };
        // RLS WITH CHECK: you can only insert rows you own.
        if (p.user_id !== opts.authUser) {
          return { data: null, error: { code: "42501", message: "new row violates row-level security policy" } };
        }
        if (
          p.client_request_id &&
          db.transactions.some((r) => r.user_id === p.user_id && r.client_request_id === p.client_request_id)
        ) {
          return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        }
        const row: FakeRow = {
          id: `ins-${nextId++}`,
          user_id: p.user_id as string,
          amount: p.amount as number,
          type: p.type as string,
          category: p.category as string,
          note: (p.note as string) ?? null,
          date: (p.date as string) ?? new Date().toISOString(),
          client_request_id: (p.client_request_id as string) ?? null,
        };
        db.transactions.push(row);
        opts.onInsert?.(row);
        log.push(this.q);
        return { data: this.wantsOne ? row : [row], error: null };
      }

      log.push(this.q);
      const source: Record<string, unknown>[] =
        this.table === "transactions"
          ? (db.transactions as unknown as Record<string, unknown>[]).filter((r) => r.user_id === opts.authUser)
          : (db.profiles as unknown as Record<string, unknown>[]).filter((r) => r.id === opts.authUser);

      let rows = source.filter((r) =>
        this.q.filters.every(([op, col, val]) => {
          const v = r[col] as string | number;
          if (op === "eq") return v === val;
          if (op === "gte") return col === "date" ? Date.parse(String(v)) >= Date.parse(String(val)) : v >= (val as number);
          if (op === "lt") return col === "date" ? Date.parse(String(v)) < Date.parse(String(val)) : v < (val as number);
          return true;
        })
      );

      for (const o of [...this.q.orders].reverse()) {
        const [col, dir] = o.split(" ");
        rows = [...rows].sort((a, b) => {
          const av = col === "date" ? Date.parse(String(a[col])) : (a[col] as string | number);
          const bv = col === "date" ? Date.parse(String(b[col])) : (b[col] as string | number);
          const c = av < bv ? -1 : av > bv ? 1 : 0;
          return dir === "desc" ? -c : c;
        });
      }

      if (this.q.range) rows = rows.slice(this.q.range[0], this.q.range[1] + 1);
      if (this.q.limit !== undefined) rows = rows.slice(0, this.q.limit);
      rows = rows.slice(0, maxRows); // the API's own cap

      const cols = this.q.columns === "*" ? null : this.q.columns.split(",").map((c) => c.trim());
      const shaped = rows.map((r) => (cols ? Object.fromEntries(cols.map((c) => [c, r[c]])) : r));
      if (this.wantsOne) return { data: shaped[0] ?? null, error: null };
      return { data: shaped, error: null };
    }
  }

  return {
    client: { from: (table: string) => new Builder(table as "transactions" | "profiles") },
    log,
  };
}

export const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export function manyRows(userId: string, count: number, startDate = "2026-11-02T04:00:00Z"): FakeRow[] {
  const base = Date.parse(startDate);
  return Array.from({ length: count }, (_, i) => ({
    id: `${userId}-r${String(i).padStart(5, "0")}`,
    user_id: userId,
    amount: 10,
    type: "expense",
    category: "food",
    note: `secret note ${i}`,
    date: new Date(base + i * 1000).toISOString(),
  }));
}
