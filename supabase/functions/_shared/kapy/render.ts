// Text the SERVER writes itself, without the model.
//
// Used where a model-written sentence cannot be trusted or is not needed:
//   - the preview line above a confirmation card (so the model's own prose can
//     never claim something was saved),
//   - asking which period/category is meant when a reference cannot be resolved,
//   - the fallback when a reply's figures cannot be verified (the figures are
//     read straight from the tool results),
//   - plain failure messages.
//
// Written in the user's style (English / Malay; Manglish uses the Malay-led
// wording, which is how people who mix write to each other). Short and friendly:
// the tone matters even when no model is involved.
//
// Every figure here is a `formatted` string from finance.ts, copied, not computed.

export type Style = "en" | "ms" | "manglish";
const ms = (s: Style) => s !== "en";

export const previewText = (s: Style) =>
  ms(s)
    ? "Ni yang Kapy dah sediakan. Belum disimpan lagi — tengok kad di bawah dan tekan Sahkan kalau betul."
    : "Here's what I've prepared. It isn't saved yet — check the card below and tap Confirm if it's right.";

export const clarifyText = (kind: "period" | "category", s: Style) =>
  kind === "period"
    ? ms(s)
      ? "Bulan atau tempoh yang mana satu ni? Cakap je, contohnya “bulan lepas” atau “minggu ni”."
      : "Which month or period do you mean? For example “last month” or “this week”."
    : ms(s)
      ? "Kategori yang mana satu ni? Contohnya makan, transport atau shopping."
      : "Which category do you mean? For example food, transport or shopping.";

export const notSavedText = (s: Style) =>
  ms(s)
    ? "Kapy belum simpan apa-apa. Kalau nak rekod transaksi, bagitahu jumlah dan untuk apa, nanti Kapy sediakan kad untuk kau sahkan."
    : "Nothing has been saved. To record a transaction, tell me the amount and what it was for, and I'll prepare a card for you to confirm.";

export const tangledText = (s: Style) =>
  ms(s)
    ? "Kapy tersangkut sekejap 🦫 boleh cuba tanya semula dengan lebih ringkas?"
    : "I got a bit tangled up there 🦫 could you ask that again more simply?";

export const noDataText = (s: Style) =>
  ms(s)
    ? "Kapy tak dapat semak data kau sekarang. Cuba lagi sekejap lagi ya — Kapy tak nak teka-teka angka."
    : "I can't check your data right now. Please try again in a moment — I don't want to guess at figures.";

export const updateAppText = (s: Style) =>
  ms(s)
    ? "Untuk rekod transaksi, kemas kini app Tabara ke versi terbaru dahulu — versi ini belum ada kad pengesahan."
    : "To record a transaction, please update the Tabara app first — this version doesn't have the confirmation card yet.";

export const blockedText = (s: Style) =>
  ms(s)
    ? "Kapy tak dapat bantu dengan yang tu. Cuba tanya dengan cara lain?"
    : "I can't help with that one. Could you ask it a different way?";

export const unavailableText = (s: Style) =>
  ms(s)
    ? "Kapy tengah sibuk sikit sekarang. Cuba lagi sekejap lagi ya."
    : "Kapy is a bit busy right now. Please try again in a moment.";

export const rateLimitedText = (s: Style, window: "minute" | "day") =>
  ms(s)
    ? window === "minute"
      ? "Laju sangat 🦫 tunggu sekejap sebelum tanya lagi."
      : "Kapy dah jawab banyak soalan hari ni. Kita sambung esok ya."
    : window === "minute"
      ? "That was quick 🦫 give me a moment before asking again."
      : "We've hit today's chat limit. Let's pick this up tomorrow.";

const FALLBACK_HEAD = (s: Style) =>
  ms(s)
    ? "Kapy tak dapat pastikan ayat tadi, jadi ini angka sebenar daripada data kau:"
    : "I couldn't double-check my wording, so here are the exact figures from your data:";

type Obj = Record<string, unknown>;
const o = (v: unknown): Obj => (typeof v === "object" && v !== null ? (v as Obj) : {});
const fmt = (v: unknown): string => (typeof o(v).formatted === "string" ? (o(v).formatted as string) : "—");
const label = (v: unknown): string => (typeof o(v).label === "string" ? (o(v).label as string) : "");

/** A few plain lines describing one tool result. Empty if there is nothing to say. */
export function describeResult(result: Obj, s: Style): string[] {
  const m = ms(s);

  if (result.summary) {
    const x = o(result.summary);
    const p = label(x.period);
    const lines = [
      m ? `${p}: belanja ${fmt(x.spent)}, simpanan ${fmt(x.saved)}, pendapatan ${fmt(x.earned)}.` : `${p}: spent ${fmt(x.spent)}, saved ${fmt(x.saved)}, earned ${fmt(x.earned)}.`,
    ];
    if (x.balance) lines.push(m ? `Baki: ${fmt(x.balance)}.` : `Balance: ${fmt(x.balance)}.`);
    const cats = Array.isArray(x.spendingByCategory) ? (x.spendingByCategory as Obj[]).slice(0, 3) : [];
    if (cats.length) lines.push((m ? "Teratas: " : "Top: ") + cats.map((c) => `${c.label} ${fmt(c.spent)}`).join(", ") + ".");
    return lines;
  }

  if (result.report && !o(result.report).categories) {
    const r = o(result.report);
    const lines = [`${label(r.period)}: ${r.label} ${fmt(r.total)}.`];
    const b = o(r.budget);
    if (b.limit) lines.push(m ? `Had bajet ${fmt(b.limit)}, baki ${fmt(b.remaining)}.` : `Budget ${fmt(b.limit)}, remaining ${fmt(b.remaining)}.`);
    return lines;
  }

  if (result.topCategories) {
    const cats = (result.topCategories as Obj[]).slice(0, 5);
    return [`${label(result.period)}: ${(m ? "jumlah belanja " : "total spent ")}${fmt(result.totalSpent)}.`, cats.map((c) => `${c.label} ${fmt(c.spent)}`).join(", ") + "."];
  }

  if (result.comparison) {
    const c = o(result.comparison);
    const e = o(c.earlier);
    const l = o(c.later);
    const ch = o(o(c.change).spent);
    return [
      `${label(e.period)}: ${m ? "belanja" : "spent"} ${fmt(e.spent)}.`,
      `${label(l.period)}: ${m ? "belanja" : "spent"} ${fmt(l.spent)}.`,
      m ? `Beza: ${fmt(ch.amount)}.` : `Difference: ${fmt(ch.amount)}.`,
    ];
  }

  if (result.trend) {
    const t = o(result.trend);
    return (Array.isArray(t.months) ? (t.months as Obj[]) : []).map(
      (mo) => `${mo.label}: ${m ? "belanja" : "spent"} ${fmt(mo.spent)}${mo.partial ? (m ? " (bulan belum habis)" : " (month in progress)") : ""}.`
    );
  }

  if (result.affordability) {
    const a = o(result.affordability);
    const verdict = String(a.verdict);
    const word: Record<string, [string, string]> = {
      comfortable: ["selesa", "comfortable"],
      tight: ["ketat", "tight"],
      not_affordable: ["tak cukup", "not affordable"],
      unknown: ["tak pasti", "unknown"],
    };
    const v = word[verdict] ?? word.unknown;
    return [
      m ? `Simpan ${fmt(a.proposedSaving)} bulan ni: ${v[0]}.` : `Saving ${fmt(a.proposedSaving)} this month: ${v[1]}.`,
      m ? `Baki sekarang ${fmt(a.balanceNow)}, selepas simpan ${fmt(a.balanceAfterSaving)}.` : `Balance now ${fmt(a.balanceNow)}, after saving ${fmt(a.balanceAfterSaving)}.`,
    ];
  }

  if (result.report && Array.isArray(o(result.report).categories)) {
    const r = o(result.report);
    const ov = o(r.overall);
    if (!ov.budget) return [m ? "Bajet belum ditetapkan." : "No budget is set."];
    return [m ? `Bajet ${fmt(ov.budget)}, guna ${fmt(ov.spent)}, baki ${fmt(ov.remaining)}.` : `Budget ${fmt(ov.budget)}, used ${fmt(ov.spent)}, remaining ${fmt(ov.remaining)}.`];
  }

  if (Array.isArray(result.transactions)) {
    return (result.transactions as Obj[]).slice(0, 5).map((t) => `${t.date}: ${fmt(t.amount)} · ${t.category}`);
  }

  if (Array.isArray(result.passages) && (result.passages as Obj[]).length > 0) {
    return [String(o((result.passages as Obj[])[0]).text ?? "")];
  }
  return [];
}

/** Answers from tool results alone. Null if there are no usable results. */
export function fallbackFromResults(results: Obj[], s: Style): string | null {
  const lines: string[] = [];
  for (const r of results.slice(-2)) lines.push(...describeResult(r, s));
  if (lines.length === 0) return null;
  return [FALLBACK_HEAD(s), ...lines].join("\n");
}
