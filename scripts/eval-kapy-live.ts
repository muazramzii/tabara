// Measures how well the REAL model drives Kapy's tools, on the labelled sentences.
//
//   GEMINI_API_KEY=... npm run eval:kapy:live            all sentence sets
//   GEMINI_API_KEY=... npm run eval:kapy:live -- fresh   one set (dev | heldout | fresh | fresh2)
//   npm run eval:kapy:live -- --selftest                 no key; checks this script itself
//
// What it answers, which nothing offline can: given a Malay / English / Manglish
// sentence, does Gemini choose a sensible tool, and does what it then says
// survive the server's checks (grounding, no false "saved")? Each sentence runs
// the full server pipeline against the hand-computed ledger in tests/fixtures,
// using a throwaway in-memory database. Nothing touches Supabase.
//
// It costs real API calls (about 2 per sentence, ~250 sentences) and its numbers
// vary run to run. Run it, record the date, model and result, and keep them next
// to evals/kapy/README.md. Until someone has, the accuracy of the model itself is
// UNMEASURED; the offline suite measures everything around it.

import { callGemini } from "../supabase/functions/_shared/kapy/gemini.ts";
import { runChat } from "../supabase/functions/_shared/kapy/orchestrator.ts";
import { makeSupabaseStore } from "../supabase/functions/_shared/kapy/store.ts";
import { newMetrics } from "../supabase/functions/_shared/kapy/telemetry.ts";
import { ALICE, ledgerDb, scriptedModel, callTools, say } from "../tests/fixtures/kapy-harness.ts";
import { makeFakeSupabase, uuid } from "../tests/fixtures/fake-supabase.ts";
import { DATASETS } from "../tests/fixtures/kapy-eval-runner.ts";
import { NOW } from "../tests/fixtures/kapy-ledger.ts";
import type { EvalCase, EvalIntent } from "../tests/fixtures/kapy-eval-types.ts";

/** Tools that are a reasonable first move for each intent. Empty means "no tool is required". */
export const ACCEPTABLE: Record<EvalIntent, string[]> = {
  check_balance: ["get_financial_summary"],
  check_income: ["get_financial_summary", "get_category_spending"],
  check_expenses: ["get_financial_summary", "get_category_spending"],
  check_savings: ["get_financial_summary"],
  check_budget: ["get_budget_status", "get_financial_summary"],
  compare_periods: ["compare_periods"],
  analyse_categories: ["get_category_spending", "get_financial_summary"],
  trends: ["get_spending_trend"],
  savings_advice: ["get_financial_summary", "get_category_spending", "search_financial_knowledge"],
  budgeting_advice: ["get_financial_summary", "get_budget_status", "search_financial_knowledge"],
  record_expense: ["propose_transaction"],
  record_income: ["propose_transaction"],
  financial_literacy: ["search_financial_knowledge"],
  transaction_history: ["get_transactions"],
  clarify_previous: [],
  projection: ["check_savings_affordability", "get_financial_summary"],
  chitchat: [],
  unknown: [],
};

const NEEDS_NO_TOOL: EvalIntent[] = ["chitchat", "unknown", "clarify_previous"];

export interface Row {
  id: string;
  intent: EvalIntent;
  firstTool: string | null;
  toolOk: boolean;
  outcome: string;
  tokens: number;
  ms: number;
}

export async function evaluateCase(c: EvalCase, callModel: Parameters<typeof runChat>[1]["callModel"]): Promise<Row> {
  const fake = makeFakeSupabase(ledgerDb(), { authUser: ALICE });
  const metrics = newMetrics(2);
  const seen: string[] = [];
  const t0 = Date.now();
  try {
    await runChat(
      { history: [{ role: "user", text: c.text }], context: null },
      {
        callModel: async (req, deadline) => {
          const turn = await callModel(req, deadline);
          for (const p of turn.content.parts) {
            const fc = p.functionCall as { name?: string } | undefined;
            if (fc?.name) seen.push(fc.name);
          }
          return turn;
        },
        store: makeSupabaseStore(fake.client, ALICE),
        now: () => NOW,
        uuid: () => uuid(1),
        allowProposals: true,
      },
      metrics
    );
  } catch {
    metrics.outcome = "model_error";
  }
  const first = seen[0] ?? null;
  const toolOk = NEEDS_NO_TOOL.includes(c.intent) ? true : first !== null && ACCEPTABLE[c.intent].includes(first);
  return { id: c.id, intent: c.intent, firstTool: first, toolOk, outcome: metrics.outcome, tokens: metrics.tokens.total, ms: Date.now() - t0 };
}

export function summarise(rows: Row[]) {
  const n = rows.length || 1;
  const count = (f: (r: Row) => boolean) => rows.filter(f).length;
  const sorted = [...rows].sort((a, b) => a.ms - b.ms);
  return {
    n: rows.length,
    toolChoiceOk: count((r) => r.toolOk) / n,
    repairedGrounding: count((r) => r.outcome === "grounding_repaired") / n,
    fellBackToServerText: count((r) => r.outcome === "grounding_fallback" || r.outcome === "claim_fallback") / n,
    modelErrors: count((r) => r.outcome === "model_error") / n,
    avgTokens: Math.round(rows.reduce((s, r) => s + r.tokens, 0) / n),
    p50ms: sorted[Math.floor(sorted.length * 0.5)]?.ms ?? 0,
    p95ms: sorted[Math.floor(sorted.length * 0.95)]?.ms ?? 0,
  };
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

async function main() {
  const args = process.argv.slice(2);
  const selftest = args.includes("--selftest");
  const only = args.find((a) => a in DATASETS);
  const sets = Object.entries(DATASETS).filter(([k]) => !only || k === only);

  let callModel: Parameters<typeof runChat>[1]["callModel"];
  if (selftest) {
    // A model that always picks the first acceptable tool, then answers plainly.
    callModel = async (req) => {
      const text = String(req.contents.at(-1)?.parts[0]?.text ?? "");
      const answered = req.contents.some((c) => c.parts.some((p) => p.functionResponse));
      if (answered) return say("Ok.");
      const c = Object.values(DATASETS).flat().find((x) => x.text === text);
      const tool = c ? ACCEPTABLE[c.intent][0] : undefined;
      if (!tool) return say("Hai!");
      const args = tool === "propose_transaction" ? { amount: 5, type: c!.intent === "record_income" ? "income" : "expense", category: c!.intent === "record_income" ? "salary" : "food" }
        : tool === "compare_periods" ? { period_a: { kind: "last_month" }, period_b: { kind: "this_month" } }
        : tool === "get_spending_trend" ? { months: 3 }
        : tool === "search_financial_knowledge" ? { query: text }
        : tool === "check_savings_affordability" ? { monthly_amount: 100 }
        : tool === "get_transactions" ? { period: { kind: "this_month" } }
        : { period: { kind: "this_month" } };
      return callTools({ name: tool, args });
    };
    void scriptedModel;
  } else {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("Set GEMINI_API_KEY, or use --selftest to check this script without a key.");
      process.exit(2);
    }
    const model = process.env.GEMINI_MODEL ?? "gemini-3.7-flash";
    console.log(`model: ${model}   date: ${new Date().toISOString().slice(0, 10)}`);
    callModel = (req, deadline) => callGemini({ apiKey, model }, req, { fetch, deadline });
  }

  for (const [name, cases] of sets) {
    const rows: Row[] = [];
    for (const c of cases) rows.push(await evaluateCase(c, callModel));
    const s = summarise(rows);
    console.log(`\n=== ${name.toUpperCase()} (${s.n} sentences)`);
    console.log(`first tool was reasonable   ${pct(s.toolChoiceOk)}`);
    console.log(`reply needed correction     ${pct(s.repairedGrounding)}`);
    console.log(`server had to answer itself ${pct(s.fellBackToServerText)}`);
    console.log(`model errors                ${pct(s.modelErrors)}`);
    console.log(`avg tokens / sentence       ${s.avgTokens}`);
    console.log(`latency p50 / p95           ${s.p50ms} ms / ${s.p95ms} ms`);
    for (const r of rows.filter((x) => !x.toolOk)) console.log(`  miss ${r.id.padEnd(8)} wanted ${r.intent.padEnd(19)} first tool: ${r.firstTool ?? "(none)"}`);
  }
}

// Run only when executed directly, so tests can import the helpers.
if (process.argv[1]?.endsWith("eval-kapy-live.ts")) await main();
