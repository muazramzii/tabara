// Text the server writes itself, and the fallback built from tool results.

import test from "node:test";
import assert from "node:assert/strict";
import { clarifyText, describeResult, fallbackFromResults, noDataText, notSavedText, previewText, rateLimitedText, tangledText } from "../supabase/functions/_shared/kapy/render";
import { executeTool } from "../supabase/functions/_shared/kapy/executor";
import { makeSupabaseStore } from "../supabase/functions/_shared/kapy/store";
import { claimsRecorded } from "../supabase/functions/_shared/kapy/grounding";
import { ALICE, ledgerDb } from "./fixtures/kapy-harness";
import { makeFakeSupabase, uuid } from "./fixtures/fake-supabase";
import { NOW } from "./fixtures/kapy-ledger";
import type { ValidatedCall } from "../supabase/functions/_shared/kapy/tools";

const result = async (call: ValidatedCall) => {
  const fake = makeFakeSupabase(ledgerDb(), { authUser: ALICE });
  return (await executeTool(call, { store: makeSupabaseStore(fake.client, ALICE), now: NOW, uuid: () => uuid(1), lang: "en" })).result;
};

test("the preview text never claims to have saved anything, in any style", () => {
  for (const s of ["en", "ms", "manglish"] as const) {
    assert.equal(claimsRecorded(previewText(s)), false, s);
    assert.equal(claimsRecorded(notSavedText(s)), false, s);
  }
  assert.match(previewText("en"), /isn't saved yet/);
  assert.match(previewText("ms"), /Belum disimpan/);
});

test("clarifying questions are asked in the person's language", () => {
  assert.match(clarifyText("period", "ms"), /Bulan atau tempoh/);
  assert.match(clarifyText("period", "en"), /Which month or period/);
  assert.match(clarifyText("category", "manglish"), /Kategori yang mana/);
});

test("rate-limit text distinguishes a burst from the daily cap", () => {
  assert.match(rateLimitedText("en", "minute"), /moment/);
  assert.match(rateLimitedText("en", "day"), /tomorrow/);
  assert.match(rateLimitedText("ms", "day"), /esok/);
});

test("failure texts are plain and carry no figures", () => {
  for (const s of ["en", "ms"] as const) for (const t of [tangledText(s), noDataText(s), notSavedText(s)]) assert.ok(!/RM\s?\d/.test(t));
});

test("fallback: a summary is described with the server's own formatted figures", async () => {
  const lines = describeResult(await result({ name: "get_financial_summary", period: { kind: "this_month" } }), "en");
  const text = lines.join("\n");
  for (const f of ["November 2026", "RM 341.55", "RM 300.00", "RM 3,000.00", "RM 4,858.45", "Groceries RM 150.55"]) assert.ok(text.includes(f), `${f} in:\n${text}`);
});

test("fallback: each kind of result can be described", async () => {
  const calls: [string, ValidatedCall, RegExp][] = [
    ["category", { name: "get_category_spending", period: { kind: "this_month" }, category: "food" }, /RM 46\.01/],
    ["top categories", { name: "get_category_spending", period: { kind: "this_month" }, category: null }, /Groceries RM 150\.55/],
    ["comparison", { name: "compare_periods", a: { kind: "last_month" }, b: { kind: "this_month" } }, /RM 300\.00[\s\S]*RM 341\.55[\s\S]*RM 41\.55/],
    ["trend", { name: "get_spending_trend", months: 3 }, /September 2026[\s\S]*October 2026[\s\S]*month in progress/],
    ["budget", { name: "get_budget_status", period: { kind: "this_month" } }, /RM 5,000\.00/],
    ["affordability", { name: "check_savings_affordability", amountSen: 50000 }, /comfortable/],
    ["transactions", { name: "get_transactions", period: { kind: "this_month" }, category: null, type: null, limit: 2 }, /2026-11-20: RM 20\.01/],
    ["knowledge", { name: "search_financial_knowledge", query: "emergency fund" }, /emergency fund/i],
  ];
  for (const [label, call, expect] of calls) {
    const text = describeResult(await result(call), "en").join("\n");
    assert.match(text, expect, label);
  }
});

test("fallback in Malay", async () => {
  const text = fallbackFromResults([await result({ name: "get_financial_summary", period: { kind: "this_month" } })], "ms")!;
  assert.match(text, /angka sebenar/);
  assert.match(text, /belanja RM 341\.55/);
  assert.match(text, /Baki: RM 4,858\.45/);
});

test("fallback uses only the latest results, and is null when there is nothing", async () => {
  assert.equal(fallbackFromResults([], "en"), null);
  assert.equal(fallbackFromResults([{ ok: true, passages: [] }], "en"), null);
  const many = [await result({ name: "get_financial_summary", period: { kind: "last_month" } }), await result({ name: "get_financial_summary", period: { kind: "this_month" } }), await result({ name: "get_budget_status", period: { kind: "this_month" } })];
  const text = fallbackFromResults(many, "en")!;
  assert.ok(!text.includes("October 2026"), "only the last two results are used");
});

test("fallback text states figures only as the server formatted them; nothing is computed", async () => {
  const r = await result({ name: "get_financial_summary", period: { kind: "this_month" } });
  const text = describeResult(r, "en").join("\n");
  const figures = (text.match(/RM [\d,]+\.\d{2}/g) ?? []);
  const fromResult = JSON.stringify(r);
  for (const f of figures) assert.ok(fromResult.includes(f), `${f} was not in the tool result`);
});
