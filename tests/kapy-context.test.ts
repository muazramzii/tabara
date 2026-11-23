// Conversation context: validation of what the client sends back, expiry, and
// the rules for carrying a period or category into the next question.

import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTEXT_MAX_TURNS,
  CONTEXT_TTL_MS,
  nextContext,
  parseContext,
  resolveReferences,
  type KapyContext,
} from "../supabase/functions/_shared/kapy/context";
import { analyzeMessage } from "../supabase/functions/_shared/kapy/intent";
import { NOW } from "./fixtures/kapy-ledger";

const good: KapyContext = {
  v: 1,
  at: NOW - 60_000,
  turn: 2,
  intent: "check_expenses",
  period: { kind: "month", year: 2026, month: 10 },
  category: "food",
};

test("a well-formed, fresh context is accepted", () => {
  assert.deepEqual(parseContext(good, NOW), good);
});

test("it can hold a comparison", () => {
  const withCompare = { ...good, compare: [{ kind: "this_month" }, { kind: "last_month" }] };
  assert.deepEqual(parseContext(withCompare, NOW)?.compare, [{ kind: "this_month" }, { kind: "last_month" }]);
});

test("tampered or malformed contexts are rejected whole", () => {
  const bad: unknown[] = [
    null, undefined, "x", 5, [], {},
    { ...good, v: 2 },
    { ...good, at: "now" },
    { ...good, at: NaN },
    { ...good, turn: -1 },
    { ...good, turn: 1.5 },
    { ...good, turn: CONTEXT_MAX_TURNS + 1 },
    { ...good, intent: "delete_everything" },
    { ...good, period: { kind: "forever" } },
    { ...good, period: { kind: "range", from: "2026-13-01", to: "2026-13-02" } },
    { ...good, compare: [{ kind: "this_month" }] },
    { ...good, compare: [{ kind: "this_month" }, "last_month"] },
    { ...good, category: "'; drop table transactions; --" },
    { ...good, category: "not_a_category" },
  ];
  for (const b of bad) assert.equal(parseContext(b, NOW), null, JSON.stringify(b)?.slice(0, 60));
});

test("stale and future contexts are rejected", () => {
  assert.equal(parseContext({ ...good, at: NOW - CONTEXT_TTL_MS - 1 }, NOW), null);
  assert.notEqual(parseContext({ ...good, at: NOW - CONTEXT_TTL_MS + 1000 }, NOW), null);
  assert.equal(parseContext({ ...good, at: NOW + 5 * 60_000 }, NOW), null);
});

test("the context carries no amounts, notes or free text", () => {
  // Whatever extra fields a client adds are dropped, not stored or echoed.
  const parsed = parseContext({ ...good, amount: 99999, note: "secret", text: "hello" }, NOW)!;
  assert.deepEqual(Object.keys(parsed).sort(), ["at", "category", "intent", "period", "turn", "v"]);
});

// ── resolution ──────────────────────────────────────────────

const resolve = (text: string, ctx: KapyContext | null) => resolveReferences(analyzeMessage(text, NOW), ctx);

test("what this message says beats what was remembered", () => {
  const r = resolve("how much did I spend on transport this week", good);
  assert.deepEqual(r.period, { kind: "this_week" });
  assert.equal(r.category, "transport");
  assert.deepEqual(r.inherited, []);
});

test("a fresh question does not drag the old category along", () => {
  const r = resolve("what is my balance", good);
  assert.equal(r.category, null);
  assert.ok(!r.inherited.includes("category"));
});

test("a question with no period defaults to this month and says so", () => {
  const r = resolve("how much did I spend", null);
  assert.deepEqual(r.period, { kind: "this_month" });
  assert.deepEqual(r.defaulted, ["period"]);
});

test("history and trends have their own sensible defaults", () => {
  assert.deepEqual(resolve("show my recent transactions", null).period, { kind: "last_n_days", days: 30 });
  assert.deepEqual(resolve("show my spending trend", null).period, { kind: "last_n_months", months: 3 });
});

test("a follow-up inherits the period", () => {
  const r = resolve("what about transport?", good);
  assert.equal(r.category, "transport");
  assert.deepEqual(r.period, good.period);
  assert.ok(r.inherited.includes("period"));
});

test("a bare fragment inherits the intent as well", () => {
  const r = resolve("bulan lepas pulak?", good);
  assert.equal(r.intent, "check_expenses");
  assert.ok(r.inherited.includes("intent"));
  assert.ok(r.inherited.includes("category"));
});

test("a topic change neither inherits nor erases", () => {
  const ctx = { ...good };
  for (const text of ["what is an emergency fund", "hi kapy", "I spent RM12 on lunch", "tips to save more"]) {
    const a = analyzeMessage(text, NOW);
    const r = resolveReferences(a, ctx);
    assert.deepEqual(r.inherited, [], text);
    assert.equal(nextContext(a, r, ctx, NOW), ctx, `${text}: context should be untouched`);
  }
});

test("a pointer with nothing behind it is reported, not guessed", () => {
  assert.equal(resolve("bulan tu berapa aku belanja", null).needsClarification, "period");
  assert.equal(resolve("is that too much?", null).needsClarification, "category");
});

test("a pointer with something behind it resolves", () => {
  const r = resolve("is that too much?", good);
  assert.equal(r.needsClarification, null);
  assert.equal(r.category, "food");
});

test("explaining the previous answer keeps the comparison it was about", () => {
  const ctx: KapyContext = { v: 1, at: NOW, turn: 1, intent: "compare_periods", compare: [{ kind: "this_month" }, { kind: "last_month" }] };
  const r = resolve("why is it so high", ctx);
  assert.equal(r.intent, "clarify_previous");
  assert.deepEqual(r.compare, ctx.compare);
});

// ── what is remembered next ─────────────────────────────────

test("a question about the data becomes the new context", () => {
  const a = analyzeMessage("how much did I spend on food last month", NOW);
  const r = resolveReferences(a, null);
  const next = nextContext(a, r, null, NOW)!;
  assert.equal(next.turn, 1);
  assert.equal(next.category, "food");
  assert.deepEqual(next.period, { kind: "last_month" });
  assert.equal(next.at, NOW);
});

test("the turn counter is capped", () => {
  const a = analyzeMessage("how much did I spend", NOW);
  const ctx: KapyContext = { ...good, turn: CONTEXT_MAX_TURNS };
  const next = nextContext(a, resolveReferences(a, ctx), ctx, NOW)!;
  assert.equal(next.turn, CONTEXT_MAX_TURNS);
});

test("an unresolved pointer leaves the context as it was", () => {
  const a = analyzeMessage("bulan tu berapa", NOW);
  const r = resolveReferences(a, null);
  assert.equal(nextContext(a, r, null, NOW), null);
});

test("a round trip through the wire format is lossless", () => {
  const a = analyzeMessage("compare october and november", NOW);
  const next = nextContext(a, resolveReferences(a, null), null, NOW)!;
  assert.deepEqual(parseContext(JSON.parse(JSON.stringify(next)), NOW), next);
});
