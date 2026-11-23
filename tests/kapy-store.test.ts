// Reading financial data server-side: pagination, minimum columns, and that
// authorisation comes from the caller's token (Row Level Security), not from
// anything the request or the model says.

import test from "node:test";
import assert from "node:assert/strict";
import { MAX_DETAIL_ROWS, StoreError, makeSupabaseStore } from "../supabase/functions/_shared/kapy/store";
import { makeFakeSupabase, manyRows, uuid, type FakeDb } from "./fixtures/fake-supabase";

const ALICE = uuid(1);
const BOB = uuid(2);
const Q = { startUtc: "2026-10-31T16:00:00.000Z", endUtc: "2026-11-30T16:00:00.000Z" };

const dbWith = (rows: FakeDb["transactions"]): FakeDb => ({ transactions: rows, profiles: [] });

test("every row is fetched, however many pages it takes, despite the API's 1000-row cap", async () => {
  const db = dbWith(manyRows(ALICE, 2500));
  const { client, log } = makeFakeSupabase(db, { authUser: ALICE, apiMaxRows: 1000 });
  const store = makeSupabaseStore(client, ALICE);

  const { rows, truncated } = await store.transactions(Q);
  assert.equal(rows.length, 2500);
  assert.equal(truncated, false);
  assert.equal(log.length, 3); // 1000 + 1000 + 500
});

test("a read that cannot finish says so instead of reporting a short total", async () => {
  const db = dbWith(manyRows(ALICE, 2500));
  const { client } = makeFakeSupabase(db, { authUser: ALICE });
  const store = makeSupabaseStore(client, ALICE, { maxPages: 2 });
  const { rows, truncated } = await store.transactions(Q);
  assert.equal(rows.length, 2000);
  assert.equal(truncated, true);
});

test("exactly one full page is not truncated", async () => {
  const db = dbWith(manyRows(ALICE, 1000));
  const { client, log } = makeFakeSupabase(db, { authUser: ALICE });
  const { rows, truncated } = await makeSupabaseStore(client, ALICE).transactions(Q);
  assert.equal(rows.length, 1000);
  assert.equal(truncated, false);
  assert.equal(log.length, 2); // the second page came back empty
});

test("an empty period returns nothing and is not an error", async () => {
  const { client } = makeFakeSupabase(dbWith([]), { authUser: ALICE });
  assert.deepEqual(await makeSupabaseStore(client, ALICE).transactions(Q), { rows: [], truncated: false });
});

test("aggregate questions fetch the minimum columns — no notes", async () => {
  const { client, log } = makeFakeSupabase(dbWith(manyRows(ALICE, 3)), { authUser: ALICE });
  const { rows } = await makeSupabaseStore(client, ALICE).transactions(Q);
  assert.equal(log[0].columns, "id, amount, type, category, date");
  assert.ok(!JSON.stringify(rows).includes("secret note"));
});

test("showing transactions fetches notes, but never more than the cap", async () => {
  const { client, log } = makeFakeSupabase(dbWith(manyRows(ALICE, 50)), { authUser: ALICE });
  const { rows } = await makeSupabaseStore(client, ALICE).transactions({ ...Q, detail: { limit: 500 } });
  assert.match(log[0].columns, /note/);
  assert.equal(log[0].limit, MAX_DETAIL_ROWS);
  assert.equal(rows.length, MAX_DETAIL_ROWS);
});

test("the query is scoped to the user, the date range and any filters", async () => {
  const { client, log } = makeFakeSupabase(dbWith(manyRows(ALICE, 3)), { authUser: ALICE });
  await makeSupabaseStore(client, ALICE).transactions({ ...Q, category: "food", type: "expense" });
  const f = log[0].filters;
  assert.deepEqual(f.find((x) => x[1] === "user_id"), ["eq", "user_id", ALICE]);
  assert.deepEqual(f.find((x) => x[0] === "gte"), ["gte", "date", Q.startUtc]);
  assert.deepEqual(f.find((x) => x[0] === "lt"), ["lt", "date", Q.endUtc]);
  assert.deepEqual(f.find((x) => x[1] === "category"), ["eq", "category", "food"]);
  assert.deepEqual(f.find((x) => x[1] === "type"), ["eq", "type", "expense"]);
  // A total order, so pages cannot overlap or skip.
  assert.deepEqual(log[0].orders, ["date desc", "id desc"]);
});

test("the date range is half-open: a row exactly at the end is excluded, at the start included", async () => {
  const rows = [
    { id: "a", user_id: ALICE, amount: 1, type: "expense", category: "food", date: Q.startUtc },
    { id: "b", user_id: ALICE, amount: 1, type: "expense", category: "food", date: Q.endUtc },
  ];
  const { client } = makeFakeSupabase(dbWith(rows), { authUser: ALICE });
  const out = await makeSupabaseStore(client, ALICE).transactions(Q);
  assert.deepEqual(out.rows.map((r) => (r as { id: string }).id), ["a"]);
});

// ── cross-user access ───────────────────────────────────────

test("one user's store never returns another user's rows", async () => {
  const db = dbWith([...manyRows(ALICE, 5), ...manyRows(BOB, 7).map((r) => ({ ...r, amount: 999999 }))]);
  const { client } = makeFakeSupabase(db, { authUser: ALICE });
  const { rows } = await makeSupabaseStore(client, ALICE).transactions(Q);
  assert.equal(rows.length, 5);
  assert.ok(rows.every((r) => (r as { amount: number }).amount === 10));
});

test("RLS, not the id we pass, is what protects: asking for another user's id returns nothing", async () => {
  // Even if a bug passed Bob's id, the client is authenticated as Alice, so
  // the database returns no rows. Authorisation does not depend on our filter.
  const db = dbWith([...manyRows(ALICE, 5), ...manyRows(BOB, 7)]);
  const { client } = makeFakeSupabase(db, { authUser: ALICE });
  const wrongId = await makeSupabaseStore(client, BOB).transactions(Q);
  assert.deepEqual(wrongId.rows, []);
});

test("another user's profile is invisible too", async () => {
  const db: FakeDb = {
    transactions: [],
    profiles: [
      { id: ALICE, income: 2500, savings_goal: 500, budgets: { food: 40 } },
      { id: BOB, income: 99999, savings_goal: 1, budgets: {} },
    ],
  };
  const { client } = makeFakeSupabase(db, { authUser: ALICE });
  assert.equal((await makeSupabaseStore(client, ALICE).profile())!.incomeSen, 250000);
  assert.equal(await makeSupabaseStore(client, BOB).profile(), null);
});

test("a user with no profile row yields null", async () => {
  const { client } = makeFakeSupabase({ transactions: [], profiles: [] }, { authUser: ALICE });
  assert.equal(await makeSupabaseStore(client, ALICE).profile(), null);
});

// ── failures ────────────────────────────────────────────────

test("a database failure surfaces its code only, never its message", async () => {
  const { client } = makeFakeSupabase(dbWith([]), { authUser: ALICE, failWith: "57014" });
  const store = makeSupabaseStore(client, ALICE);
  for (const call of [() => store.transactions(Q), () => store.profile()]) {
    await assert.rejects(call, (e: unknown) => {
      assert.ok(e instanceof StoreError);
      assert.equal((e as StoreError).code, "57014");
      assert.ok(!/secret|12345|boom/.test((e as Error).message));
      return true;
    });
  }
});

test("rows that appear twice across pages are counted once", async () => {
  // Simulate a row inserted mid-read shifting the offset, so page 2 repeats a row.
  const rows = manyRows(ALICE, 3);
  let calls = 0;
  const client = {
    from: () => {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "gte", "lt", "order"]) b[m] = () => b;
      b.range = () => b;
      b.then = (resolve: (v: unknown) => void) => {
        calls++;
        resolve({ data: calls === 1 ? [rows[0], rows[1]] : calls === 2 ? [rows[1], rows[2]] : [], error: null });
      };
      return b;
    },
  };
  const out = await makeSupabaseStore(client, ALICE, { pageSize: 2 }).transactions(Q);
  assert.deepEqual(out.rows.map((r) => (r as { id: string }).id), [rows[0].id, rows[1].id, rows[2].id]);
});
