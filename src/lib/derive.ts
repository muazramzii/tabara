// The month's money maths, as a pure function.
//
// Extracted from finance-context so it can be tested without mounting a React
// provider. This is the calculation that decides every number on the home
// screen, and it has already been wrong once — income and savings transfers
// were ignored, so only spending moved the balance. Logic this central should
// be verifiable directly rather than only through the UI.

import type { Transaction, UserProfile } from "./db";
import { isThisMonth } from "./format";

export type Mood = { emoji: string; title: string; subtitle: string };

export type Derived = {
  /** Real spending this month — savings transfers excluded. */
  spent: number;
  /** Money moved into savings this month. */
  saved: number;
  /** Income transactions logged this month. */
  earned: number;
  /** Monthly income from the profile, plus anything earned. */
  income: number;
  /** What is left after spending and setting money aside. */
  balance: number;
  /** Income minus the savings goal — what there is to spend. */
  budget: number;
  remaining: number;
  savingsGoal: number;
  mood: Mood;
};

export function computeMood(spent: number, budget: number): Mood {
  if (budget <= 0)
    return { emoji: "🦫", title: "Kapy is waiting", subtitle: "Set your income to start tracking" };
  const ratio = spent / budget;
  if (ratio <= 0.7)
    return { emoji: "🦫", title: "Kapy is feeling chill", subtitle: "You're well within budget" };
  if (ratio <= 1)
    return { emoji: "🦫", title: "Kapy is a bit careful", subtitle: "Getting close to your budget" };
  return { emoji: "🦫", title: "Kapy is stressed", subtitle: "You've gone over budget this month" };
}

export function deriveTotals(
  transactions: Transaction[],
  profile: UserProfile | null
): Derived {
  const baseIncome = profile?.income ?? 0;
  const savingsGoal = profile?.savingsGoal ?? 0;

  const thisMonth = transactions.filter((t) => isThisMonth(t.date));

  // Income transactions were previously ignored entirely, so logging a
  // salary changed nothing on screen. They now add to what came in.
  const earned = thisMonth
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  // Moving money into savings is stored as an expense in the "savings"
  // category. It leaves your spendable pool, but it is not *spending* — so
  // it's tracked separately and no longer counts against the budget or
  // makes Kapy stressed.
  const saved = thisMonth
    .filter((t) => t.type === "expense" && t.category === "savings")
    .reduce((sum, t) => sum + t.amount, 0);

  const spent = thisMonth
    .filter((t) => t.type === "expense" && t.category !== "savings")
    .reduce((sum, t) => sum + t.amount, 0);

  const income = baseIncome + earned;
  const balance = income - spent - saved;
  const budget = Math.max(income - savingsGoal, 0);

  return {
    spent,
    saved,
    earned,
    income,
    balance,
    budget,
    remaining: budget - spent,
    savingsGoal,
    mood: computeMood(spent, budget),
  };
}
