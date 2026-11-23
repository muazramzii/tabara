// The app's side of the conversation: reading server responses defensively, and
// the life of a confirmation card.

import test from "node:test";
import assert from "node:assert/strict";
import {
  addReply, canCancel, canConfirm, describeSaved, historyForServer, parseConfirmation, parseProposal, parseReply, parseSaved, updateCard,
  type ChatMessage, type Proposal, type SavedTransaction,
} from "../src/lib/kapy-chat";

const RID = "00000000-0000-4000-8000-000000000001";
const RID2 = "00000000-0000-4000-8000-000000000002";
const prop = (over: Record<string, unknown> = {}) => ({
  requestId: RID, amount: 12.5, formatted: "RM 12.50", currency: "MYR", type: "expense", category: "food",
  categoryLabel: "Food & Drink", date: "2026-11-22", dateLabel: "22 Nov 2026", note: "Mamak", ...over,
});
const saved = (over: Record<string, unknown> = {}) => ({
  id: "row-1", amount: 12.5, formatted: "RM 12.50", type: "expense", category: "food", categoryLabel: "Food & Drink",
  note: "Mamak", date: "2026-11-22", dateLabel: "22 Nov 2026", ...over,
});

// ── reading responses ───────────────────────────────────────

test("a valid proposal is accepted", () => {
  assert.deepEqual(parseProposal(prop()), prop());
  assert.equal(parseProposal(prop({ note: null }))?.note, null);
  assert.equal(parseProposal({ ...prop(), note: undefined })?.note, null);
});

test("anything off about a proposal and no card is shown", () => {
  const bad: unknown[] = [
    null, undefined, "x", 5, [],
    prop({ requestId: "nope" }), prop({ amount: 0 }), prop({ amount: -1 }), prop({ amount: "12.5" }), prop({ amount: NaN }),
    prop({ type: "transfer" }), prop({ currency: "USD" }), prop({ formatted: undefined }), prop({ category: "" }),
    prop({ date: "22/11/2026" }), prop({ note: 5 }), prop({ note: "x".repeat(500) }), prop({ categoryLabel: "x".repeat(500) }),
  ];
  for (const b of bad) assert.equal(parseProposal(b), null, JSON.stringify(b)?.slice(0, 60));
});

test("a saved transaction is read the same way", () => {
  assert.deepEqual(parseSaved(saved()), saved());
  for (const bad of [null, {}, saved({ id: undefined }), saved({ amount: "x" }), saved({ type: "other" }), saved({ formatted: 5 })]) assert.equal(parseSaved(bad), null);
});

test("a reply needs text; a bad proposal is dropped but the text survives", () => {
  assert.equal(parseReply({ reply: "" }), null);
  assert.equal(parseReply({ reply: "   " }), null);
  assert.equal(parseReply({}), null);
  assert.equal(parseReply(null), null);
  assert.equal(parseReply({ reply: 5 }), null);
  const r = parseReply({ reply: " hello ", context: { v: 1 }, proposal: prop({ amount: -5 }) });
  assert.deepEqual(r, { reply: "hello", context: { v: 1 }, proposal: null });
  assert.equal(parseReply({ reply: "hi", context: "bad" })?.context, null);
});

test("a confirmation must say recorded or already_recorded", () => {
  assert.deepEqual(parseConfirmation({ status: "recorded", transaction: saved() }), { status: "recorded", transaction: saved() });
  assert.deepEqual(parseConfirmation({ status: "already_recorded", transaction: null }), { status: "already_recorded", transaction: null });
  for (const bad of [null, {}, { status: "ok" }, { status: "failed" }, "recorded", { status: 1 }]) assert.equal(parseConfirmation(bad), null);
});

// ── the card's life ─────────────────────────────────────────

const greeting: ChatMessage = { role: "model", text: "Hey" };
const withCard = (id = RID): ChatMessage[] => addReply([greeting, { role: "user", text: "I spent RM12.50 on lunch" }], { reply: "Here it is", context: null, proposal: prop({ requestId: id }) as Proposal });

test("a reply with a proposal adds a pending card", () => {
  const m = withCard();
  assert.equal(m.at(-1)!.card?.state, "pending");
  assert.equal(m.at(-1)!.card?.data.requestId, RID);
  assert.equal(m.at(-1)!.role, "model");
});

test("a reply without one adds plain text and touches nothing else", () => {
  const before = withCard();
  const after = addReply(before, { reply: "ok", context: null, proposal: null });
  assert.equal(after.length, before.length + 1);
  assert.equal(after.at(-1)!.card, undefined);
  assert.equal(after[after.length - 2].card?.state, "pending");
});

test("a correction replaces the earlier card: only one can be confirmed", () => {
  const first = withCard(RID);
  const second = addReply(first, { reply: "Updated", context: null, proposal: prop({ requestId: RID2, amount: 20, formatted: "RM 20.00" }) as Proposal });
  const cards = second.filter((m) => m.card);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].card!.state, "replaced");
  assert.equal(cards[1].card!.state, "pending");
  assert.equal(canConfirm(second, RID), false);
  assert.equal(canConfirm(second, RID2), true);
});

test("a card already saved is never replaced", () => {
  let m = withCard(RID);
  m = updateCard(m, RID, (c) => ({ ...c, state: "saved", saved: saved() as SavedTransaction }));
  m = addReply(m, { reply: "Another", context: null, proposal: prop({ requestId: RID2 }) as Proposal });
  assert.equal(m.find((x) => x.card?.data.requestId === RID)!.card!.state, "saved");
});

test("only pending and failed cards can be confirmed or cancelled", () => {
  const states = ["pending", "saving", "saved", "already_saved", "failed", "cancelled", "replaced"] as const;
  for (const state of states) {
    const m = updateCard(withCard(), RID, (c) => ({ ...c, state }));
    const expected = state === "pending" || state === "failed";
    assert.equal(canConfirm(m, RID), expected, state);
    assert.equal(canCancel(m, RID), expected, state);
  }
  assert.equal(canConfirm(withCard(), "unknown-id"), false);
});

test("updating one card leaves every other message alone", () => {
  const m = withCard();
  const after = updateCard(m, RID, (c) => ({ ...c, state: "saving" }));
  assert.equal(after.length, m.length);
  assert.deepEqual(after.filter((x) => !x.card), m.filter((x) => !x.card));
  assert.equal(m.at(-1)!.card!.state, "pending", "the original array is not mutated");
});

test("a failed card keeps its error and can be retried", () => {
  const m = updateCard(withCard(), RID, (c) => ({ ...c, state: "failed", error: "Couldn't save that. Nothing was saved." }));
  assert.equal(m.at(-1)!.card!.error, "Couldn't save that. Nothing was saved.");
  assert.equal(canConfirm(m, RID), true);
});

// ── what goes to the server ─────────────────────────────────

test("only text is sent: no photos, no card state, no empty bubbles", () => {
  const m: ChatMessage[] = [
    { role: "model", text: "Hey" },
    { role: "user", text: "", image: "file:///receipt.jpg" },
    { role: "user", text: "I just scanned a receipt", image: "file:///other.jpg" },
    ...withCard().slice(-1),
  ];
  const h = historyForServer(m);
  assert.deepEqual(h.map((x) => Object.keys(x).sort()), h.map(() => ["role", "text"]));
  assert.ok(!JSON.stringify(h).includes("file://"));
  assert.ok(!JSON.stringify(h).includes("requestId"));
  assert.equal(h.length, 3);
});

// ── wording ─────────────────────────────────────────────────

test("the saved line comes from the stored row", () => {
  assert.equal(describeSaved(saved() as SavedTransaction), "Expense saved: RM 12.50 · Food & Drink · 22 Nov 2026");
  assert.equal(describeSaved(saved({ type: "income", formatted: "RM 3,000.00", categoryLabel: "Salary" }) as SavedTransaction), "Income saved: RM 3,000.00 · Salary · 22 Nov 2026");
});
