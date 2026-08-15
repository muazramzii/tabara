// Derived metrics — alerts and progression.
//
// Nothing here is stored or faked. Every value is computed from transactions
// and the profile the user already has, so it stays correct without adding a
// single database column. If the underlying data is empty, these return empty
// results rather than placeholder numbers.

import type { Ionicons } from "@expo/vector-icons";
import { ALL_CATEGORIES } from "../constants/categories";
import type { Transaction, UserProfile } from "./db";
import { cat, isThisMonth } from "./format";

export type Alert = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: "good" | "warn" | "info";
  title: string;
  message: string;
  /** Newest relevant transaction date, so the list can be ordered sensibly. */
  at: Date;
};

/**
 * Real conditions worth telling the user about, newest first.
 * These are live states, not a stored feed — when the condition stops being
 * true, the alert disappears on its own.
 */
export function buildAlerts(
  transactions: Transaction[],
  profile: UserProfile | null
): Alert[] {
  const alerts: Alert[] = [];
  const baseIncome = profile?.income ?? 0;
  const goal = profile?.savingsGoal ?? 0;
  const budgets = profile?.budgets ?? {};

  const thisMonth = transactions.filter((t) => isThisMonth(t.date));
  const expenses = thisMonth.filter((t) => t.type === "expense");

  // Same split as finance-context: income transactions count toward what came
  // in, and savings transfers are set aside rather than treated as spending.
  const earned = thisMonth
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);
  const savedExplicit = expenses
    .filter((t) => t.category === "savings")
    .reduce((s, t) => s + t.amount, 0);
  const spent = expenses
    .filter((t) => t.category !== "savings")
    .reduce((s, t) => s + t.amount, 0);
  const latest = transactions[0]?.date ?? new Date();

  const income = baseIncome + earned;

  // No income set — the app can't compute a budget without it.
  if (income <= 0) {
    alerts.push({
      id: "no-income",
      icon: "wallet-outline",
      tone: "info",
      title: "Set your monthly income",
      message: "Tabara needs it to work out your budget and the 50/30/20 split.",
      at: new Date(),
    });
  }

  const budget = Math.max(income - goal, 0);

  if (budget > 0) {
    const saved = savedExplicit;

    if (goal > 0 && saved >= goal) {
      alerts.push({
        id: "goal-hit",
        icon: "trophy-outline",
        tone: "good",
        title: "Savings goal achieved!",
        message: `You've kept RM ${saved.toFixed(2)} aside this month. Great job 🦫`,
        at: latest,
      });
    }

    if (spent > budget) {
      alerts.push({
        id: "over-budget",
        icon: "alert-circle-outline",
        tone: "warn",
        title: "Over budget this month",
        message: `You've spent RM ${(spent - budget).toFixed(2)} more than your RM ${budget.toFixed(2)} budget.`,
        at: latest,
      });
    } else if (spent > budget * 0.8) {
      alerts.push({
        id: "near-budget",
        icon: "trending-up-outline",
        tone: "warn",
        title: "Getting close to your budget",
        message: `RM ${(budget - spent).toFixed(2)} left to spend this month.`,
        at: latest,
      });
    }
  }

  // Any category that has blown through its own limit.
  const perCategory = new Map<string, number>();
  for (const t of expenses) {
    perCategory.set(t.category, (perCategory.get(t.category) ?? 0) + t.amount);
  }
  for (const [id, amount] of perCategory) {
    const limit = budgets[id] ?? 0;
    if (limit > 0 && amount > limit) {
      alerts.push({
        id: `cat-over-${id}`,
        icon: "pie-chart-outline",
        tone: "warn",
        title: `${cat(id)?.label ?? id} over budget`,
        message: `RM ${amount.toFixed(2)} spent against a RM ${limit.toFixed(2)} limit.`,
        at: latest,
      });
    }
  }

  return alerts.sort((a, b) => b.at.getTime() - a.at.getTime());
}

export type Streak = {
  /** Consecutive days up to today (or yesterday) with at least one entry. */
  current: number;
  /** Best run ever. */
  best: number;
  /** True when today has no entry yet but yesterday did — the streak is at risk. */
  atRisk: boolean;
  /** True when today already counts. */
  loggedToday: boolean;
};

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/**
 * Logging streak, derived purely from transaction dates — no counter to store
 * and nothing that can drift out of sync with reality.
 *
 * A streak survives until you miss a whole day: if you logged yesterday but
 * not yet today, it still stands and is flagged `atRisk`.
 */
export function streak(transactions: Transaction[]): Streak {
  if (transactions.length === 0) {
    return { current: 0, best: 0, atRisk: false, loggedToday: false };
  }

  const days = new Set(transactions.map((t) => dayKey(t.date)));

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const loggedToday = days.has(dayKey(today));
  const loggedYesterday = days.has(dayKey(yesterday));

  // Walk backwards from whichever of today/yesterday anchors the run.
  let current = 0;
  if (loggedToday || loggedYesterday) {
    const cursor = loggedToday ? new Date(today) : new Date(yesterday);
    while (days.has(dayKey(cursor))) {
      current++;
      cursor.setDate(cursor.getDate() - 1);
    }
  }

  // Best run: sort the distinct days and count consecutive spans.
  const sorted = [...days]
    .map((k) => {
      const [y, m, d] = k.split("-").map(Number);
      return new Date(y, m, d).getTime();
    })
    .sort((a, b) => a - b);

  const DAY = 24 * 60 * 60 * 1000;
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    // Compare calendar days rather than raw ms so DST shifts don't break the run.
    const prev = new Date(sorted[i - 1]);
    prev.setDate(prev.getDate() + 1);
    if (dayKey(prev) === dayKey(new Date(sorted[i]))) run++;
    else run = 1;
    if (run > best) best = run;
  }

  return {
    current,
    best: Math.max(best, current),
    atRisk: !loggedToday && loggedYesterday && current > 0,
    loggedToday,
  };
}

export type DayActivity = {
  /** "Mon", "Tue", … */
  label: string;
  logged: boolean;
  isToday: boolean;
  /** Later this week — drawn faint, since missing it isn't a failure yet. */
  isFuture: boolean;
};

/**
 * The current week, Monday to Sunday, marking which days have at least one
 * transaction. Derived from transaction dates like everything else here, so
 * it can't drift from what's actually recorded.
 */
export function weekActivity(transactions: Transaction[]): DayActivity[] {
  const days = new Set(transactions.map((t) => dayKey(t.date)));

  const today = new Date();
  const todayKey = dayKey(today);

  // getDay() is 0 for Sunday; shift so the week starts on Monday.
  const offsetToMonday = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - offsetToMonday);

  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return labels.map((label, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = dayKey(d);
    return {
      label,
      logged: days.has(key),
      isToday: key === todayKey,
      isFuture: i > offsetToMonday,
    };
  });
}

export type Achievement = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  unlocked: boolean;
  /** 0–100 toward unlocking, for the ones that are a count. */
  progress: number;
  /** Raw counts behind `progress`, so the UI can show "3 / 7" as well as a bar. */
  current: number;
  target: number;
};

/**
 * Badges, all computed from data that already exists. Nothing is stored, so
 * they can never disagree with the transactions they describe.
 */
export function achievements(
  transactions: Transaction[],
  profile: UserProfile | null
): Achievement[] {
  const count = transactions.length;
  const s = streak(transactions);
  const goal = profile?.savingsGoal ?? 0;
  const budgetCount = Object.keys(profile?.budgets ?? {}).length;

  const savedTotal = transactions
    .filter((t) => t.type === "expense" && t.category === "savings")
    .reduce((sum, t) => sum + t.amount, 0);

  const categoriesUsed = new Set(transactions.map((t) => t.category)).size;
  const scanned = transactions.filter((t) => (t.note ?? "").length > 0).length;

  // Builds one badge from a count and the count it's aiming at, so progress,
  // the unlocked flag and the "3 / 7" label can never disagree with each
  // other — they're all derived from the same pair of numbers.
  const badge = (
    id: string,
    icon: Achievement["icon"],
    title: string,
    description: string,
    current: number,
    target: number
  ): Achievement => ({
    id,
    icon,
    title,
    description,
    current: Math.min(current, target),
    target,
    unlocked: current >= target,
    progress: Math.min(Math.round((current / target) * 100), 100),
  });

  return [
    badge("first-step", "footsteps-outline", "First Step",
      "Log your first transaction", count, 1),
    badge("getting-going", "list-outline", "Getting Going",
      "Log 25 transactions", count, 25),
    badge("week-warrior", "flame-outline", "Week Warrior",
      "Log something 7 days in a row", s.best, 7),
    badge("month-master", "trophy-outline", "Month Master",
      "Keep a 30 day streak", s.best, 30),
    // Rounded down: showing "100 / 100" while still a few sen short would
    // look like a bug rather than a near miss.
    badge("first-hundred", "wallet-outline", "First RM100",
      "Put RM100 into savings", Math.floor(savedTotal), 100),
    badge("goal-setter", "flag-outline", "Goal Setter",
      "Set a monthly savings goal", goal > 0 ? 1 : 0, 1),
    badge("planner", "options-outline", "Planner",
      "Set limits on 5 categories", budgetCount, 5),
    badge("explorer", "compass-outline", "Explorer",
      "Use 8 different categories", categoriesUsed, 8),
    badge("note-taker", "create-outline", "Note Taker",
      "Add notes to 10 transactions", scanned, 10),
  ];
}

export type Progression = {
  xp: number;
  level: number;
  /** 0–100 toward the next level. */
  pct: number;
  xpIntoLevel: number;
  xpForLevel: number;
  maxed: boolean;
};

const MAX_LEVEL = 50;

/**
 * Experience earned from actually using the app: logging transactions, giving
 * categories budgets, and setting a savings goal. It is a plain function of
 * real usage — no stored counter, so it can never drift from reality.
 */
export function progression(
  transactions: Transaction[],
  profile: UserProfile | null
): Progression {
  const logged = transactions.length * 10;
  const budgetsSet = Object.keys(profile?.budgets ?? {}).length * 15;
  const goalSet = (profile?.savingsGoal ?? 0) > 0 ? 50 : 0;
  const incomeSet = (profile?.income ?? 0) > 0 ? 25 : 0;

  // Every distinct category used, once — rewards breadth of tracking.
  const used = new Set(transactions.map((t) => t.category));
  const variety =
    [...used].filter((id) => ALL_CATEGORIES.some((c) => c.id === id)).length * 20;

  const xp = logged + budgetsSet + goalSet + incomeSet + variety;

  // Each level costs a bit more than the last.
  let level = 1;
  let remaining = xp;
  let cost = 100;
  while (remaining >= cost && level < MAX_LEVEL) {
    remaining -= cost;
    level++;
    cost = Math.round(cost * 1.15);
  }

  const maxed = level >= MAX_LEVEL;
  return {
    xp,
    level,
    xpIntoLevel: maxed ? cost : remaining,
    xpForLevel: cost,
    pct: maxed ? 100 : Math.min((remaining / cost) * 100, 100),
    maxed,
  };
}
