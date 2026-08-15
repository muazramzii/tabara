// Shared display helpers.
//
// `fmt`, `isThisMonth` and `cat` were each redefined in index.tsx,
// insights.tsx, history.tsx and profile.tsx. Same logic, four copies — this
// is the single source. Pure formatting only; no data access, no business
// rules beyond what the screens were already doing.

import { ALL_CATEGORIES } from "../constants/categories";
import type { Transaction } from "./db";

/** "RM 22.85" */
export const fmt = (n: number) => `RM ${n.toFixed(2)}`;

/** "-RM22.85" / "+RM500.00" — signed, for transaction rows. */
export const fmtSigned = (n: number, type: "expense" | "income") =>
  `${type === "income" ? "+" : "−"}RM${n.toFixed(2)}`;

/** "7 Jan 2026" */
export const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });

/** "Jan 7" — compact, for transaction rows. */
export const fmtDateShort = (d: Date) =>
  d.toLocaleDateString("en-MY", { month: "short", day: "numeric" });

/** Looks up a category across both expense and income lists. */
export const cat = (id: string) => ALL_CATEGORIES.find((c) => c.id === id);

export const isSameMonth = (d: Date, ref: Date) =>
  d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear();

export const isThisMonth = (d: Date) => isSameMonth(d, new Date());

/** "January" for the given month (defaults to now). */
export const monthLabel = (d = new Date()) =>
  d.toLocaleDateString("en-MY", { month: "long" });

/** "JAN" — for the month selector pills. */
export const monthShort = (d: Date) =>
  d.toLocaleDateString("en-MY", { month: "short" }).toUpperCase();

/**
 * The last `count` months ending with the current one, oldest first.
 * Used by the month selector — purely derived from today's date, so it works
 * without any new stored data.
 */
export function recentMonths(count = 5): Date[] {
  const now = new Date();
  const months: Date[] = [];
  for (let i = count - 1; i >= 0; i--) {
    months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  }
  return months;
}

/** Totals a list of transactions, filtered by type. */
export const sumBy = (txns: Transaction[], type: "expense" | "income") =>
  txns.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);

/** Spend per category, biggest first. */
export function byCategory(txns: Transaction[]) {
  const map = new Map<string, number>();
  for (const t of txns) {
    map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
  }
  return [...map.entries()]
    .map(([id, amount]) => ({ id, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** Groups transactions under a date heading, newest day first. */
export function groupByDay(txns: Transaction[]) {
  const groups = new Map<string, Transaction[]>();
  for (const t of txns) {
    const key = fmtDate(t.date);
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }
  return [...groups.entries()].map(([label, items]) => ({ label, items }));
}
