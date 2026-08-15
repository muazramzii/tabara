// The month's money maths. This is the calculation behind every number on the
// home screen, and it was wrong once in a way nobody noticed for a while:
// income and savings transfers were ignored, so logging a salary changed
// nothing and only spending moved the balance. These lock that behaviour down.

import test from "node:test";
import assert from "node:assert/strict";
import { deriveTotals } from "../src/lib/derive";
import type { Transaction } from "../src/lib/db";

let seq = 0;
const txn = (
  amount: number,
  type: "expense" | "income",
  category: string,
  date = new Date()
): Transaction => ({ id: String(++seq), amount, type, category, date });

const lastMonth = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  // Guard against the 31st landing in a short month and skipping back two.
  d.setDate(1);
  return d;
};

const profile = (income: number, savingsGoal = 0) => ({ income, savingsGoal });

test("empty account produces zeros, not NaN", () => {
  const d = deriveTotals([], null);
  for (const [key, value] of Object.entries(d)) {
    if (typeof value === "number") {
      assert.ok(Number.isFinite(value), `${key} should be finite, got ${value}`);
    }
  }
  assert.equal(d.balance, 0);
  assert.equal(d.income, 0);
});

test("income adds to the balance", () => {
  const d = deriveTotals([txn(500, "income", "salary")], profile(1000));
  assert.equal(d.earned, 500);
  assert.equal(d.income, 1500, "profile income plus what was earned");
  assert.equal(d.balance, 1500);
});

test("spending deducts from the balance", () => {
  const d = deriveTotals([txn(200, "expense", "food")], profile(1000));
  assert.equal(d.spent, 200);
  assert.equal(d.balance, 800);
});

test("savings leaves the balance but is not spending", () => {
  const d = deriveTotals([txn(300, "expense", "savings")], profile(1000));
  assert.equal(d.saved, 300);
  assert.equal(d.spent, 0, "a savings transfer is not spending");
  assert.equal(d.balance, 700, "but it does leave the spendable pool");
});

test("savings does not count against the budget", () => {
  const withSavings = deriveTotals([txn(300, "expense", "savings")], profile(1000));
  const withNothing = deriveTotals([], profile(1000));
  assert.equal(
    withSavings.remaining,
    withNothing.remaining,
    "moving money to savings must not eat the spending budget"
  );
});

test("the three kinds of money combine correctly", () => {
  const d = deriveTotals(
    [
      txn(500, "income", "salary"),
      txn(200, "expense", "food"),
      txn(100, "expense", "savings"),
    ],
    profile(1000)
  );
  assert.equal(d.income, 1500);
  assert.equal(d.spent, 200);
  assert.equal(d.saved, 100);
  assert.equal(d.balance, 1200, "1500 in, 200 spent, 100 set aside");
});

test("only this month counts", () => {
  const d = deriveTotals(
    [txn(999, "expense", "food", lastMonth()), txn(50, "expense", "food")],
    profile(1000)
  );
  assert.equal(d.spent, 50, "last month's spending must not leak in");
});

test("budget is income minus the savings goal", () => {
  const d = deriveTotals([], profile(1000, 200));
  assert.equal(d.budget, 800);
  assert.equal(d.remaining, 800);
});

test("budget never goes negative when the goal exceeds income", () => {
  const d = deriveTotals([], profile(500, 900));
  assert.equal(d.budget, 0, "clamped, so percentages don't invert");
});

test("mood tracks how much of the budget is spent", () => {
  assert.match(deriveTotals([], null).mood.title, /waiting/, "no income set");
  assert.match(
    deriveTotals([txn(100, "expense", "food")], profile(1000)).mood.title,
    /chill/
  );
  assert.match(
    deriveTotals([txn(900, "expense", "food")], profile(1000)).mood.title,
    /careful/
  );
  assert.match(
    deriveTotals([txn(1500, "expense", "food")], profile(1000)).mood.title,
    /stressed/
  );
});

test("overspending gives negative remaining, not a clamped zero", () => {
  const d = deriveTotals([txn(1200, "expense", "food")], profile(1000));
  assert.equal(d.remaining, -200, "the screen needs to show how far over");
});

test("decimal amounts stay accurate to the sen", () => {
  const d = deriveTotals(
    [txn(10.1, "expense", "food"), txn(20.2, "expense", "food")],
    profile(100)
  );
  assert.ok(Math.abs(d.spent - 30.3) < 0.000001, `got ${d.spent}`);
});
