// Streak, week strip, achievements and levels. All are derived from
// transactions with nothing stored, so the risk is not corruption — it is the
// date arithmetic quietly being wrong at a boundary.

import test from "node:test";
import assert from "node:assert/strict";
import { streak, weekActivity, achievements, progression } from "../src/lib/insights";
import type { Transaction } from "../src/lib/db";

let seq = 0;
const on = (daysAgo: number, category = "food"): Transaction => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return { id: String(++seq), amount: 10, type: "expense", category, date: d };
};

test("no transactions means no streak", () => {
  const s = streak([]);
  assert.equal(s.current, 0);
  assert.equal(s.best, 0);
  assert.equal(s.atRisk, false);
});

test("logging today starts a streak of one", () => {
  const s = streak([on(0)]);
  assert.equal(s.current, 1);
  assert.equal(s.loggedToday, true);
  assert.equal(s.atRisk, false);
});

test("three consecutive days counts as three", () => {
  assert.equal(streak([on(0), on(1), on(2)]).current, 3);
});

test("several entries on one day still count as one day", () => {
  assert.equal(streak([on(0), on(0), on(0)]).current, 1);
});

test("a streak survives until a whole day is missed", () => {
  // Logged yesterday but not yet today: still alive, and flagged at risk.
  const s = streak([on(1), on(2)]);
  assert.equal(s.current, 2);
  assert.equal(s.atRisk, true);
  assert.equal(s.loggedToday, false);
});

test("missing two days breaks the streak", () => {
  const s = streak([on(2), on(3)]);
  assert.equal(s.current, 0, "no longer anchored to today or yesterday");
  assert.equal(s.atRisk, false, "nothing left to be at risk of losing");
});

test("best run is remembered after a break", () => {
  const s = streak([on(0), on(5), on(6), on(7), on(8)]);
  assert.equal(s.current, 1);
  assert.equal(s.best, 4, "the older four-day run still counts as the best");
});

test("a gap in the middle does not merge two runs", () => {
  const s = streak([on(0), on(1), on(3), on(4)]);
  assert.equal(s.current, 2);
  assert.equal(s.best, 2);
});

test("week strip always has seven days, Monday first", () => {
  const w = weekActivity([]);
  assert.equal(w.length, 7);
  assert.equal(w[0].label, "Mon");
  assert.equal(w[6].label, "Sun");
});

test("exactly one day in the week strip is today", () => {
  const todays = weekActivity([]).filter((d) => d.isToday);
  assert.equal(todays.length, 1);
});

test("today is never marked as a future day", () => {
  const today = weekActivity([]).find((d) => d.isToday)!;
  assert.equal(today.isFuture, false);
});

test("no day before today is marked future", () => {
  const w = weekActivity([]);
  const todayIndex = w.findIndex((d) => d.isToday);
  for (let i = 0; i < todayIndex; i++) {
    assert.equal(w[i].isFuture, false, `${w[i].label} is before today`);
  }
});

test("logging today lights up today's cell", () => {
  const today = weekActivity([on(0)]).find((d) => d.isToday)!;
  assert.equal(today.logged, true);
});

test("a brand new account has nothing unlocked", () => {
  assert.equal(achievements([], null).filter((a) => a.unlocked).length, 0);
});

test("achievement progress never exceeds its target", () => {
  const many = Array.from({ length: 100 }, () => on(0));
  for (const a of achievements(many, { income: 5000, savingsGoal: 500, budgets: {} })) {
    assert.ok(a.progress <= 100, `${a.title} at ${a.progress}%`);
    assert.ok(a.current <= a.target, `${a.title}: ${a.current}/${a.target}`);
  }
});

test("unlocked always agrees with the progress bar", () => {
  const items = achievements([on(0), on(1)], { income: 1000, savingsGoal: 100, budgets: {} });
  for (const a of items) {
    assert.equal(
      a.unlocked,
      a.progress === 100,
      `${a.title}: unlocked=${a.unlocked} but progress=${a.progress}`
    );
  }
});

test("saving RM100 unlocks First RM100, RM99.99 does not", () => {
  const almost: Transaction = { id: "a", amount: 99.99, type: "expense", category: "savings", date: new Date() };
  const enough: Transaction = { id: "b", amount: 100, type: "expense", category: "savings", date: new Date() };
  const find = (t: Transaction[]) => achievements(t, null).find((a) => a.id === "first-hundred")!;
  assert.equal(find([almost]).unlocked, false);
  assert.equal(find([enough]).unlocked, true);
});

test("income tagged savings does not count toward First RM100", () => {
  const t: Transaction = { id: "c", amount: 500, type: "income", category: "savings", date: new Date() };
  assert.equal(
    achievements([t], null).find((a) => a.id === "first-hundred")!.unlocked,
    false,
    "money coming in is not money set aside"
  );
});

test("a new account starts at level 1 with no XP", () => {
  const p = progression([], null);
  assert.equal(p.level, 1);
  assert.equal(p.xp, 0);
});

test("percentages stay in range for a heavily used account", () => {
  const many = Array.from({ length: 5000 }, () => on(0));
  const p = progression(many, { income: 9999, savingsGoal: 500, budgets: { food: 100 } });
  assert.ok(p.level <= 50, `level ${p.level} exceeded the cap`);
  assert.ok(p.pct >= 0 && p.pct <= 100, `pct ${p.pct} out of range`);
  assert.ok(p.xpIntoLevel <= p.xpForLevel, "progress within a level cannot exceed its cost");
});

test("the level cap holds no matter how much XP is earned", () => {
  // Each level costs 15% more than the last, so reaching 50 takes roughly
  // 627,000 XP — about 63,000 transactions at 10 XP each. Worth stating,
  // because an earlier version of this test assumed 5,000 was plenty.
  const enormous = Array.from({ length: 70_000 }, () => on(0));
  const p = progression(enormous, { income: 9999, savingsGoal: 500, budgets: { food: 100 } });
  assert.equal(p.level, 50, "should sit exactly at the cap");
  assert.equal(p.maxed, true);
  assert.equal(p.pct, 100);
});
