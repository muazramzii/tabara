// Financial correctness. Every expected figure below was worked out by hand
// (see tests/fixtures/kapy-ledger.ts), not copied from the code's output.

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import {
  affordability,
  budgetReport,
  categoryReport,
  comparePeriods,
  monthlyTrend,
  normalizeProfile,
  normalizeRows,
  summarizePeriod,
  type Profile,
  type Txn,
} from "../supabase/functions/_shared/kapy/finance";
import { money, senOf, toSen } from "../supabase/functions/_shared/kapy/money";
import { mustResolve, recentMonthSpecs } from "../supabase/functions/_shared/kapy/period";
import {
  ALL_CATEGORY_IDS,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
} from "../supabase/functions/_shared/kapy/categories";
import { ALL_CATEGORIES, CATEGORIES, INCOME_CATEGORIES as APP_INCOME } from "../src/constants/categories";
import { deriveTotals } from "../src/lib/derive";
import { LEDGER_ROWS, NOW, PROFILE_ROW } from "./fixtures/kapy-ledger";

const { txns } = normalizeRows(LEDGER_ROWS);
const profile = normalizeProfile(PROFILE_ROW);
const period = (spec: Parameters<typeof mustResolve>[0], now = NOW) => mustResolve(spec, now);

const nov = summarizePeriod(txns, period({ kind: "this_month" }), profile);
const oct = summarizePeriod(txns, period({ kind: "last_month" }), profile);

// ── the server's category list must match the app's ─────────

test("the server's category list is identical to the app's", () => {
  const server = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].map((c) => [c.id, c.label, c.kind]);
  const app = [...CATEGORIES, ...APP_INCOME].map((c) => [c.id, c.label, c.type]);
  assert.deepEqual(server, app);
  assert.deepEqual([...ALL_CATEGORY_IDS], ALL_CATEGORIES.map((c) => c.id));
});

// ── normalising rows ────────────────────────────────────────

test("every row in the ledger is usable", () => {
  assert.equal(txns.length, LEDGER_ROWS.length);
  assert.equal(normalizeRows(LEDGER_ROWS).dropped, 0);
});

test("untrustworthy rows are dropped and counted, never guessed", () => {
  const { txns: kept, dropped } = normalizeRows([
    { amount: 5, type: "expense", category: "food", date: "2026-11-01T00:00:00Z" },
    { amount: 0, type: "expense", category: "food", date: "2026-11-01T00:00:00Z" },
    { amount: -5, type: "expense", category: "food", date: "2026-11-01T00:00:00Z" },
    { amount: "abc", type: "expense", category: "food", date: "2026-11-01T00:00:00Z" },
    { amount: 5, type: "transfer", category: "food", date: "2026-11-01T00:00:00Z" },
    { amount: 5, type: "expense", category: "food", date: "not a date" },
    { amount: 5, type: "expense", category: "food" },
    null,
    "junk",
  ]);
  assert.equal(kept.length, 1);
  assert.equal(dropped, 8);
});

test("numeric strings from Postgres are read exactly; a missing category becomes 'other'", () => {
  const { txns: t } = normalizeRows([{ amount: "12.90", type: "expense", category: null, date: "2026-11-01T00:00:00Z" }]);
  assert.equal(t[0].sen, 1290);
  assert.equal(t[0].category, "other");
});

test("profiles: negative and malformed values become zero", () => {
  const p = normalizeProfile({ income: -5, savings_goal: "abc", budgets: { food: 40, bad: "x", neg: -3, zero: 0 } });
  assert.deepEqual(p, { incomeSen: 0, savingsGoalSen: 0, budgetsSen: { food: 4000 } });
  assert.deepEqual(normalizeProfile({ income: 1, savings_goal: 1, budgets: [1, 2] }).budgetsSen, {});
  assert.deepEqual(normalizeProfile(null), { incomeSen: 0, savingsGoalSen: 0, budgetsSen: {} });
});

// ── November, the month in progress ─────────────────────────

test("November: income, spending, savings", () => {
  assert.equal(nov.earned.formatted, "RM 3,000.00");
  assert.equal(nov.spent.formatted, "RM 341.55");
  assert.equal(nov.saved.formatted, "RM 300.00");
  assert.equal(nov.income.formatted, "RM 5,500.00"); // 2500 profile + 3000 earned
  assert.equal(nov.incomeBasis, "profile_monthly_plus_logged_income");
  assert.equal(nov.transactionCount, 9); // 8 in November + the 00:00 MYT boundary row
});

test("November: balance, budget, remaining — the app's own definitions", () => {
  assert.equal(nov.balance!.formatted, "RM 4,858.45"); // 5500 - 341.55 - 300
  assert.equal(nov.budget!.formatted, "RM 5,000.00"); // 5500 - 500
  assert.equal(nov.remainingBudget!.formatted, "RM 4,658.45");
  assert.equal(nov.overBudgetBy, null);
  assert.equal(nov.budgetUsedPercent, 6.8); // 341.55 / 5000
  assert.equal(nov.netCashFlow.formatted, "RM 2,358.45"); // 3000 - 341.55 - 300
});

test("November: savings rates distinguish the goal from what was actually saved", () => {
  assert.equal(nov.plannedSavingsRatePercent, 20); // goal 500 / profile income 2500
  assert.equal(nov.actualSavingsRatePercent, 5.5); // 300 / 5500
});

test("November: Needs / Wants split, and it adds up", () => {
  assert.equal(nov.needs.formatted, "RM 195.55");
  assert.equal(nov.wants.formatted, "RM 146.00");
  assert.equal(senOf(nov.needs) + senOf(nov.wants) + senOf(nov.uncategorised), senOf(nov.spent));
});

test("November: spending by category, largest first, shares of spending", () => {
  assert.deepEqual(
    nov.spendingByCategory.map((c) => [c.category, c.spent.formatted, c.sharePercent, c.count]),
    [
      ["groceries", "RM 150.55", 44.1, 1],
      ["shopping", "RM 99.99", 29.3, 1],
      ["food", "RM 46.01", 13.5, 4],
      ["transport", "RM 45.00", 13.2, 1],
    ]
  );
  // The pieces sum to the whole, to the sen.
  assert.equal(
    nov.spendingByCategory.reduce((s, c) => s + senOf(c.spent), 0),
    senOf(nov.spent)
  );
  // Savings is not spending, so it is not in the breakdown.
  assert.ok(!nov.spendingByCategory.some((c) => c.category === "savings"));
});

test("November: income by category", () => {
  assert.deepEqual(nov.incomeByCategory.map((c) => [c.category, c.earned.formatted]), [["salary", "RM 3,000.00"]]);
});

test("November: average daily spend uses days elapsed, not days in the month", () => {
  assert.equal(nov.averageDailySpend!.formatted, "RM 15.53"); // 341.55 / 22 = 15.525 -> 15.53
});

test("November: month-end projection is explicit about its basis", () => {
  assert.equal(nov.projection.available, true);
  if (!nov.projection.available) return;
  assert.equal(nov.projection.projectedSpend.formatted, "RM 465.75"); // 341.55 / 22 * 30
  assert.equal(nov.projection.projectedRemainingSpend.formatted, "RM 124.20");
  assert.match(nov.projection.basis, /22 days elapsed.*30 days/);
});

test("November is reported as still in progress", () => {
  assert.equal(nov.period.complete, false);
  assert.ok(nov.limitations.includes("period_still_in_progress"));
});

// ── the sub-sen and time-zone edges ─────────────────────────

test("the row stamped 00:00 on 1 Nov in Malaysia counts for November, not October", () => {
  assert.ok(nov.spendingByCategory.find((c) => c.category === "food")!.count === 4);
});

test("the row stamped 23:59:59.999 on 31 Oct in Malaysia counts for October", () => {
  assert.equal(oct.spendingByCategory.find((c) => c.category === "food")!.spent.formatted, "RM 40.00"); // 30 + 10
});

// ── October, a completed month ──────────────────────────────

test("October: complete month figures", () => {
  assert.equal(oct.spent.formatted, "RM 300.00");
  assert.equal(oct.saved.formatted, "RM 400.00");
  assert.equal(oct.earned.formatted, "RM 500.00");
  assert.equal(oct.income.formatted, "RM 3,000.00"); // 2500 + 500
  assert.equal(oct.balance!.formatted, "RM 2,300.00"); // 3000 - 300 - 400
  assert.equal(oct.period.complete, true);
  assert.equal(oct.averageDailySpend!.formatted, "RM 9.68"); // 300 / 31 = 9.677
  assert.equal(oct.projection.available, false);
  assert.ok(oct.limitations.includes("past_month_uses_current_profile_income"));
});

test("'How much did I save in October?' is the savings category, not income minus spending", () => {
  assert.equal(oct.saved.formatted, "RM 400.00");
  assert.equal(oct.actualSavingsRatePercent, 13.3); // 400 / 3000
});

// ── agreement with the Home screen ──────────────────────────

test("the server's November figures equal the app's own deriveTotals", () => {
  // deriveTotals reads "now" and the device's local month. Freeze the clock and
  // run it in Malaysia's zone, which is what the app assumes, so the comparison
  // is about the arithmetic. (Asserting inside a conditional would pass
  // vacuously on a machine in another zone, so the zone is forced instead.)
  const prevTZ = process.env.TZ;
  process.env.TZ = "Asia/Kuala_Lumpur";
  mock.timers.enable({ apis: ["Date"], now: NOW });
  try {
    assert.equal(new Date().getTimezoneOffset(), -480, "test must run in Malaysia time");
    const appTxns = LEDGER_ROWS.map((r) => ({
      id: r.id,
      amount: r.amount,
      type: r.type as "expense" | "income",
      category: r.category,
      note: r.note ?? undefined,
      date: new Date(r.date),
    }));
    const app = deriveTotals(appTxns, { income: 2500, savingsGoal: 500, budgets: {} });
    assert.equal(money(toSen(app.spent)!).formatted, nov.spent.formatted);
    assert.equal(money(toSen(app.saved)!).formatted, nov.saved.formatted);
    assert.equal(money(toSen(app.earned)!).formatted, nov.earned.formatted);
    assert.equal(money(toSen(app.income)!).formatted, nov.income.formatted);
    assert.equal(money(toSen(app.balance)!).formatted, nov.balance!.formatted);
    assert.equal(money(toSen(app.budget)!).formatted, nov.budget!.formatted);
    assert.equal(money(toSen(app.remaining)!).formatted, nov.remainingBudget!.formatted);
  } finally {
    mock.timers.reset();
    if (prevTZ === undefined) delete process.env.TZ;
    else process.env.TZ = prevTZ;
  }
});

// ── a single category, and budgets ──────────────────────────

test("food spending in November: total, share and budget status", () => {
  const r = categoryReport(txns, period({ kind: "this_month" }), "food", profile);
  assert.equal(r.total.formatted, "RM 46.01");
  assert.equal(r.count, 4);
  assert.equal(r.sharePercentOfSpending, 13.5);
  assert.equal(r.budget!.limit.formatted, "RM 40.00");
  assert.equal(r.budget!.overBy!.formatted, "RM 6.01");
  assert.equal(r.budget!.usedPercent, 115);
  assert.equal(r.budget!.remaining.formatted, "-RM 6.01");
  assert.equal(r.budget!.status, "over");
});

test("a category with no budget says so", () => {
  const r = categoryReport(txns, period({ kind: "this_month" }), "transport", profile);
  assert.equal(r.budget, null);
  assert.equal(r.budgetNote, "no_budget_set");
});

test("budgets are monthly: a week gets no budget figures", () => {
  const r = categoryReport(txns, period({ kind: "this_week" }), "food", profile);
  assert.equal(r.budget, null);
  assert.equal(r.budgetNote, "budgets_are_monthly");
  assert.equal(r.total.formatted, "RM 20.01");
});

test("income categories report income", () => {
  const r = categoryReport(txns, period({ kind: "this_month" }), "salary", profile);
  assert.equal(r.direction, "income");
  assert.equal(r.total.formatted, "RM 3,000.00");
  assert.equal(r.sharePercentOfSpending, null);
});

test("a category with nothing in it is zero, not an error", () => {
  const r = categoryReport(txns, period({ kind: "this_month" }), "health", profile);
  assert.equal(r.total.formatted, "RM 0.00");
  assert.equal(r.count, 0);
});

test("budget report: overall and per category, worst first", () => {
  const b = budgetReport(txns, period({ kind: "this_month" }), profile);
  assert.equal(b.available, true);
  assert.equal(b.overall!.budget.formatted, "RM 5,000.00");
  assert.equal(b.overall!.status, "ok");
  assert.deepEqual(
    b.categories.map((c) => [c.category, c.status, c.usedPercent]),
    [
      ["food", "over", 115],
      ["groceries", "ok", 75.3], // 150.55 / 200
    ]
  );
});

test("the 'near' threshold is 80%, as in the app", () => {
  const p: Profile = { incomeSen: 100000, savingsGoalSen: 0, budgetsSen: { food: 10000 } };
  const mk = (amount: number): Txn[] => [{ sen: amount, type: "expense", category: "food", at: Date.parse("2026-11-05T04:00:00Z") }];
  const status = (sen: number) => budgetReport(mk(sen), period({ kind: "this_month" }), p).categories[0].status;
  assert.equal(status(8000), "ok"); // exactly 80%
  assert.equal(status(8001), "near");
  assert.equal(status(10000), "near"); // exactly at the limit is not over
  assert.equal(status(10001), "over");
});

test("budgets for a non-month period are unavailable, not invented", () => {
  const b = budgetReport(txns, period({ kind: "this_week" }), profile);
  assert.equal(b.available, false);
  assert.equal(b.reason, "budgets_are_monthly");
});

// ── a week ──────────────────────────────────────────────────

test("this week: no monthly balance or budget; net cash flow instead", () => {
  const w = summarizePeriod(txns, period({ kind: "this_week" }), profile);
  assert.equal(w.spent.formatted, "RM 20.01");
  assert.equal(w.earned.formatted, "RM 0.00");
  assert.equal(w.incomeBasis, "logged_income_only");
  assert.equal(w.balance, null);
  assert.equal(w.budget, null);
  assert.equal(w.netCashFlow.formatted, "-RM 20.01");
  assert.deepEqual(w.projection, { available: false, reason: "not_a_calendar_month" });
  assert.ok(w.limitations.includes("monthly_budget_and_balance_not_applicable_to_this_period"));
});

test("last week picks up the salary and the savings transfer", () => {
  const w = summarizePeriod(txns, period({ kind: "last_week" }), profile);
  assert.equal(w.earned.formatted, "RM 3,000.00");
  assert.equal(w.saved.formatted, "RM 300.00");
  assert.equal(w.spent.formatted, "RM 99.99");
});

// ── comparison ──────────────────────────────────────────────

test("October vs November", () => {
  const c = comparePeriods(oct, nov);
  assert.equal(c.change.spent.amount.formatted, "RM 41.55");
  assert.equal(c.change.spent.percentChange, 13.9);
  assert.equal(c.change.saved.amount.formatted, "-RM 100.00");
  assert.equal(c.change.earned.amount.formatted, "RM 2,500.00");
  assert.equal(c.likeForLike, false); // 31 days vs 22 so far
  assert.ok(c.limitations.includes("periods_cover_different_numbers_of_days"));
  // Per-day figures are the fair comparison: 9.68 -> 15.53
  assert.equal(c.change.averageDailySpend!.amount.formatted, "RM 5.85");
});

test("comparison names what moved the most", () => {
  const c = comparePeriods(oct, nov);
  assert.deepEqual(
    c.categoryChanges.map((x) => [x.category, x.change.amount.formatted]),
    [
      ["shopping", "RM 99.99"],
      ["groceries", "-RM 49.45"],
      ["transport", "-RM 15.00"],
      ["food", "RM 6.01"],
    ]
  );
  assert.equal(c.biggestIncrease, "Shopping");
  assert.equal(c.biggestDecrease, "Groceries");
  // A category that did not exist before has no percentage, rather than infinity.
  assert.equal(c.categoryChanges[0].change.percentChange, null);
});

test("comparing two identical periods shows no change", () => {
  const c = comparePeriods(oct, oct);
  assert.equal(c.change.spent.amount.formatted, "RM 0.00");
  assert.deepEqual(c.categoryChanges, []);
  assert.equal(c.biggestIncrease, null);
  assert.equal(c.likeForLike, true);
});

test("comparing against an empty month reports it", () => {
  const aug = summarizePeriod(txns, period({ kind: "month", year: 2026, month: 8 }), profile);
  const c = comparePeriods(aug, oct);
  assert.ok(c.limitations.includes("earlier_period_has_no_transactions"));
  assert.equal(c.change.spent.percentChange, null);
});

// ── trend ───────────────────────────────────────────────────

test("a three-month trend", () => {
  const periods = recentMonthSpecs(3, NOW).map((s) => period(s));
  const t = monthlyTrend(txns, periods, profile);
  assert.deepEqual(t.months.map((m) => [m.label, m.spent.formatted, m.partial]), [
    ["September 2026", "RM 200.00", false],
    ["October 2026", "RM 300.00", false],
    ["November 2026", "RM 341.55", true],
  ]);
  assert.equal(t.direction, "rising"); // 200 -> 300, complete months only
  assert.equal(t.latestVsPreviousSpentPercent, 50);
  assert.ok(t.limitations.includes("latest_month_is_still_in_progress"));
});

test("a trend with one complete month cannot claim a direction", () => {
  const periods = recentMonthSpecs(2, NOW).map((s) => period(s));
  const t = monthlyTrend(txns, periods, profile);
  assert.equal(t.direction, "insufficient_data");
});

test("small movements are called flat", () => {
  const rows = (a: number, b: number): Txn[] => [
    { sen: a, type: "expense", category: "food", at: Date.parse("2026-09-10T04:00:00Z") },
    { sen: b, type: "expense", category: "food", at: Date.parse("2026-10-10T04:00:00Z") },
  ];
  const periods = recentMonthSpecs(3, NOW).map((s) => period(s));
  assert.equal(monthlyTrend(rows(10000, 10400), periods, profile).direction, "flat"); // +4%
  assert.equal(monthlyTrend(rows(10000, 10600), periods, profile).direction, "rising");
  assert.equal(monthlyTrend(rows(10000, 9000), periods, profile).direction, "falling");
});

// ── affordability ───────────────────────────────────────────

test("can I save RM500 this month? — comfortable", () => {
  const a = affordability(nov, toSen(500)!);
  assert.equal(a.balanceNow!.formatted, "RM 4,858.45");
  assert.equal(a.balanceAfterSaving!.formatted, "RM 4,358.45");
  assert.equal(a.projectedRemainingSpend!.formatted, "RM 124.20");
  assert.equal(a.balanceAfterSavingAndProjectedSpend!.formatted, "RM 4,234.25");
  assert.equal(a.verdict, "comfortable");
});

test("saving nearly everything is 'tight': it fits today but not the rest of the month", () => {
  const a = affordability(nov, toSen(4800)!);
  assert.equal(a.balanceAfterSaving!.formatted, "RM 58.45");
  assert.equal(a.balanceAfterSavingAndProjectedSpend!.formatted, "-RM 65.75");
  assert.equal(a.verdict, "tight");
});

test("saving more than the balance is not affordable", () => {
  const a = affordability(nov, toSen(5000)!);
  assert.equal(a.balanceAfterSaving!.formatted, "-RM 141.55");
  assert.equal(a.verdict, "not_affordable");
});

test("without income there is no verdict", () => {
  const empty = summarizePeriod([], period({ kind: "this_month" }), null);
  const a = affordability(empty, toSen(300)!);
  assert.equal(a.verdict, "unknown");
  assert.equal(a.balanceAfterSaving, null);
});

// ── thin or missing data ────────────────────────────────────

test("no transactions and no profile: zeros, no NaN, and the gaps are named", () => {
  const s = summarizePeriod([], period({ kind: "this_month" }), null);
  assert.equal(s.spent.formatted, "RM 0.00");
  assert.equal(s.balance!.formatted, "RM 0.00");
  assert.equal(s.actualSavingsRatePercent, null); // no income: undefined, not 0%
  assert.equal(s.plannedSavingsRatePercent, null);
  assert.equal(s.budgetUsedPercent, null);
  assert.deepEqual(s.projection, { available: false, reason: "no_spending" });
  for (const l of ["profile_unavailable", "no_transactions_in_period", "monthly_income_not_set"]) {
    assert.ok(s.limitations.includes(l), l);
  }
  assert.ok(!JSON.stringify(s).includes("NaN"));
});

test("too early in the month to project", () => {
  const early = Date.parse("2026-11-02T04:00:00Z"); // day 2
  const s = summarizePeriod(txns, mustResolve({ kind: "this_month" }, early), profile);
  assert.deepEqual(s.projection, { available: false, reason: "too_early" });
});

test("a month with an income but spending over budget reports the overspend", () => {
  const p: Profile = { incomeSen: 100000, savingsGoalSen: 20000, budgetsSen: {} };
  const t: Txn[] = [{ sen: 90000, type: "expense", category: "shopping", at: Date.parse("2026-11-05T04:00:00Z") }];
  const s = summarizePeriod(t, period({ kind: "this_month" }), p);
  assert.equal(s.budget!.formatted, "RM 800.00");
  assert.equal(s.overBudgetBy!.formatted, "RM 100.00");
  assert.equal(s.remainingBudget!.formatted, "-RM 100.00");
  assert.equal(s.budgetUsedPercent, 112.5);
});

test("a savings goal larger than income gives a budget of zero, never negative", () => {
  const p: Profile = { incomeSen: 100000, savingsGoalSen: 500000, budgetsSen: {} };
  const s = summarizePeriod([], period({ kind: "this_month" }), p);
  assert.equal(s.budget!.formatted, "RM 0.00");
});

test("1,000 receipts of RM 12.90 total exactly RM 12,900.00", () => {
  const many: Txn[] = Array.from({ length: 1000 }, (_, i) => ({
    sen: 1290,
    type: "expense" as const,
    category: "food",
    at: Date.parse("2026-11-05T04:00:00Z") + i,
  }));
  assert.equal(summarizePeriod(many, period({ kind: "this_month" }), profile).spent.formatted, "RM 12,900.00");
});

test("unknown categories are kept, labelled by id, and counted as uncategorised", () => {
  const t: Txn[] = [{ sen: 5000, type: "expense", category: "mystery", at: Date.parse("2026-11-05T04:00:00Z") }];
  const s = summarizePeriod(t, period({ kind: "this_month" }), profile);
  assert.equal(s.spendingByCategory[0].label, "mystery");
  assert.equal(s.spendingByCategory[0].kind, "unknown");
  assert.equal(s.uncategorised.formatted, "RM 50.00");
  assert.equal(s.spent.formatted, "RM 50.00");
});
