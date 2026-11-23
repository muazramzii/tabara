// Regression guard for Kapy's message analyser, scored on the labelled datasets.
//
// READ THIS BEFORE QUOTING THE NUMBERS
//
// The thresholds below stop the analyser getting WORSE. They are not a claim
// about how well Kapy understands new sentences.
//
//   dev       the analyser was built and tuned on it           (in-sample)
//   heldout   not tuned on empirically, but its sentences were considered while
//             the rules were being written; failures were then fixed
//   fresh     written after the analyser was frozen; its FIRST run scored
//             67.8% intent accuracy, and it has been fixed against since
//   fresh2    same procedure; first run scored 72.5%, fixed against since
//
// The honest estimate of accuracy on language the analyser was not shaped
// around is therefore the first-run figures of the two fresh sets — roughly
// 68-73% — not the 98-100% these sets now show. The analyser is a hint layer:
// where it is unsure it says "unknown" and Gemini decides.
//
// To measure a NEW out-of-sample number, write a new set, run it once, and
// record that first result before touching the analyser.

import test from "node:test";
import assert from "node:assert/strict";
import { DATASETS, runEval, runScenarios } from "./fixtures/kapy-eval-runner";

const reports = Object.fromEntries(Object.entries(DATASETS).map(([k, v]) => [k, runEval(v)]));

test("every dataset is non-trivial and covers all three language styles", () => {
  for (const [name, r] of Object.entries(reports)) {
    assert.ok(r.n >= 40, `${name} has only ${r.n} sentences`);
  }
  for (const lang of ["ms", "en", "manglish"] as const) {
    assert.ok(reports.dev.byLang[lang].n >= 15, `dev has too few ${lang} sentences`);
    assert.ok(reports.heldout.byLang[lang].n >= 10, `heldout has too few ${lang} sentences`);
  }
});

test("dataset ids are unique", () => {
  const ids = Object.values(DATASETS).flat().map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("the dev set covers every intent in the taxonomy", () => {
  const covered = new Set(DATASETS.dev.map((c) => c.intent));
  for (const intent of [
    "check_balance", "check_income", "check_expenses", "check_savings", "check_budget",
    "compare_periods", "analyse_categories", "trends", "savings_advice", "budgeting_advice",
    "record_expense", "record_income", "financial_literacy", "transaction_history",
    "clarify_previous", "projection", "chitchat", "unknown",
  ]) {
    assert.ok(covered.has(intent as never), `no dev sentence for ${intent}`);
  }
});

test("intent accuracy has not regressed", () => {
  assert.ok(reports.dev.intentAccuracy >= 0.97, `dev ${reports.dev.intentAccuracy}`);
  assert.ok(reports.heldout.intentAccuracy >= 0.97, `heldout ${reports.heldout.intentAccuracy}`);
  assert.ok(reports.fresh.intentAccuracy >= 0.9, `fresh ${reports.fresh.intentAccuracy}`);
  assert.ok(reports.fresh2.intentAccuracy >= 0.9, `fresh2 ${reports.fresh2.intentAccuracy}`);
});

test("accuracy holds in each language style, not just on average", () => {
  for (const name of ["dev", "heldout", "fresh", "fresh2"]) {
    for (const lang of ["ms", "en", "manglish"] as const) {
      const v = reports[name].byLang[lang];
      if (v.n >= 8) assert.ok(v.intentAccuracy >= 0.85, `${name}/${lang}: ${v.intentAccuracy}`);
    }
  }
});

test("period, comparison, category and amount extraction have not regressed", () => {
  for (const name of ["dev", "heldout", "fresh", "fresh2"]) {
    const r = reports[name];
    assert.ok((r.periodAccuracy ?? 1) >= 0.9, `${name} period ${r.periodAccuracy}`);
    assert.ok((r.compareAccuracy ?? 1) >= 0.9, `${name} compare ${r.compareAccuracy}`);
    assert.ok((r.categoryAccuracy ?? 1) >= 0.9, `${name} category ${r.categoryAccuracy}`);
    assert.ok((r.amountAccuracy ?? 1) >= 0.9, `${name} amount ${r.amountAccuracy}`);
  }
});

test("language style detection has not regressed", () => {
  for (const name of ["dev", "heldout", "fresh", "fresh2"]) {
    assert.ok(reports[name].languageAccuracy >= 0.85, `${name} language ${reports[name].languageAccuracy}`);
  }
});

test("follow-up phrasing is recognised without flagging ordinary questions", () => {
  for (const name of ["dev", "heldout", "fresh", "fresh2"]) {
    assert.ok(reports[name].followUpAccuracy >= 0.93, `${name} follow-up ${reports[name].followUpAccuracy}`);
  }
});

test("the analyser seldom gives a confident wrong answer", () => {
  // A wrong guess it is sure about is worse than "unknown", which sends the
  // message to the model unprompted.
  const confident = Object.values(reports).reduce((n, r) => n + r.confidentErrors.length, 0);
  assert.ok(confident <= 2, `${confident} confident errors: ${JSON.stringify(Object.values(reports).flatMap((r) => r.confidentErrors))}`);
});

test("messages it cannot read are 'unknown', not forced into a category", () => {
  const r = reports.fresh2;
  const gibberish = DATASETS.fresh2.filter((c) => c.intent === "unknown");
  assert.ok(gibberish.length >= 2);
  for (const c of gibberish) {
    const hit = r.failures.find((f) => f.id === c.id);
    assert.equal(hit, undefined, `${c.id}: ${c.text}`);
  }
});

test("multi-turn context scenarios all resolve correctly", () => {
  const results = runScenarios();
  const problems = results.flatMap((s) => s.turns.filter((t) => !t.ok).map((t) => `${s.scenario.id}: "${t.text}" ${t.problems.join("; ")}`));
  assert.deepEqual(problems, []);
  assert.ok(results.length >= 10);
});
