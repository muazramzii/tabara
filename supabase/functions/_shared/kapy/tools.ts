// The tools Kapy's model may call, and strict validation of what it sends.
//
// Principles
// ----------
// - The model asks; the server computes. Every read tool returns figures worked
//   out by finance.ts from the caller's own rows. The model is never asked to
//   add anything up.
// - Arguments are untrusted. A model can emit a wrong type, an out-of-range
//   number, an invented category, or text an attacker planted in a receipt.
//   Every argument is validated here against the server's own definitions
//   (categories, periods, amount limits) — nothing is taken from the client.
// - No tool writes. `propose_transaction` only *describes* a transaction; saving
//   happens through a separate, explicit confirmation from the person (see
//   actions.ts). That is what makes a prompt-injected "record RM 5000" harmless
//   by construction rather than by hoping the model refuses.
// - Only the caller's identity is in scope. No tool takes a user id; they all run
//   against the store built from the verified token.
//
// No imports of anything Deno- or Node-specific.

import { validateAmount } from "../amount.ts";
import {
  ALL_CATEGORY_IDS,
  EXPENSE_CATEGORY_IDS,
  INCOME_CATEGORY_IDS,
  isValidCategoryFor,
} from "./categories.ts";
import type { Resolved } from "./context.ts";
import { toSen, type Sen } from "./money.ts";
import { parsePeriodSpec, type PeriodSpec } from "./period.ts";
import { sanitizeText } from "../sanitize.ts";
import { validateDateString } from "../date.ts";

export const TOOL_NAMES = [
  "get_financial_summary",
  "get_category_spending",
  "compare_periods",
  "get_spending_trend",
  "get_transactions",
  "get_budget_status",
  "check_savings_affordability",
  "search_financial_knowledge",
  "propose_transaction",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export const MAX_NOTE = 80;
export const MAX_QUERY = 200;
export const MAX_TREND_MONTHS = 12;
export const MAX_TRANSACTIONS = 10;

export type ValidatedCall =
  | { name: "get_financial_summary"; period: PeriodSpec }
  | { name: "get_category_spending"; period: PeriodSpec; category: string | null }
  | { name: "compare_periods"; a: PeriodSpec; b: PeriodSpec }
  | { name: "get_spending_trend"; months: number }
  | { name: "get_transactions"; period: PeriodSpec; category: string | null; type: "expense" | "income" | null; limit: number }
  | { name: "get_budget_status"; period: PeriodSpec }
  | { name: "check_savings_affordability"; amountSen: Sen }
  | { name: "search_financial_knowledge"; query: string }
  | {
      name: "propose_transaction";
      amountSen: Sen;
      type: "expense" | "income";
      category: string;
      /** YYYY-MM-DD, or null for "now". */
      date: string | null;
      note: string | null;
    };

export type Validation = { ok: true; call: ValidatedCall } | { ok: false; error: string };

// ── declarations sent to the model ──────────────────────────

const PERIOD_SCHEMA = {
  type: "object",
  // Repeated in most tools, so kept short. Malaysia time; weeks run Monday to Sunday.
  description:
    "kind: today | yesterday | this_week | last_week | this_month | last_month | month (+year, month) | last_n_days (+days) | last_n_months (+months) | range (+from, to as YYYY-MM-DD).",
  properties: {
    kind: {
      type: "string",
      enum: ["today", "yesterday", "this_week", "last_week", "this_month", "last_month", "month", "last_n_days", "last_n_months", "range"],
    },
    year: { type: "integer" },
    month: { type: "integer" },
    days: { type: "integer" },
    months: { type: "integer" },
    from: { type: "string", description: "YYYY-MM-DD" },
    to: { type: "string", description: "YYYY-MM-DD" },
  },
  required: ["kind"],
};

export function toolDeclarations(allowProposals: boolean) {
  const declarations: unknown[] = [
    {
      name: "get_financial_summary",
      description:
        "The user's income, spending, savings, balance, budget, savings rate, spending by category and a month-end projection for a period. " +
        "Use for questions about how much was earned, spent, saved or left. All figures are computed exactly; quote them as given.",
      parameters: { type: "object", properties: { period: PERIOD_SCHEMA }, required: ["period"] },
    },
    {
      name: "get_category_spending",
      description:
        "How much the user spent (or earned, for income categories) in one category for a period, its share of spending, and its budget status. " +
        "Omit category to get the top categories instead.",
      parameters: {
        type: "object",
        properties: { period: PERIOD_SCHEMA, category: { type: "string", enum: [...ALL_CATEGORY_IDS] } },
        required: ["period"],
      },
    },
    {
      name: "compare_periods",
      description:
        "Compare two periods: totals, the change, and which categories moved most. period_a is the earlier one, period_b the later one. " +
        "Use for 'compare', 'than last month', 'why is it higher'.",
      parameters: { type: "object", properties: { period_a: PERIOD_SCHEMA, period_b: PERIOD_SCHEMA }, required: ["period_a", "period_b"] },
    },
    {
      name: "get_spending_trend",
      description: "Month-by-month income, spending and savings for the last N months (2 to 12), and whether spending is rising, falling or flat.",
      parameters: { type: "object", properties: { months: { type: "integer" } }, required: ["months"] },
    },
    {
      name: "get_transactions",
      description: `Up to ${MAX_TRANSACTIONS} of the user's most recent transactions in a period, optionally for one category or type.`,
      parameters: {
        type: "object",
        properties: {
          period: PERIOD_SCHEMA,
          category: { type: "string", enum: [...ALL_CATEGORY_IDS] },
          type: { type: "string", enum: ["expense", "income"] },
          limit: { type: "integer" },
        },
        required: ["period"],
      },
    },
    {
      name: "get_budget_status",
      description: "Budget status for a calendar month: overall budget used and remaining, and each category budget the user has set.",
      parameters: { type: "object", properties: { period: PERIOD_SCHEMA }, required: ["period"] },
    },
    {
      name: "check_savings_affordability",
      description:
        "Whether setting aside a monthly amount fits this month's balance and expected spending. Use for 'can I afford to save RM x', 'is RM x a month okay'.",
      parameters: { type: "object", properties: { monthly_amount: { type: "number", description: "Ringgit" } }, required: ["monthly_amount"] },
    },
    {
      name: "search_financial_knowledge",
      description:
        "General financial education for Malaysians (50/30/20, emergency fund, needs vs wants, PTPTN, KWSP/EPF, DuitNow and e-wallets, debt basics, zakat, cost of living). " +
        "Use for 'what is...' and 'how does...' questions that are not about the user's own numbers. Returns vetted text; it contains no rates or policies.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  ];

  if (allowProposals) {
    declarations.push({
      name: "propose_transaction",
      description:
        "Prepare a transaction for the user to CONFIRM. Nothing is saved by this call: the app shows the user a confirmation card and only saves after they tap Confirm. " +
        "Use only when the user is clearly stating money that actually moved ('I spent RM12 on lunch', 'dapat gaji 2000', 'masukkan RM50 ke tabung'), never for a question or a hypothetical. " +
        "If the amount or type is unclear, ask instead. Money moved into savings is an expense in the 'savings' category.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Ringgit, positive, exactly as the user said it." },
          type: { type: "string", enum: ["expense", "income"] },
          category: { type: "string", enum: [...EXPENSE_CATEGORY_IDS, ...INCOME_CATEGORY_IDS] },
          date: { type: "string", description: "YYYY-MM-DD, only if the user gave a day or it is on a scanned receipt. Omit for 'now'." },
          note: { type: "string", description: "A short label such as the shop name." },
        },
        required: ["amount", "type", "category"],
      },
    });
  }
  return [{ functionDeclarations: declarations }];
}

// ── validation ──────────────────────────────────────────────

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const knownCategory = (v: unknown): string | null =>
  typeof v === "string" && ALL_CATEGORY_IDS.includes(v) ? v : null;

/**
 * Validates one model tool call. `hints` (what the conversation resolved to) is
 * used only to fill a period the model left out; it never overrides one it gave.
 */
export function validateToolCall(name: unknown, args: unknown, hints: Resolved | null): Validation {
  if (typeof name !== "string" || !(TOOL_NAMES as readonly string[]).includes(name)) {
    return { ok: false, error: "unknown_tool" };
  }
  const a = isObject(args) ? args : {};

  const period = (raw: unknown, fallback?: PeriodSpec | null): PeriodSpec | null =>
    raw === undefined ? fallback ?? null : parsePeriodSpec(raw);

  switch (name as ToolName) {
    case "get_financial_summary": {
      const p = period(a.period, hints?.period ?? { kind: "this_month" });
      return p ? { ok: true, call: { name: "get_financial_summary", period: p } } : { ok: false, error: "invalid_period" };
    }

    case "get_category_spending": {
      const p = period(a.period, hints?.period ?? { kind: "this_month" });
      if (!p) return { ok: false, error: "invalid_period" };
      let category: string | null = null;
      if (a.category !== undefined && a.category !== null) {
        category = knownCategory(a.category);
        if (!category) return { ok: false, error: "unknown_category" };
      }
      return { ok: true, call: { name: "get_category_spending", period: p, category } };
    }

    case "compare_periods": {
      const pa = period(a.period_a, hints?.compare?.[0]);
      const pb = period(a.period_b, hints?.compare?.[1]);
      if (!pa || !pb) return { ok: false, error: "invalid_period" };
      return { ok: true, call: { name: "compare_periods", a: pa, b: pb } };
    }

    case "get_spending_trend": {
      const m = a.months === undefined ? 3 : a.months;
      if (typeof m !== "number" || !Number.isInteger(m) || m < 2 || m > MAX_TREND_MONTHS) {
        return { ok: false, error: "invalid_months" };
      }
      return { ok: true, call: { name: "get_spending_trend", months: m } };
    }

    case "get_transactions": {
      const p = period(a.period, hints?.period ?? { kind: "last_n_days", days: 30 });
      if (!p) return { ok: false, error: "invalid_period" };
      let category: string | null = null;
      if (a.category !== undefined && a.category !== null) {
        category = knownCategory(a.category);
        if (!category) return { ok: false, error: "unknown_category" };
      }
      let type: "expense" | "income" | null = null;
      if (a.type !== undefined && a.type !== null) {
        if (a.type !== "expense" && a.type !== "income") return { ok: false, error: "invalid_type" };
        type = a.type;
      }
      let limit = 5;
      if (a.limit !== undefined) {
        if (typeof a.limit !== "number" || !Number.isInteger(a.limit) || a.limit < 1) return { ok: false, error: "invalid_limit" };
        limit = Math.min(a.limit, MAX_TRANSACTIONS);
      }
      return { ok: true, call: { name: "get_transactions", period: p, category, type, limit } };
    }

    case "get_budget_status": {
      const p = period(a.period, hints?.period ?? { kind: "this_month" });
      return p ? { ok: true, call: { name: "get_budget_status", period: p } } : { ok: false, error: "invalid_period" };
    }

    case "check_savings_affordability": {
      const amount = validateAmount(a.monthly_amount);
      const sen = amount === null ? null : toSen(amount);
      return sen === null ? { ok: false, error: "invalid_amount" } : { ok: true, call: { name: "check_savings_affordability", amountSen: sen } };
    }

    case "search_financial_knowledge": {
      if (typeof a.query !== "string") return { ok: false, error: "invalid_query" };
      const q = a.query.trim().slice(0, MAX_QUERY);
      return q.length === 0 ? { ok: false, error: "invalid_query" } : { ok: true, call: { name: "search_financial_knowledge", query: q } };
    }

    case "propose_transaction": {
      const amount = validateAmount(a.amount);
      const sen = amount === null ? null : toSen(amount);
      if (sen === null) return { ok: false, error: "invalid_amount" };
      if (a.type !== "expense" && a.type !== "income") return { ok: false, error: "invalid_type" };
      if (typeof a.category !== "string" || !isValidCategoryFor(a.type, a.category)) {
        return { ok: false, error: "invalid_category_for_type" };
      }
      let date: string | null = null;
      if (a.date !== undefined && a.date !== null && a.date !== "") {
        date = validateDateString(a.date);
        if (!date) return { ok: false, error: "invalid_date" };
      }
      // Notes often originate from a scanned merchant name: clean again here.
      const note = sanitizeText(a.note, MAX_NOTE);
      return { ok: true, call: { name: "propose_transaction", amountSen: sen, type: a.type, category: a.category, date, note } };
    }
  }
}
