// Runs a validated tool call against the caller's own data and returns exactly
// what the model is allowed to know.
//
// - Reads go through `FinanceStore`, which is bound to the caller's token (RLS).
// - Every figure comes from finance.ts. The result carries amounts as
//   `{ amount, formatted, currency }` objects so the model can quote
//   `formatted` verbatim.
// - A failure to read data is reported as a tool error that tells the model, in
//   so many words, not to guess. It never contains the database's own message,
//   which can quote rows.
// - Text that originated from outside (transaction notes, which may be a
//   scanned merchant name) is cleaned and flagged as untrusted data.
// - Nothing here writes. `propose_transaction` builds a proposal and returns it
//   alongside the result; saving is actions.ts, after the person confirms.

import { sanitizeText } from "../sanitize.ts";
import { buildProposal, type Proposal } from "./actions.ts";
import { categoryLabel } from "./categories.ts";
import {
  affordability,
  budgetReport,
  categoryReport,
  comparePeriods,
  monthlyTrend,
  normalizeRows,
  summarizePeriod,
  type PeriodSummary,
  type Profile,
  type Txn,
} from "./finance.ts";
import { searchKnowledge } from "./knowledge.ts";
import { money } from "./money.ts";
import { mustResolve, mytParts, recentMonthSpecs, type ResolvedPeriod } from "./period.ts";
import { StoreError, type FinanceStore } from "./store.ts";
import type { ValidatedCall } from "./tools.ts";

export interface ExecDeps {
  store: FinanceStore;
  now: number;
  uuid: () => string;
  /** The reply style, which picks the language of knowledge passages. */
  lang: "en" | "ms" | "manglish";
}

export interface ToolOutcome {
  ok: boolean;
  /** What is sent back to the model as the function response. */
  result: Record<string, unknown>;
  /** Present only for a successful propose_transaction. */
  proposal?: Proposal;
  /** The read could not be completed in full. */
  truncated?: boolean;
  /** A database/store failure, for telemetry. */
  storeError?: string;
}

const DAY_MS = 86_400_000;
const MAX_NOTE_SHOWN = 40;

const UNAVAILABLE = {
  ok: false,
  error: "data_unavailable",
  message:
    "The user's data could not be read right now. Tell them you can't check it at the moment and to try again shortly. Do not estimate or guess any figure.",
};

async function load(store: FinanceStore, periods: ResolvedPeriod[]) {
  const start = Math.min(...periods.map((p) => p.startMs));
  const end = Math.max(...periods.map((p) => p.endMs));
  // Adjacent or overlapping periods share one query; far-apart ones do not drag in everything between.
  const ranges =
    end - start <= 400 * DAY_MS
      ? [{ startUtc: new Date(start).toISOString(), endUtc: new Date(end).toISOString() }]
      : periods.map((p) => ({ startUtc: p.startUtc, endUtc: p.endUtc }));

  // Read together. Promise.all also handles a failure in either read: starting
  // one read and awaiting the other later would leave the first one's rejection
  // unhandled if the second failed first, which can take the whole worker down.
  const [profile, outs] = await Promise.all([
    store.profile(),
    Promise.all(ranges.map((r) => store.transactions(r))),
  ]);
  const rows: unknown[] = outs.flatMap((o) => o.rows);
  const truncated = outs.some((o) => o.truncated);
  const { txns, dropped } = normalizeRows(rows);
  // Overlapping ranges would double-count: keep each row once.
  const seen = new Set<string>();
  const unique = txns.filter((t) => !t.id || (seen.has(t.id) ? false : (seen.add(t.id), true)));
  return { txns: unique as Txn[], profile: profile as Profile | null, truncated, dropped };
}

const noteLimitations = (truncated: boolean, dropped: number): string[] => [
  ...(truncated ? ["data_truncated_totals_may_be_incomplete"] : []),
  ...(dropped > 0 ? ["some_rows_were_ignored_as_invalid"] : []),
];

/** Keeps a summary small enough to be useful to a model. */
function slim(s: PeriodSummary) {
  return {
    ...s,
    spendingByCategory: s.spendingByCategory.slice(0, 8),
    incomeByCategory: s.incomeByCategory.slice(0, 5),
  };
}

export async function executeTool(call: ValidatedCall, deps: ExecDeps): Promise<ToolOutcome> {
  const { store, now } = deps;
  const asOf = mytParts(now).date;

  try {
    switch (call.name) {
      case "get_financial_summary": {
        const period = mustResolve(call.period, now);
        const d = await load(store, [period]);
        const summary = summarizePeriod(d.txns, period, d.profile, noteLimitations(d.truncated, d.dropped));
        return { ok: true, truncated: d.truncated, result: { ok: true, tool: call.name, asOf, summary: slim(summary) } };
      }

      case "get_category_spending": {
        const period = mustResolve(call.period, now);
        const d = await load(store, [period]);
        const limitations = noteLimitations(d.truncated, d.dropped);
        if (call.category) {
          const report = categoryReport(d.txns, period, call.category, d.profile);
          return { ok: true, truncated: d.truncated, result: { ok: true, tool: call.name, asOf, report, limitations } };
        }
        const s = summarizePeriod(d.txns, period, d.profile, limitations);
        return {
          ok: true,
          truncated: d.truncated,
          result: {
            ok: true,
            tool: call.name,
            asOf,
            period: s.period,
            totalSpent: s.spent,
            topCategories: s.spendingByCategory.slice(0, 5),
            limitations: s.limitations,
          },
        };
      }

      case "compare_periods": {
        const a = mustResolve(call.a, now);
        const b = mustResolve(call.b, now);
        const d = await load(store, [a, b]);
        const lim = noteLimitations(d.truncated, d.dropped);
        const comparison = comparePeriods(summarizePeriod(d.txns, a, d.profile, lim), summarizePeriod(d.txns, b, d.profile, lim));
        return { ok: true, truncated: d.truncated, result: { ok: true, tool: call.name, asOf, comparison } };
      }

      case "get_spending_trend": {
        const periods = recentMonthSpecs(call.months, now).map((s) => mustResolve(s, now));
        const d = await load(store, periods);
        const trend = monthlyTrend(d.txns, periods, d.profile);
        trend.limitations.push(...noteLimitations(d.truncated, d.dropped));
        return { ok: true, truncated: d.truncated, result: { ok: true, tool: call.name, asOf, trend } };
      }

      case "get_transactions": {
        const period = mustResolve(call.period, now);
        const out = await store.transactions({
          startUtc: period.startUtc,
          endUtc: period.endUtc,
          category: call.category ?? undefined,
          type: call.type ?? undefined,
          detail: { limit: call.limit },
        });
        const { txns } = normalizeRows(out.rows);
        const shown = txns.map((t) => ({
          date: mytParts(t.at).date,
          amount: money(t.sen),
          type: t.type,
          category: categoryLabel(t.category),
          // Free text, and possibly a scanned merchant name: cleaned, short, and
          // marked so the model treats it as a label and never as an instruction.
          note: sanitizeText(t.note, MAX_NOTE_SHOWN),
        }));
        return {
          ok: true,
          result: {
            ok: true,
            tool: call.name,
            asOf,
            period: { label: period.label, from: period.fromDate, to: period.toDate },
            transactions: shown,
            count: shown.length,
            newestFirst: true,
            mayHaveMore: shown.length >= call.limit,
            untrustedTextFields: ["note"],
          },
        };
      }

      case "get_budget_status": {
        const period = mustResolve(call.period, now);
        const d = await load(store, [period]);
        const report = budgetReport(d.txns, period, d.profile);
        return {
          ok: true,
          truncated: d.truncated,
          result: { ok: true, tool: call.name, asOf, report, limitations: noteLimitations(d.truncated, d.dropped) },
        };
      }

      case "check_savings_affordability": {
        const period = mustResolve({ kind: "this_month" }, now);
        const d = await load(store, [period]);
        const summary = summarizePeriod(d.txns, period, d.profile, noteLimitations(d.truncated, d.dropped));
        return {
          ok: true,
          truncated: d.truncated,
          result: { ok: true, tool: call.name, asOf, affordability: affordability(summary, call.amountSen) },
        };
      }

      case "search_financial_knowledge": {
        const hits = searchKnowledge(call.query, deps.lang);
        if (hits.length === 0) {
          return {
            ok: true,
            result: {
              ok: true,
              tool: call.name,
              passages: [],
              message:
                "There is no vetted answer for this. Say you don't have a reliable answer, do not improvise rates, rules or eligibility, and point to official sources such as Bank Negara Malaysia or AKPK.",
            },
          };
        }
        return {
          ok: true,
          result: {
            ok: true,
            tool: call.name,
            generalEducationNotPersonalAdvice: true,
            passages: hits.map((h) => ({
              title: h.title,
              text: h.text,
              figures: h.figures,
              officialPointers: h.officialPointers,
            })),
          },
        };
      }

      case "propose_transaction": {
        const proposal = buildProposal({
          requestId: deps.uuid(),
          amountSen: call.amountSen,
          type: call.type,
          category: call.category,
          date: call.date,
          note: call.note,
          now,
        });
        return {
          ok: true,
          proposal,
          result: {
            ok: true,
            tool: call.name,
            status: "proposed",
            savedToDatabase: false,
            message:
              "NOT saved. The app is showing the user a confirmation card. Do not say it has been saved or recorded; invite them to check the card and confirm.",
            preview: {
              amount: money(call.amountSen),
              type: proposal.type,
              category: proposal.categoryLabel,
              date: proposal.dateLabel,
              note: proposal.note,
            },
          },
        };
      }
    }
  } catch (e) {
    if (e instanceof StoreError) return { ok: false, result: UNAVAILABLE, storeError: e.code };
    throw e;
  }
}
