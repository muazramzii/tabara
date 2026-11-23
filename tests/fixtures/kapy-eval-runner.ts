// Scores Kapy's message analyser against the labelled datasets and produces the
// numbers that go into the report. Used by tests/kapy-eval.test.ts (which asserts
// thresholds) and scripts/eval-kapy.ts (which prints the tables).
//
// Everything here is deterministic and offline. It measures the analyser — the
// hint layer — not Gemini. How well the full system understands a sentence also
// depends on the model, which cannot be measured without calling it; see
// evals/kapy/README.md for how to run that comparison with a real key.

import { analyzeMessage, type Analysis } from "../../supabase/functions/_shared/kapy/intent";
import { nextContext, resolveReferences, type KapyContext } from "../../supabase/functions/_shared/kapy/context";
import { mustResolve, type PeriodSpec } from "../../supabase/functions/_shared/kapy/period";
import { NOW } from "./kapy-ledger";
import { DEV, SCENARIOS } from "./kapy-eval-dev";
import { HELDOUT } from "./kapy-eval-heldout";
import { FRESH } from "./kapy-eval-fresh";
import { FRESH2 } from "./kapy-eval-fresh2";
import type { ContextScenario, EvalCase, EvalIntent, Lang, PeriodTag } from "./kapy-eval-types";

export function tagToSpec(tag: PeriodTag): PeriodSpec {
  if (tag.startsWith("month:")) {
    const month = Number(tag.slice(6));
    // The most recent such month, as the analyser infers it: not in the future.
    return { kind: "month", year: month <= 11 ? 2026 : 2025, month };
  }
  switch (tag) {
    case "last_3_months": return { kind: "last_n_months", months: 3 };
    case "last_30_days": return { kind: "last_n_days", days: 30 };
    default: return { kind: tag } as PeriodSpec;
  }
}

/** Two specs are the same period if they cover the same days (so last_month = month 10). */
export function samePeriod(a: PeriodSpec | null, b: PeriodSpec | null): boolean {
  if (!a || !b) return a === b;
  const ra = mustResolve(a, NOW);
  const rb = mustResolve(b, NOW);
  return ra.fromDate === rb.fromDate && ra.toDate === rb.toDate;
}

export interface CaseResult {
  case: EvalCase;
  analysis: Analysis;
  intentOk: boolean;
  langOk: boolean;
  periodOk: boolean | null; // null = not asserted
  compareOk: boolean | null;
  categoryOk: boolean | null;
  amountOk: boolean | null;
  followUpOk: boolean;
}

export function scoreCase(c: EvalCase): CaseResult {
  const a = analyzeMessage(c.text, NOW);
  return {
    case: c,
    analysis: a,
    intentOk: a.intent === c.intent,
    langOk: a.lang === c.lang,
    periodOk: c.period ? samePeriod(a.period, tagToSpec(c.period)) : null,
    compareOk: c.compare
      ? !!a.comparePeriods &&
        samePeriod(a.comparePeriods[0], tagToSpec(c.compare[0])) &&
        samePeriod(a.comparePeriods[1], tagToSpec(c.compare[1]))
      : null,
    categoryOk: c.category !== undefined ? a.category === c.category : null,
    amountOk: c.amount !== undefined ? a.amountSen === Math.round(c.amount * 100) : null,
    followUpOk: a.followUp === !!c.followUp,
  };
}

const rate = (ok: number, n: number) => (n === 0 ? null : ok / n);

export interface Report {
  n: number;
  intentAccuracy: number;
  languageAccuracy: number;
  periodAccuracy: number | null;
  compareAccuracy: number | null;
  categoryAccuracy: number | null;
  amountAccuracy: number | null;
  followUpAccuracy: number;
  byLang: Record<Lang, { n: number; intentAccuracy: number }>;
  perIntent: Record<string, { n: number; correct: number; predicted: number; precision: number | null; recall: number | null }>;
  /** Confident wrong answers: the failure that matters most. */
  confidentErrors: { id: string; text: string; expected: EvalIntent; got: string; confidence: number }[];
  failures: { id: string; text: string; expected: EvalIntent; got: string }[];
}

export function runEval(cases: EvalCase[]): Report {
  const results = cases.map(scoreCase);
  const count = (f: (r: CaseResult) => boolean | null) => {
    const rel = results.filter((r) => f(r) !== null);
    return rate(rel.filter((r) => f(r) === true).length, rel.length);
  };

  const byLang = {} as Report["byLang"];
  for (const lang of ["ms", "en", "manglish"] as Lang[]) {
    const rel = results.filter((r) => r.case.lang === lang);
    byLang[lang] = { n: rel.length, intentAccuracy: rate(rel.filter((r) => r.intentOk).length, rel.length) ?? 0 };
  }

  const intents = [...new Set([...cases.map((c) => c.intent), ...results.map((r) => r.analysis.intent)])];
  const perIntent: Report["perIntent"] = {};
  for (const i of intents) {
    const actual = results.filter((r) => r.case.intent === i);
    const predicted = results.filter((r) => r.analysis.intent === i);
    const correct = actual.filter((r) => r.intentOk).length;
    perIntent[i] = {
      n: actual.length,
      correct,
      predicted: predicted.length,
      precision: rate(correct, predicted.length),
      recall: rate(correct, actual.length),
    };
  }

  const wrong = results.filter((r) => !r.intentOk);
  return {
    n: cases.length,
    intentAccuracy: rate(results.filter((r) => r.intentOk).length, results.length) ?? 0,
    languageAccuracy: rate(results.filter((r) => r.langOk).length, results.length) ?? 0,
    periodAccuracy: count((r) => r.periodOk),
    compareAccuracy: count((r) => r.compareOk),
    categoryAccuracy: count((r) => r.categoryOk),
    amountAccuracy: count((r) => r.amountOk),
    followUpAccuracy: rate(results.filter((r) => r.followUpOk).length, results.length) ?? 0,
    byLang,
    perIntent,
    confidentErrors: wrong
      .filter((r) => r.analysis.confidence >= 0.6 && r.analysis.intent !== "unknown")
      .map((r) => ({ id: r.case.id, text: r.case.text, expected: r.case.intent, got: r.analysis.intent, confidence: r.analysis.confidence })),
    failures: wrong.map((r) => ({ id: r.case.id, text: r.case.text, expected: r.case.intent, got: r.analysis.intent })),
  };
}

// ── multi-turn scenarios ────────────────────────────────────

export interface ScenarioResult {
  scenario: ContextScenario;
  turns: { text: string; ok: boolean; problems: string[] }[];
  ok: boolean;
}

export function runScenarios(scenarios: ContextScenario[] = SCENARIOS): ScenarioResult[] {
  return scenarios.map((s) => {
    let ctx: KapyContext | null = null;
    const turns = s.turns.map((t) => {
      const a = analyzeMessage(t.text, NOW);
      const r = resolveReferences(a, ctx);
      ctx = nextContext(a, r, ctx, NOW);
      const problems: string[] = [];
      const e = t.expect;
      if (e.intent !== undefined && r.intent !== e.intent) problems.push(`intent: expected ${e.intent}, got ${r.intent}`);
      if (e.period !== undefined && !samePeriod(r.period, tagToSpec(e.period))) problems.push(`period: expected ${e.period}, got ${JSON.stringify(r.period)}`);
      if (e.compare !== undefined) {
        const ok = !!r.compare && samePeriod(r.compare[0], tagToSpec(e.compare[0])) && samePeriod(r.compare[1], tagToSpec(e.compare[1]));
        if (!ok) problems.push(`compare: expected ${e.compare.join(" vs ")}, got ${JSON.stringify(r.compare)}`);
      }
      if (e.category !== undefined && r.category !== e.category) problems.push(`category: expected ${e.category}, got ${r.category}`);
      if (e.needsClarification !== undefined && r.needsClarification !== e.needsClarification) {
        problems.push(`needsClarification: expected ${e.needsClarification}, got ${r.needsClarification}`);
      }
      for (const k of e.inherited ?? []) if (!r.inherited.includes(k)) problems.push(`expected '${k}' to be inherited`);
      return { text: t.text, ok: problems.length === 0, problems };
    });
    return { scenario: s, turns, ok: turns.every((x) => x.ok) };
  });
}

export const DATASETS = { dev: DEV, heldout: HELDOUT, fresh: FRESH, fresh2: FRESH2 };
