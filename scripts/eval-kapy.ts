// Prints how well Kapy's message analyser does on the labelled datasets.
//
//   npm run eval:kapy            summary tables
//   npm run eval:kapy -- --fail  also list every miss
//
// Offline and deterministic. This scores the analyser (the hint layer), not
// Gemini. See evals/kapy/README.md.

import { DATASETS, runEval, runScenarios, scoreCase, type Report } from "../tests/fixtures/kapy-eval-runner.ts";

const pct = (v: number | null) => (v === null ? "  n/a" : `${(v * 100).toFixed(1).padStart(5)}%`);
const showFailures = process.argv.includes("--fail");

for (const [name, cases] of Object.entries(DATASETS)) {
  const r: Report = runEval(cases);
  console.log(`\n=== ${name.toUpperCase()}  (${r.n} sentences)`);
  console.log(`intent          ${pct(r.intentAccuracy)}`);
  console.log(`language        ${pct(r.languageAccuracy)}`);
  console.log(`period          ${pct(r.periodAccuracy)}`);
  console.log(`comparison      ${pct(r.compareAccuracy)}`);
  console.log(`category        ${pct(r.categoryAccuracy)}`);
  console.log(`amount          ${pct(r.amountAccuracy)}`);
  console.log(`follow-up flag  ${pct(r.followUpAccuracy)}`);
  for (const [lang, v] of Object.entries(r.byLang)) {
    console.log(`  intent, ${lang.padEnd(8)} ${pct(v.intentAccuracy)}  (n=${v.n})`);
  }
  console.log(`confident wrong answers (confidence >= 0.6): ${r.confidentErrors.length}`);
  if (showFailures) {
    for (const f of r.failures) console.log(`  MISS intent ${f.id.padEnd(9)} expected ${f.expected.padEnd(19)} got ${f.got.padEnd(19)} | ${f.text}`);
    for (const x of cases.map(scoreCase)) {
      if (!x.langOk) console.log(`  MISS lang   ${x.case.id.padEnd(9)} expected ${x.case.lang.padEnd(8)} got ${x.analysis.lang.padEnd(8)} | ${x.case.text}`);
      if (x.categoryOk === false) console.log(`  MISS cat    ${x.case.id.padEnd(9)} expected ${String(x.case.category).padEnd(13)} got ${String(x.analysis.category).padEnd(13)} | ${x.case.text}`);
      if (!x.followUpOk) console.log(`  MISS follow ${x.case.id.padEnd(9)} expected ${!!x.case.followUp} | ${x.case.text}`);
    }
  }
}

const scenarios = runScenarios();
const turns = scenarios.flatMap((s) => s.turns);
console.log(`\n=== CONTEXT SCENARIOS  (${scenarios.length} conversations, ${turns.length} turns)`);
console.log(`conversations fully correct  ${scenarios.filter((s) => s.ok).length}/${scenarios.length}`);
console.log(`turns correct                ${turns.filter((t) => t.ok).length}/${turns.length}`);
for (const s of scenarios) {
  for (const t of s.turns) if (!t.ok) console.log(`  ${s.scenario.id}: "${t.text}" -> ${t.problems.join("; ")}`);
}
