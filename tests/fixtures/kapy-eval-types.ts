// Shapes shared by the Kapy evaluation datasets and the tests that score them.

export type Lang = "ms" | "en" | "manglish" | "unknown";

export type EvalIntent =
  | "check_balance"
  | "check_income"
  | "check_expenses"
  | "check_savings"
  | "check_budget"
  | "compare_periods"
  | "analyse_categories"
  | "trends"
  | "savings_advice"
  | "budgeting_advice"
  | "record_expense"
  | "record_income"
  | "financial_literacy"
  | "transaction_history"
  | "clarify_previous"
  | "projection"
  | "chitchat"
  | "unknown";

/** Periods as short tags, resolved against "now" = 22 Nov 2026. */
export type PeriodTag =
  | "this_month"
  | "last_month"
  | "this_week"
  | "last_week"
  | "today"
  | "yesterday"
  | "last_3_months"
  | "last_30_days"
  | `month:${number}`;

export interface EvalCase {
  id: string;
  text: string;
  lang: Lang;
  intent: EvalIntent;
  /** The period the message names, if it names one. */
  period?: PeriodTag;
  /** For comparisons: the two periods, earlier first as written. */
  compare?: [PeriodTag, PeriodTag];
  category?: string;
  /** Amount in ringgit, for record_* intents. */
  amount?: number;
  /** True when the message only makes sense given the previous turn. */
  followUp?: boolean;
}

/** One turn of a multi-turn scenario, and what the resolver should settle on. */
export interface ContextTurn {
  text: string;
  expect: {
    intent?: EvalIntent;
    period?: PeriodTag;
    compare?: [PeriodTag, PeriodTag];
    category?: string | null;
    /** The resolver should ask rather than guess. */
    needsClarification?: "period" | "category";
    /** The reference was carried over from an earlier turn. */
    inherited?: ("period" | "category" | "compare")[];
  };
}

export interface ContextScenario {
  id: string;
  description: string;
  turns: ContextTurn[];
}
