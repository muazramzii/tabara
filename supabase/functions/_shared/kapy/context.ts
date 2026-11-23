// Conversation context: what "that", "last month" and "yang tadi" refer to.
//
// What is remembered, and why so little
// -------------------------------------
// After each answer the server hands the app a small `KapyContext` (the intent,
// the period, the comparison and the category last discussed) and the app sends
// it back with the next message. It holds NO amounts, NO transaction text and no
// names — only which period/category the conversation is about — so there is
// nothing sensitive to leak, retain or have a person edit to their advantage.
//
// It is a *reference*, never a source of figures. Every number Kapy states is
// recomputed from the database on each question (finance.ts); remembering
// "October" does not remember October's total. The client can tamper with this
// object, so it is validated strictly (`parseContext`) and expires: 30 minutes
// or 12 turns, whichever comes first.
//
// Rules for using it
// ------------------
// - What the person says in this message always beats what was remembered.
// - Only follow-up phrasing inherits ("what about food?", "pulak", "that"). A
//   fresh question does not drag the old category along: asking about your
//   balance after a chat about food does not become "balance of food".
// - Topic changes (an explanation, a greeting, advice, recording a transaction)
//   neither inherit nor erase what is remembered, so "back to my spending —
//   and last month?" still works afterwards.
// - A reference with nothing to refer to ("bulan tu ..." as the first message)
//   is not guessed at; the resolver reports that it needs clarifying.

import { ALL_CATEGORY_IDS } from "./categories.ts";
import { INTENTS, type Analysis, type Intent } from "./intent.ts";
import { parsePeriodSpec, type PeriodSpec } from "./period.ts";

export const CONTEXT_TTL_MS = 30 * 60 * 1000;
export const CONTEXT_MAX_TURNS = 12;

export interface KapyContext {
  v: 1;
  /** When it was last updated, epoch ms. */
  at: number;
  turn: number;
  intent?: Intent;
  period?: PeriodSpec;
  compare?: [PeriodSpec, PeriodSpec];
  category?: string;
}

/** Accepts a context from the client only if every field is well-formed and fresh. */
export function parseContext(raw: unknown, now: number): KapyContext | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) return null;
  if (typeof r.at !== "number" || !Number.isFinite(r.at)) return null;
  // Not from the future (beyond clock skew), and not stale.
  if (r.at > now + 60_000 || now - r.at > CONTEXT_TTL_MS) return null;
  if (typeof r.turn !== "number" || !Number.isInteger(r.turn) || r.turn < 0 || r.turn > CONTEXT_MAX_TURNS) return null;

  const out: KapyContext = { v: 1, at: r.at, turn: r.turn };
  if (r.intent !== undefined) {
    if (typeof r.intent !== "string" || !INTENTS.includes(r.intent as Intent)) return null;
    out.intent = r.intent as Intent;
  }
  if (r.period !== undefined) {
    const p = parsePeriodSpec(r.period);
    if (!p) return null;
    out.period = p;
  }
  if (r.compare !== undefined) {
    if (!Array.isArray(r.compare) || r.compare.length !== 2) return null;
    const a = parsePeriodSpec(r.compare[0]);
    const b = parsePeriodSpec(r.compare[1]);
    if (!a || !b) return null;
    out.compare = [a, b];
  }
  if (r.category !== undefined) {
    if (typeof r.category !== "string" || !ALL_CATEGORY_IDS.includes(r.category)) return null;
    out.category = r.category;
  }
  return out;
}

export interface Resolved {
  intent: Intent;
  period: PeriodSpec | null;
  compare: [PeriodSpec, PeriodSpec] | null;
  category: string | null;
  /** What was carried over from earlier in the conversation. */
  inherited: ("intent" | "period" | "category" | "compare")[];
  /** What was filled with a default because nothing said otherwise. */
  defaulted: "period"[];
  /** The message points at something that was never established. */
  needsClarification: "period" | "category" | null;
}

/** Intents that are not about a period of the user's data, and so never inherit. */
const STANDALONE: ReadonlySet<Intent> = new Set<Intent>([
  "financial_literacy", "chitchat", "savings_advice", "budgeting_advice", "record_expense", "record_income",
]);

const DEFAULT_PERIOD: Partial<Record<Intent, PeriodSpec>> = {
  transaction_history: { kind: "last_n_days", days: 30 },
  trends: { kind: "last_n_months", months: 3 },
};
const THIS_MONTH: PeriodSpec = { kind: "this_month" };

export function resolveReferences(a: Analysis, ctx: KapyContext | null): Resolved {
  const r: Resolved = {
    intent: a.intent,
    period: a.period,
    compare: a.comparePeriods,
    category: a.category,
    inherited: [],
    defaulted: [],
    needsClarification: null,
  };

  if (STANDALONE.has(r.intent)) return r;

  const followLike = a.followUp || a.refersToPeriod || a.refersToSubject;

  // A bare fragment ("bulan lepas pulak?") means "the same question, but ...".
  if (r.intent === "unknown") {
    if (followLike && ctx?.intent && !STANDALONE.has(ctx.intent)) {
      r.intent = ctx.intent;
      r.inherited.push("intent");
    } else {
      // Nothing to resolve; the model reads the message as it is. But a pointer
      // ("that", "bulan tu") with nothing established behind it is reported, so
      // Kapy asks instead of guessing what is meant.
      if (a.refersToPeriod) r.needsClarification = "period";
      else if (a.refersToSubject) r.needsClarification = "category";
      return r;
    }
  }

  if (r.intent === "clarify_previous") {
    if (!r.compare && ctx?.compare) {
      r.compare = ctx.compare;
      r.inherited.push("compare");
    }
    if (!r.period && !r.compare && ctx?.period) {
      r.period = ctx.period;
      r.inherited.push("period");
    }
    if (!r.category && ctx?.category) {
      r.category = ctx.category;
      r.inherited.push("category");
    }
    if (a.refersToPeriod && !ctx?.period && !ctx?.compare) r.needsClarification = "period";
    return r;
  }

  if (r.intent === "compare_periods") {
    if (!r.compare && ctx?.compare && followLike) {
      r.compare = ctx.compare;
      r.inherited.push("compare");
    }
    if (!r.category && a.refersToSubject && ctx?.category) {
      r.category = ctx.category;
      r.inherited.push("category");
    }
    return r;
  }

  // Period.
  if (!r.period) {
    if (a.refersToPeriod && !ctx?.period) {
      r.needsClarification = "period";
    } else if (followLike && ctx?.period) {
      r.period = ctx.period;
      r.inherited.push("period");
    } else if (followLike && ctx?.compare && a.refersToPeriod) {
      r.period = ctx.compare[1];
      r.inherited.push("period");
    } else {
      r.period = DEFAULT_PERIOD[r.intent] ?? THIS_MONTH;
      r.defaulted.push("period");
    }
  }

  // Category: carried only by an explicit pointer, or by a fragment that inherited its intent.
  if (!r.category) {
    const pointing = a.refersToSubject || r.inherited.includes("intent");
    if (pointing && ctx?.category) {
      r.category = ctx.category;
      r.inherited.push("category");
    } else if (a.refersToSubject && !ctx?.category) {
      r.needsClarification = "category";
    }
  }
  return r;
}

/**
 * What to remember after this turn. Topic changes leave it as it was; a
 * question about the user's data replaces it with what that question was about.
 */
export function nextContext(
  a: Analysis,
  r: Resolved,
  ctx: KapyContext | null,
  now: number
): KapyContext | null {
  if (STANDALONE.has(r.intent) || r.intent === "unknown" || r.needsClarification) return ctx;

  const next: KapyContext = {
    v: 1,
    at: now,
    turn: Math.min((ctx?.turn ?? 0) + 1, CONTEXT_MAX_TURNS),
    intent: r.intent === "clarify_previous" ? ctx?.intent ?? r.intent : r.intent,
  };
  if (r.compare) next.compare = r.compare;
  else if (r.intent === "clarify_previous" && ctx?.compare) next.compare = ctx.compare;
  if (r.period) next.period = r.period;
  if (r.category) next.category = r.category;
  return next;
}
