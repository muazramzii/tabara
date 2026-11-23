// Operational metrics: useful counts, and a guarantee that no personal content
// can ride along in them.

import test from "node:test";
import assert from "node:assert/strict";
import { assertSafeMetrics, emit, newMetrics, recordTool } from "../supabase/functions/_shared/kapy/telemetry";

test("a fresh metrics record is all zeros and enums", () => {
  const m = newMetrics(2);
  assert.doesNotThrow(() => assertSafeMetrics(m));
  assert.equal(m.evt, "kapy.request");
  assert.equal(m.tokens.total, 0);
  assert.equal(m.toolCallsTotal, 0);
});

test("tool outcomes are counted per tool, with a running total", () => {
  const m = newMetrics(2);
  recordTool(m, "get_financial_summary", true);
  recordTool(m, "get_financial_summary", true);
  recordTool(m, "get_financial_summary", false);
  recordTool(m, "propose_transaction", true);
  assert.deepEqual(m.toolCalls, { get_financial_summary: { ok: 2, fail: 1 }, propose_transaction: { ok: 1, fail: 0 } });
  assert.equal(m.toolCallsTotal, 4);
  // Tool success rate is derivable: 3 of 4.
  const ok = Object.values(m.toolCalls).reduce((n, c) => n + c.ok, 0);
  assert.equal(ok / m.toolCallsTotal, 0.75);
});

test("a populated record is still safe", () => {
  const m = newMetrics(2);
  m.lang = "manglish";
  m.intent = "check_budget";
  m.intentConfidence = 0.8;
  m.rounds = 3;
  m.tokens = { prompt: 900, output: 120, total: 1020 };
  m.ms = { total: 1800, model: 1500, tools: 120 };
  m.outcome = "grounding_repaired";
  recordTool(m, "get_budget_status", true);
  assert.doesNotThrow(() => assertSafeMetrics(m));
});

test("personal content cannot be smuggled into a metric", () => {
  const unsafe: unknown[] = [
    { evt: "kapy.request", lang: "I spent RM 15 on lunch at Kopitiam" }, // free text in an allowed key
    { evt: "kapy.request", note: "hello" }, // a string under an unexpected key
    { evt: "kapy.request", outcome: "x".repeat(41) },
    { evt: "kapy.request", reason: "has space" },
    { evt: "kapy.request", toolCalls: { "get my salary details": { ok: 1, fail: 0 } } }, // a key with spaces
    { evt: "kapy.request", user: "a@b.com" },
    { evt: "kapy.request", amount: "RM 5" },
    { evt: "kapy.request", fn: () => 1 },
    { evt: "kapy.request", big: 10n },
    { evt: "kapy.request", nested: { deep: { text: "secret words" } } },
  ];
  for (const e of unsafe) assert.throws(() => assertSafeMetrics(e), undefined, JSON.stringify(e, (_, v) => (typeof v === "bigint" ? "big" : v)));
});

test("an unsafe event is dropped, never logged", () => {
  const lines: string[] = [];
  emit((l) => lines.push(l), { evt: "kapy.rate_limited", window: "minute" });
  emit((l) => lines.push(l), { evt: "kapy.confirm", status: "I paid Ah Seng RM 50 for the secret deal" });
  assert.equal(lines.length, 2);
  assert.deepEqual(JSON.parse(lines[0]), { evt: "kapy.rate_limited", window: "minute" });
  assert.deepEqual(JSON.parse(lines[1]), { evt: "kapy.metrics_dropped" });
  assert.ok(!lines.join("").includes("Ah Seng"));
});

test("emit never throws, even if the logger does not", () => {
  assert.doesNotThrow(() => emit(() => { throw new Error("log sink down"); }, { evt: "kapy.rate_limited", window: "day" }) as unknown);
});

test("the shape supports the metrics the brief asks for", () => {
  const m = newMetrics(2);
  const keys = Object.keys(m);
  for (const k of ["tokens", "ms", "toolCalls", "outcome", "rounds", "modelCalls", "storeErrors", "intent", "intentConfidence", "lang", "grounding", "dataTruncated", "quotaUnavailable"]) {
    assert.ok(keys.includes(k), `missing ${k}`);
  }
});
