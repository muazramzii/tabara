// Deterministic financial calculations.
//
// This is where every number Kapy states comes from. The model is never asked
// to add, subtract or compare amounts: it asks for a summary, receives one, and
// explains it. All arithmetic is on integer sen (see money.ts).
//
// The definitions deliberately mirror the app, so Kapy and the Home screen can
// never disagree (src/lib/derive.ts, src/lib/insights.ts, src/app/profile.tsx):
//
//   earned   income transactions in the period
//   saved    expense transactions in the "savings" category (set aside, not spent)
//   spent    every other expense transaction
//   income   the profile's monthly income + earned          (calendar months)
//   balance  income - spent - saved
//   budget   max(income - savings goal, 0)
//   planned savings rate = savings goal / profile income    (what Profile shows)
//
// Two things the app's screens never have to say but Kapy does:
//   - The profile income is a *monthly* figure. For a week or a custom range it
//     does not apply, so only logged income counts and `balance` is not offered
//     (a `netCashFlow` is, with its basis stated).
//   - A past month uses the *current* profile income and goal; the app does not
//     keep history of them. That is reported as a limitation, not hidden.

import {
  categoryInfo,
  categoryLabel,
  INCOME_CATEGORY_IDS,
  type CategoryKind,
} from "./categories.ts";
import {
  divideRound,
  money,
  percent,
  scaleRound,
  senOf,
  sumSen,
  toSen,
  type Money,
  type Sen,
} from "./money.ts";
import type { ResolvedPeriod } from "./period.ts";

// ── input ───────────────────────────────────────────────────

export interface Txn {
  id?: string;
  sen: Sen;
  type: "expense" | "income";
  category: string;
  /** Epoch milliseconds. */
  at: number;
  note?: string | null;
}

export interface Profile {
  incomeSen: Sen;
  savingsGoalSen: Sen;
  budgetsSen: Record<string, Sen>;
}

export const EMPTY_PROFILE: Profile = { incomeSen: 0, savingsGoalSen: 0, budgetsSen: {} };

/**
 * Turns database rows into transactions. Rows that cannot be trusted (bad
 * amount, type or date) are dropped and counted, never guessed at.
 */
export function normalizeRows(rows: unknown[]): { txns: Txn[]; dropped: number } {
  const txns: Txn[] = [];
  let dropped = 0;
  for (const raw of rows) {
    const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    const sen = toSen(r.amount);
    const at = typeof r.date === "string" || typeof r.date === "number" ? new Date(r.date as string).getTime() : NaN;
    if (sen === null || sen <= 0 || (r.type !== "expense" && r.type !== "income") || !Number.isFinite(at)) {
      dropped++;
      continue;
    }
    txns.push({
      id: typeof r.id === "string" ? r.id : undefined,
      sen,
      type: r.type,
      category: typeof r.category === "string" && r.category ? r.category : "other",
      at,
      note: typeof r.note === "string" ? r.note : null,
    });
  }
  return { txns, dropped };
}

/** Reads a `profiles` row. Negative or malformed values become 0. */
export function normalizeProfile(row: unknown): Profile {
  const r = (typeof row === "object" && row !== null ? row : {}) as Record<string, unknown>;
  const nonNegative = (v: unknown) => {
    const s = toSen(v);
    return s !== null && s > 0 ? s : 0;
  };
  const budgetsSen: Record<string, Sen> = {};
  if (typeof r.budgets === "object" && r.budgets !== null && !Array.isArray(r.budgets)) {
    for (const [id, v] of Object.entries(r.budgets as Record<string, unknown>)) {
      const s = nonNegative(v);
      if (s > 0) budgetsSen[id] = s;
    }
  }
  return {
    incomeSen: nonNegative(r.income),
    savingsGoalSen: nonNegative(r.savings_goal),
    budgetsSen,
  };
}

// ── helpers ─────────────────────────────────────────────────

const inPeriod = (t: Txn, p: ResolvedPeriod) => t.at >= p.startMs && t.at < p.endMs;
const isSavings = (t: Txn) => t.type === "expense" && t.category === "savings";
const isSpending = (t: Txn) => t.type === "expense" && t.category !== "savings";

const byDesc = <T extends { sort: number; key: string }>(a: T, b: T) =>
  b.sort - a.sort || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

export interface PeriodInfo {
  label: string;
  from: string;
  to: string;
  days: number;
  elapsedDays: number;
  complete: boolean;
}

const periodInfo = (p: ResolvedPeriod): PeriodInfo => ({
  label: p.label,
  from: p.fromDate,
  to: p.toDate,
  days: p.days,
  elapsedDays: p.elapsedDays,
  complete: p.complete,
});

// ── period summary ──────────────────────────────────────────

export interface CategoryLine {
  category: string;
  label: string;
  kind: CategoryKind | "unknown";
  spent: Money;
  /** Share of spending (savings excluded), or null if nothing was spent. */
  sharePercent: number | null;
  count: number;
}

export type Projection =
  | { available: true; projectedSpend: Money; projectedRemainingSpend: Money; basis: string }
  | { available: false; reason: "period_complete" | "not_a_calendar_month" | "too_early" | "no_spending" };

export interface PeriodSummary {
  currency: "MYR";
  period: PeriodInfo;
  transactionCount: number;
  earned: Money;
  spent: Money;
  saved: Money;
  income: Money;
  incomeBasis: "profile_monthly_plus_logged_income" | "logged_income_only";
  /** income - spent - saved. Calendar months only. */
  balance: Money | null;
  /** earned - spent - saved, whatever the period. */
  netCashFlow: Money;
  /** max(income - savings goal, 0). Calendar months only. */
  budget: Money | null;
  remainingBudget: Money | null;
  overBudgetBy: Money | null;
  budgetUsedPercent: number | null;
  /** savings goal / profile income — the figure the Profile screen calls "Savings Rate". */
  plannedSavingsRatePercent: number | null;
  /** saved / income — what was actually set aside. */
  actualSavingsRatePercent: number | null;
  needs: Money;
  wants: Money;
  uncategorised: Money;
  spendingByCategory: CategoryLine[];
  incomeByCategory: { category: string; label: string; earned: Money; count: number }[];
  averageDailySpend: Money | null;
  projection: Projection;
  limitations: string[];
}

/** Below this many elapsed days a month-end projection is guesswork. */
export const MIN_DAYS_FOR_PROJECTION = 3;

export function summarizePeriod(
  all: Txn[],
  period: ResolvedPeriod,
  profile: Profile | null,
  extraLimitations: string[] = []
): PeriodSummary {
  const txns = all.filter((t) => inPeriod(t, period));
  const limitations = [...extraLimitations];
  if (!profile) limitations.push("profile_unavailable");
  const p = profile ?? EMPTY_PROFILE;

  const earnedSen = sumSen(txns.filter((t) => t.type === "income").map((t) => t.sen));
  const savedSen = sumSen(txns.filter(isSavings).map((t) => t.sen));
  const spentSen = sumSen(txns.filter(isSpending).map((t) => t.sen));

  const calendar = period.isCalendarMonth;
  const incomeSen = (calendar ? p.incomeSen : 0) + earnedSen;
  const netSen = earnedSen - spentSen - savedSen;

  if (txns.length === 0) limitations.push("no_transactions_in_period");
  if (!period.complete && period.elapsedDays < period.days) limitations.push("period_still_in_progress");
  if (calendar && p.incomeSen === 0) limitations.push("monthly_income_not_set");
  if (calendar && period.complete && p.incomeSen > 0) limitations.push("past_month_uses_current_profile_income");
  if (!calendar) limitations.push("monthly_budget_and_balance_not_applicable_to_this_period");

  // Spending by category (savings excluded), with Needs / Wants split.
  const spendTotals = new Map<string, { sen: Sen; count: number }>();
  for (const t of txns.filter(isSpending)) {
    const e = spendTotals.get(t.category) ?? { sen: 0, count: 0 };
    e.sen += t.sen;
    e.count += 1;
    spendTotals.set(t.category, e);
  }
  const spendingByCategory: CategoryLine[] = [...spendTotals.entries()]
    .map(([category, e]) => ({
      sort: e.sen,
      key: category,
      line: {
        category,
        label: categoryLabel(category),
        kind: (categoryInfo(category)?.kind ?? "unknown") as CategoryLine["kind"],
        spent: money(e.sen),
        sharePercent: percent(e.sen, spentSen),
        count: e.count,
      },
    }))
    .sort(byDesc)
    .map((x) => x.line);

  const kindTotal = (k: CategoryKind) =>
    sumSen(spendingByCategory.filter((l) => l.kind === k).map((l) => senOf(l.spent)));

  const incomeTotals = new Map<string, { sen: Sen; count: number }>();
  for (const t of txns.filter((t) => t.type === "income")) {
    const e = incomeTotals.get(t.category) ?? { sen: 0, count: 0 };
    e.sen += t.sen;
    e.count += 1;
    incomeTotals.set(t.category, e);
  }
  const incomeByCategory = [...incomeTotals.entries()]
    .map(([category, e]) => ({
      sort: e.sen,
      key: category,
      line: { category, label: categoryLabel(category), earned: money(e.sen), count: e.count },
    }))
    .sort(byDesc)
    .map((x) => x.line);

  const budgetSen = calendar ? Math.max(incomeSen - p.savingsGoalSen, 0) : null;

  // Average per elapsed day: for a period still running that is days so far, so
  // "RM 40 a day" is not diluted by days that have not happened yet.
  const averageDailySpend =
    period.elapsedDays > 0 ? money(divideRound(spentSen, period.elapsedDays)) : null;

  let projection: Projection;
  if (period.complete) projection = { available: false, reason: "period_complete" };
  else if (!calendar) projection = { available: false, reason: "not_a_calendar_month" };
  else if (period.elapsedDays < MIN_DAYS_FOR_PROJECTION) projection = { available: false, reason: "too_early" };
  else if (spentSen === 0) projection = { available: false, reason: "no_spending" };
  else {
    const projected = scaleRound(spentSen, period.days, period.elapsedDays);
    projection = {
      available: true,
      projectedSpend: money(projected),
      projectedRemainingSpend: money(Math.max(projected - spentSen, 0)),
      basis: `spent so far ÷ ${period.elapsedDays} days elapsed × ${period.days} days in the month (assumes the same daily pace continues)`,
    };
  }

  return {
    currency: "MYR",
    period: periodInfo(period),
    transactionCount: txns.length,
    earned: money(earnedSen),
    spent: money(spentSen),
    saved: money(savedSen),
    income: money(incomeSen),
    incomeBasis: calendar ? "profile_monthly_plus_logged_income" : "logged_income_only",
    balance: calendar ? money(incomeSen - spentSen - savedSen) : null,
    netCashFlow: money(netSen),
    budget: budgetSen === null ? null : money(budgetSen),
    remainingBudget: budgetSen === null ? null : money(budgetSen - spentSen),
    overBudgetBy: budgetSen !== null && spentSen > budgetSen ? money(spentSen - budgetSen) : null,
    budgetUsedPercent: budgetSen === null ? null : percent(spentSen, budgetSen),
    plannedSavingsRatePercent: calendar ? percent(p.savingsGoalSen, p.incomeSen) : null,
    actualSavingsRatePercent: percent(savedSen, incomeSen),
    needs: money(kindTotal("needs")),
    wants: money(kindTotal("wants")),
    uncategorised: money(kindTotal("unknown" as CategoryKind)),
    spendingByCategory,
    incomeByCategory,
    averageDailySpend,
    projection,
    limitations,
  };
}

// ── one category ────────────────────────────────────────────

export interface CategoryReport {
  category: string;
  label: string;
  direction: "expense" | "income";
  period: PeriodInfo;
  total: Money;
  count: number;
  /** Share of all spending in the period; null for income or when nothing was spent. */
  sharePercentOfSpending: number | null;
  budget:
    | null
    | {
        limit: Money;
        usedPercent: number | null;
        remaining: Money;
        overBy: Money | null;
        status: BudgetStatus;
      };
  budgetNote?: "no_budget_set" | "budgets_are_monthly";
}

export type BudgetStatus = "ok" | "near" | "over";

/** A category budget is "near" at 80% — the same threshold the app's overall alert uses. */
export const NEAR_THRESHOLD_NUM = 8;
export const NEAR_THRESHOLD_DEN = 10;

function statusFor(spent: Sen, limit: Sen): BudgetStatus {
  if (spent > limit) return "over";
  if (spent * NEAR_THRESHOLD_DEN > limit * NEAR_THRESHOLD_NUM) return "near";
  return "ok";
}

export function categoryReport(
  all: Txn[],
  period: ResolvedPeriod,
  categoryId: string,
  profile: Profile | null
): CategoryReport {
  const txns = all.filter((t) => inPeriod(t, period));
  const income = INCOME_CATEGORY_IDS.includes(categoryId);
  const rows = txns.filter((t) => t.category === categoryId && t.type === (income ? "income" : "expense"));
  const totalSen = sumSen(rows.map((t) => t.sen));
  const spentSen = sumSen(txns.filter(isSpending).map((t) => t.sen));

  const report: CategoryReport = {
    category: categoryId,
    label: categoryLabel(categoryId),
    direction: income ? "income" : "expense",
    period: periodInfo(period),
    total: money(totalSen),
    count: rows.length,
    sharePercentOfSpending: income || categoryId === "savings" ? null : percent(totalSen, spentSen),
    budget: null,
  };

  if (income) return report;
  const limit = profile?.budgetsSen[categoryId] ?? 0;
  if (!period.isCalendarMonth) {
    report.budgetNote = "budgets_are_monthly";
  } else if (limit <= 0) {
    report.budgetNote = "no_budget_set";
  } else {
    report.budget = {
      limit: money(limit),
      usedPercent: percent(totalSen, limit),
      remaining: money(limit - totalSen),
      overBy: totalSen > limit ? money(totalSen - limit) : null,
      status: statusFor(totalSen, limit),
    };
  }
  return report;
}

// ── budget status ───────────────────────────────────────────

export interface BudgetReport {
  period: PeriodInfo;
  available: boolean;
  reason?: "budgets_are_monthly" | "no_budget_or_income_set";
  overall: null | {
    budget: Money;
    spent: Money;
    remaining: Money;
    overBy: Money | null;
    usedPercent: number | null;
    status: BudgetStatus;
  };
  categories: {
    category: string;
    label: string;
    limit: Money;
    spent: Money;
    remaining: Money;
    overBy: Money | null;
    usedPercent: number | null;
    status: BudgetStatus;
  }[];
}

export function budgetReport(all: Txn[], period: ResolvedPeriod, profile: Profile | null): BudgetReport {
  const info = periodInfo(period);
  if (!period.isCalendarMonth) {
    return { period: info, available: false, reason: "budgets_are_monthly", overall: null, categories: [] };
  }
  const s = summarizePeriod(all, period, profile);
  const p = profile ?? EMPTY_PROFILE;
  const txns = all.filter((t) => inPeriod(t, period));

  // Per-category limits count every expense in that category, as the app's
  // category-over-budget alert does.
  const categories = Object.entries(p.budgetsSen)
    .map(([category, limit]) => {
      const spent = sumSen(txns.filter((t) => t.type === "expense" && t.category === category).map((t) => t.sen));
      return {
        sort: percent(spent, limit) ?? 0,
        key: category,
        line: {
          category,
          label: categoryLabel(category),
          limit: money(limit),
          spent: money(spent),
          remaining: money(limit - spent),
          overBy: spent > limit ? money(spent - limit) : null,
          usedPercent: percent(spent, limit),
          status: statusFor(spent, limit),
        },
      };
    })
    .sort(byDesc)
    .map((x) => x.line);

  const budgetSen = s.budget ? senOf(s.budget) : 0;
  const spentSen = senOf(s.spent);
  const overall =
    budgetSen > 0
      ? {
          budget: money(budgetSen),
          spent: money(spentSen),
          remaining: money(budgetSen - spentSen),
          overBy: spentSen > budgetSen ? money(spentSen - budgetSen) : null,
          usedPercent: percent(spentSen, budgetSen),
          status: statusFor(spentSen, budgetSen),
        }
      : null;

  if (!overall && categories.length === 0) {
    return { period: info, available: false, reason: "no_budget_or_income_set", overall: null, categories: [] };
  }
  return { period: info, available: true, overall, categories };
}

// ── comparison ──────────────────────────────────────────────

export interface Delta {
  amount: Money; // later − earlier; negative = decrease
  percentChange: number | null; // null when the earlier figure is zero
}

const delta = (later: Sen, earlier: Sen): Delta => ({
  amount: money(later - earlier),
  percentChange: earlier > 0 ? percent(later - earlier, earlier) : null,
});

export interface Comparison {
  currency: "MYR";
  earlier: { period: PeriodInfo; earned: Money; spent: Money; saved: Money; averageDailySpend: Money | null };
  later: { period: PeriodInfo; earned: Money; spent: Money; saved: Money; averageDailySpend: Money | null };
  /** later − earlier, for each headline figure. */
  change: { spent: Delta; earned: Delta; saved: Delta; averageDailySpend: Delta | null };
  /** False when the periods cover different numbers of days so far — read per-day figures. */
  likeForLike: boolean;
  /** The categories that moved most, largest absolute change first. */
  categoryChanges: {
    category: string;
    label: string;
    earlier: Money;
    later: Money;
    change: Delta;
  }[];
  biggestIncrease: string | null;
  biggestDecrease: string | null;
  limitations: string[];
}

/** `a` is the earlier period, `b` the later one. */
export function comparePeriods(a: PeriodSummary, b: PeriodSummary, maxCategories = 6): Comparison {
  const catSen = (s: PeriodSummary) =>
    new Map(s.spendingByCategory.map((l) => [l.category, senOf(l.spent)]));
  const ca = catSen(a);
  const cb = catSen(b);
  const ids = [...new Set([...ca.keys(), ...cb.keys()])];

  const all = ids
    .map((id) => {
      const x = ca.get(id) ?? 0;
      const y = cb.get(id) ?? 0;
      return { id, x, y, d: y - x };
    })
    .sort((m, n) => Math.abs(n.d) - Math.abs(m.d) || (m.id < n.id ? -1 : 1));

  const categoryChanges = all
    .filter((c) => c.d !== 0)
    .slice(0, maxCategories)
    .map((c) => ({
      category: c.id,
      label: categoryLabel(c.id),
      earlier: money(c.x),
      later: money(c.y),
      change: delta(c.y, c.x),
    }));

  const inc = all.filter((c) => c.d > 0).sort((m, n) => n.d - m.d || (m.id < n.id ? -1 : 1))[0];
  const dec = all.filter((c) => c.d < 0).sort((m, n) => m.d - n.d || (m.id < n.id ? -1 : 1))[0];

  const slim = (s: PeriodSummary) => ({
    period: s.period,
    earned: s.earned,
    spent: s.spent,
    saved: s.saved,
    averageDailySpend: s.averageDailySpend,
  });

  const likeForLike = a.period.elapsedDays === b.period.elapsedDays && a.period.days === b.period.days;
  const limitations: string[] = [];
  if (!likeForLike) limitations.push("periods_cover_different_numbers_of_days");
  if (a.transactionCount === 0) limitations.push("earlier_period_has_no_transactions");
  if (b.transactionCount === 0) limitations.push("later_period_has_no_transactions");

  return {
    currency: "MYR",
    earlier: slim(a),
    later: slim(b),
    change: {
      spent: delta(senOf(b.spent), senOf(a.spent)),
      earned: delta(senOf(b.earned), senOf(a.earned)),
      saved: delta(senOf(b.saved), senOf(a.saved)),
      averageDailySpend:
        a.averageDailySpend && b.averageDailySpend
          ? delta(senOf(b.averageDailySpend), senOf(a.averageDailySpend))
          : null,
    },
    likeForLike,
    categoryChanges,
    biggestIncrease: inc ? categoryLabel(inc.id) : null,
    biggestDecrease: dec ? categoryLabel(dec.id) : null,
    limitations,
  };
}

// ── trend ───────────────────────────────────────────────────

export interface Trend {
  currency: "MYR";
  months: {
    label: string;
    earned: Money;
    spent: Money;
    saved: Money;
    netCashFlow: Money;
    /** True for the month still in progress. */
    partial: boolean;
  }[];
  /** Spending, latest complete month vs the one before it. */
  direction: "rising" | "falling" | "flat" | "insufficient_data";
  latestVsPreviousSpentPercent: number | null;
  limitations: string[];
}

/** A change smaller than this (in percent) is called "flat". */
const FLAT_BAND_PERCENT = 5;

export function monthlyTrend(all: Txn[], periods: ResolvedPeriod[], profile: Profile | null): Trend {
  const summaries = periods.map((p) => summarizePeriod(all, p, profile));
  const months = summaries.map((s) => ({
    label: s.period.label,
    earned: s.earned,
    spent: s.spent,
    saved: s.saved,
    netCashFlow: s.netCashFlow,
    partial: !s.period.complete,
  }));

  const complete = summaries.filter((s) => s.period.complete);
  let direction: Trend["direction"] = "insufficient_data";
  let pct: number | null = null;
  const limitations: string[] = [];
  if (complete.length >= 2) {
    const prev = senOf(complete[complete.length - 2].spent);
    const last = senOf(complete[complete.length - 1].spent);
    pct = prev > 0 ? percent(last - prev, prev) : null;
    if (pct === null) direction = "insufficient_data";
    else if (Math.abs(pct) < FLAT_BAND_PERCENT) direction = "flat";
    else direction = pct > 0 ? "rising" : "falling";
  } else {
    limitations.push("fewer_than_two_complete_months");
  }
  if (summaries.some((s) => !s.period.complete)) limitations.push("latest_month_is_still_in_progress");
  return { currency: "MYR", months, direction, latestVsPreviousSpentPercent: pct, limitations };
}

// ── "can I afford to save RM x a month?" ────────────────────

export interface Affordability {
  currency: "MYR";
  period: PeriodInfo;
  proposedSaving: Money;
  balanceNow: Money | null;
  balanceAfterSaving: Money | null;
  /** Projected spending still to come this month, if it can be estimated. */
  projectedRemainingSpend: Money | null;
  balanceAfterSavingAndProjectedSpend: Money | null;
  verdict: "comfortable" | "tight" | "not_affordable" | "unknown";
  basis: string;
  limitations: string[];
}

/** Whether setting aside `amountSen` fits this month. Transparent arithmetic, no advice. */
export function affordability(summary: PeriodSummary, amountSen: Sen): Affordability {
  const limitations = [...summary.limitations];
  const base = {
    currency: "MYR" as const,
    period: summary.period,
    proposedSaving: money(amountSen),
  };
  if (!summary.balance || summary.income.amount <= 0) {
    return {
      ...base,
      balanceNow: summary.balance,
      balanceAfterSaving: null,
      projectedRemainingSpend: null,
      balanceAfterSavingAndProjectedSpend: null,
      verdict: "unknown",
      basis: "Needs this month's income. It is not set, so nothing can be worked out.",
      limitations,
    };
  }
  const balance = senOf(summary.balance);
  const after = balance - amountSen;
  const remainingSpend =
    summary.projection.available ? senOf(summary.projection.projectedRemainingSpend) : null;
  const afterProjected = remainingSpend === null ? null : after - remainingSpend;

  let verdict: Affordability["verdict"];
  if (after < 0) verdict = "not_affordable";
  else if (afterProjected !== null && afterProjected < 0) verdict = "tight";
  else if (afterProjected === null) verdict = "tight";
  else verdict = "comfortable";
  if (afterProjected === null) limitations.push("projected_spending_unavailable");

  return {
    ...base,
    balanceNow: summary.balance,
    balanceAfterSaving: money(after),
    projectedRemainingSpend: remainingSpend === null ? null : money(remainingSpend),
    balanceAfterSavingAndProjectedSpend: afterProjected === null ? null : money(afterProjected),
    verdict,
    basis:
      "balance now − the amount to save − spending still expected this month at the current daily pace. " +
      "If the pace cannot be estimated, the result is at best 'tight'.",
    limitations,
  };
}
