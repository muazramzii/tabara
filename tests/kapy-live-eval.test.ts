// The live-evaluation script (scripts/eval-kapy-live.ts) is how the owner will
// measure the real model. It needs a key and cannot run here, so the part that
// can be checked is checked: that its scoring recognises right and wrong tool
// choices instead of reporting success regardless.

import test from "node:test";
import assert from "node:assert/strict";
import { ACCEPTABLE, evaluateCase, summarise } from "../scripts/eval-kapy-live";
import { INTENTS } from "../supabase/functions/_shared/kapy/intent";
import { TOOL_NAMES } from "../supabase/functions/_shared/kapy/tools";
import { callTools, say } from "./fixtures/kapy-harness";
import type { EvalCase } from "./fixtures/kapy-eval-types";

const c = (intent: EvalCase["intent"]): EvalCase => ({ id: "x", text: "berapa aku belanja", lang: "ms", intent });
const THIS_MONTH = { period: { kind: "this_month" } };

test("every intent has an entry, and every tool named exists", () => {
  for (const i of INTENTS) assert.ok(i in ACCEPTABLE, i);
  for (const tools of Object.values(ACCEPTABLE)) for (const t of tools) assert.ok((TOOL_NAMES as readonly string[]).includes(t), t);
});

test("a sensible first tool is credited", async () => {
  let n = 0;
  const row = await evaluateCase(c("check_expenses"), async () => (n++ === 0 ? callTools({ name: "get_financial_summary", args: THIS_MONTH }) : say("ok")));
  assert.equal(row.toolOk, true);
  assert.equal(row.firstTool, "get_financial_summary");
});

test("a wrong first tool is not", async () => {
  let n = 0;
  const row = await evaluateCase(c("compare_periods"), async () => (n++ === 0 ? callTools({ name: "get_financial_summary", args: THIS_MONTH }) : say("ok")));
  assert.equal(row.toolOk, false);
});

test("answering a data question with no tool at all is a miss", async () => {
  const row = await evaluateCase(c("check_balance"), async () => say("Kau ada banyak duit."));
  assert.equal(row.toolOk, false);
  assert.equal(row.firstTool, null);
});

test("a greeting needs no tool, and calling one is not penalised", async () => {
  assert.equal((await evaluateCase(c("chitchat"), async () => say("Hai!"))).toolOk, true);
  assert.equal((await evaluateCase(c("unknown"), async () => say("Hmm?"))).toolOk, true);
});

test("a model that fails is counted as a failure, not skipped", async () => {
  const row = await evaluateCase(c("check_expenses"), async () => { throw new Error("down"); });
  assert.equal(row.outcome, "model_error");
  assert.equal(row.toolOk, false);
});

test("a summary reports rates, tokens and latency", () => {
  const s = summarise([
    { id: "a", intent: "check_balance", firstTool: "get_financial_summary", toolOk: true, outcome: "ok", tokens: 100, ms: 10 },
    { id: "b", intent: "check_balance", firstTool: null, toolOk: false, outcome: "grounding_fallback", tokens: 300, ms: 30 },
    { id: "c", intent: "check_balance", firstTool: "get_financial_summary", toolOk: true, outcome: "grounding_repaired", tokens: 200, ms: 20 },
    { id: "d", intent: "check_balance", firstTool: "get_financial_summary", toolOk: true, outcome: "model_error", tokens: 0, ms: 40 },
  ]);
  assert.equal(s.n, 4);
  assert.equal(s.toolChoiceOk, 0.75);
  assert.equal(s.repairedGrounding, 0.25);
  assert.equal(s.fellBackToServerText, 0.25);
  assert.equal(s.modelErrors, 0.25);
  assert.equal(s.avgTokens, 150);
  assert.equal(summarise([]).n, 0);
});
