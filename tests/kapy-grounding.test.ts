// Checking a reply's figures against what the tools returned, and catching the
// false claim that something was saved.

import test from "node:test";
import assert from "node:assert/strict";
import { checkGrounding, claimsRecorded, collectTruth, extractPercent, extractRm } from "../supabase/functions/_shared/kapy/grounding";
import { money } from "../supabase/functions/_shared/kapy/money";

const truthFrom = (obj: unknown) => collectTruth(obj);

test("ringgit amounts are found in the formats people and models write", () => {
  const v = (s: string) => extractRm(s).map((f) => f.value);
  assert.deepEqual(v("You spent RM 341.55 this month"), [341.55]);
  assert.deepEqual(v("RM341.55 and rm 5"), [341.55, 5]);
  assert.deepEqual(v("total RM1,234.50"), [1234.5]);
  assert.deepEqual(v("lebih kurang 850 ringgit"), [850]);
  assert.deepEqual(v("around RM2k"), [2000]);
  assert.deepEqual(v("RM1.2k"), [1200]);
  assert.deepEqual(v("tiada angka di sini"), []);
  assert.deepEqual(v("3 bulan, 22 hari"), []); // bare numbers are not money
});

test("percentages are found", () => {
  assert.deepEqual(extractPercent("used 6.8% of budget, 20% goal").map((f) => f.value), [6.8, 20]);
  assert.deepEqual(extractPercent("100 %").map((f) => f.value), [100]);
});

test("figures from tool results become the allowed set, absolute values only", () => {
  const t = truthFrom({
    summary: { spent: money(34155), balance: money(-4200), budgetUsedPercent: 6.8, nested: [{ saved: money(30000) }] },
    figures: [50, 30, 20],
  });
  assert.deepEqual(t.rm.sort((a, b) => a - b), [42, 300, 341.55]);
  assert.deepEqual(t.pct.sort((a, b) => a - b), [6.8, 20, 30, 50]);
});

test("an amount that is in the tool results is grounded", () => {
  const t = truthFrom({ spent: money(34155) });
  assert.equal(checkGrounding("Kau belanja RM 341.55 bulan ni.", t, "").ok, true);
  assert.equal(checkGrounding("You spent RM341.55.", t, "").ok, true);
});

test("an invented amount is caught, and named", () => {
  const t = truthFrom({ spent: money(34155) });
  const g = checkGrounding("You spent RM 999.00 this month.", t, "");
  assert.equal(g.ok, false);
  assert.deepEqual(g.ungrounded, ["RM 999.00"]);
});

test("a figure with no tools at all is ungrounded", () => {
  assert.equal(checkGrounding("You have RM 500 left.", { rm: [], pct: [] }, "").ok, false);
});

test("a model's own arithmetic is caught (a sum nobody computed)", () => {
  const t = truthFrom({ food: money(4601), transport: money(4500) });
  assert.equal(checkGrounding("Food and transport together are RM 91.01.", t, "").ok, false);
});

test("rounding to a whole ringgit is allowed; further off is not", () => {
  const t = truthFrom({ spent: money(34155) });
  for (const ok of ["RM 342", "RM 341"]) assert.equal(checkGrounding(ok, t, "").ok, true, ok);
  for (const bad of ["RM 340", "RM 343", "RM 341.60", "RM 341.40"]) assert.equal(checkGrounding(bad, t, "").ok, false, bad);
  // One decimal place is a legitimate rounding of 341.55 either way.
  for (const ok of ["RM 341.5", "RM 341.6"]) assert.equal(checkGrounding(ok, t, "").ok, true, ok);
});

test("'about RM 1.2k' is accepted for 1,234.50 but not for 1,500", () => {
  assert.equal(checkGrounding("around RM1.2k", truthFrom({ x: money(123450) }), "").ok, true);
  assert.equal(checkGrounding("around RM1.2k", truthFrom({ x: money(150000) }), "").ok, false);
});

test("a figure the user wrote themselves may be repeated", () => {
  assert.equal(checkGrounding("Saving RM300 a month is possible.", { rm: [], pct: [] }, "Can I afford to save RM300 this month?").ok, true);
  assert.equal(checkGrounding("Saving RM400 a month is possible.", { rm: [], pct: [] }, "Can I afford to save RM300 this month?").ok, false);
});

test("percentages are held to the same standard", () => {
  const t = truthFrom({ budgetUsedPercent: 6.8, plannedSavingsRatePercent: 20 });
  assert.equal(checkGrounding("You've used 6.8% of your budget.", t, "").ok, true);
  assert.equal(checkGrounding("You've used 7% of your budget.", t, "").ok, true);
  assert.equal(checkGrounding("You've used 35% of your budget.", t, "").ok, false);
});

test("zero and one hundred percent are never claims about the data", () => {
  assert.equal(checkGrounding("RM 0 spent, 100% sure, 0% used", { rm: [], pct: [] }, "").ok, true);
});

test("a reply with no figures is fine", () => {
  assert.equal(checkGrounding("Tak apa, kita improve slowly 🦫", { rm: [], pct: [] }, "").ok, true);
});

test("the 50/30/20 figures from a knowledge passage may be repeated, and only those", () => {
  const t = truthFrom({ passages: [{ figures: [50, 30, 20] }] });
  assert.equal(checkGrounding("About 50% needs, 30% wants, 20% savings.", t, "").ok, true);
  assert.equal(checkGrounding("About 60% needs.", t, "").ok, false);
});

// ── "I've saved it" ─────────────────────────────────────────

test("claims that a transaction was saved are detected, in each language", () => {
  const claims = [
    "Done! I've recorded RM 15 under Food.",
    "I saved it for you.",
    "Saved that under Savings.",
    "Your transaction has been saved.",
    "The expense was recorded.",
    "It's all set, I've logged it.",
    "Aku dah simpan transaksi tu.",
    "Kapy dah rekod RM 15 untuk makan.",
    "Berjaya disimpan!",
    "Dah direkodkan ya.",
    "Siap simpan.",
  ];
  for (const c of claims) assert.equal(claimsRecorded(c), true, c);
});

test("ordinary talk about the user's own saving is not a claim", () => {
  const fine = [
    "You saved RM 300.00 this month.",
    "Kau dah simpan RM 300.00 bulan ni.",
    "Bulan lepas kau berjaya simpan RM 400.00.",
    "Your savings goal is RM 500.",
    "I can prepare that for you to confirm.",
    "Check the card and tap Confirm to save it.",
    "Belum disimpan lagi, tekan Sahkan.",
    "Savings rate kau 20%.",
    // Negations use a claim's words to say the opposite.
    "Nothing has been saved yet.",
    "It hasn't been recorded.",
    "I haven't saved anything — please confirm the card first.",
    "Transaksi tu belum direkodkan.",
    "Kapy tak simpan apa-apa lagi.",
    "Not saved yet. Tap Confirm to save it.",
  ];
  for (const f of fine) assert.equal(claimsRecorded(f), false, f);
});
