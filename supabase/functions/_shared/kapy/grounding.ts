// Checking what the model says against what the server computed.
//
// The model is told to quote figures from tool results and to do no arithmetic.
// Telling is not enough: models misquote, round creatively, and occasionally
// invent. So every ringgit amount and percentage in a reply is checked against
// the set of figures that actually appeared in this request's tool results (and
// in what the user typed). A reply that states a figure with no source is not
// sent as is: the model is asked once to correct itself, and if it still cannot,
// the server answers from the tool results itself.
//
// This verifies that a figure EXISTS in the data given to the model. It cannot
// verify that the model attached the right label to it ("your food spending was
// RM 150" where RM 150 is groceries). It is a net for invented and mistyped
// numbers, not a proof of correctness; the deterministic calculation layer and
// the tests on it are what make the numbers right.
//
// The same module catches the other lie that matters in a finance app: claiming
// a transaction was saved when nothing was. Saving can only happen through the
// confirmation endpoint, so any "I've recorded it" in a chat reply is false.

export interface Truth {
  /** Ringgit amounts, absolute values. */
  rm: number[];
  /** Percentages. */
  pct: number[];
}

const money = (v: unknown): v is { amount: number; currency: string } =>
  typeof v === "object" && v !== null && typeof (v as { amount?: unknown }).amount === "number" && (v as { currency?: unknown }).currency === "MYR";

/** Collects every amount and percentage that appears in a tool result. */
export function collectTruth(value: unknown, into: Truth = { rm: [], pct: [] }, key = ""): Truth {
  if (money(value)) {
    into.rm.push(Math.abs(value.amount));
    return into;
  }
  if (typeof value === "number") {
    if (/percent/i.test(key)) into.pct.push(Math.abs(value));
    // Figures a knowledge passage quotes (50, 30, 20) may be repeated.
    else if (key === "figures") into.pct.push(Math.abs(value));
    return into;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectTruth(v, into, key);
  } else if (typeof value === "object" && value !== null) {
    for (const [k, v] of Object.entries(value)) collectTruth(v, into, k);
  }
  return into;
}

export interface Figure {
  raw: string;
  value: number;
  /** Half the unit of the last digit shown: how far the model may be from the data. */
  tolerance: number;
}

const RM_PREFIX = /(?:rm|myr)\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(\s?(?:k|ribu|juta|m)\b)?/gi;
const RM_SUFFIX = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s?(?:ringgit)\b/gi;
const PERCENT = /(\d+(?:\.\d+)?)\s?%/g;

function rmFigure(whole: string, frac: string | undefined, suffix: string | undefined, raw: string): Figure {
  let value = Number(`${whole.replace(/,/g, "")}.${frac ?? "0"}`);
  let tolerance = frac === undefined ? 0.99 : frac.length === 1 ? 0.1 : 0.005;
  const s = suffix?.trim().toLowerCase();
  if (s) {
    const mult = s === "k" || s === "ribu" ? 1_000 : 1_000_000;
    value *= mult;
    // "RM1.2k" is a rounding of something between 1,150 and 1,250.
    tolerance = value * 0.05;
  }
  return { raw: raw.trim(), value, tolerance };
}

/** The ringgit amounts a text states. */
export function extractRm(text: string): Figure[] {
  const out: Figure[] = [];
  for (const m of text.matchAll(RM_PREFIX)) out.push(rmFigure(m[1], m[2], m[3], m[0]));
  for (const m of text.matchAll(RM_SUFFIX)) out.push(rmFigure(m[1], m[2], undefined, m[0]));
  return out;
}

/** The percentages a text states. */
export function extractPercent(text: string): Figure[] {
  return [...text.matchAll(PERCENT)].map((m) => {
    const decimals = m[1].includes(".") ? m[1].split(".")[1].length : 0;
    return { raw: m[0].trim(), value: Number(m[1]), tolerance: decimals === 0 ? 0.99 : decimals === 1 ? 0.1 : 0.01 };
  });
}

const near = (f: Figure, allowed: number[]) => allowed.some((a) => Math.abs(a - f.value) <= f.tolerance + 1e-9);

export interface GroundingResult {
  ok: boolean;
  /** The figures with no source, as the reply wrote them. */
  ungrounded: string[];
}

/**
 * Whether every ringgit amount and percentage in `reply` is backed by tool
 * results or by what the user themselves wrote. Zero and one hundred percent are
 * always allowed (they are not claims about the data).
 */
export function checkGrounding(reply: string, truth: Truth, userText: string): GroundingResult {
  const userRm = extractRm(userText).map((f) => f.value);
  const userPct = extractPercent(userText).map((f) => f.value);
  const allowedRm = [...truth.rm, ...userRm, 0];
  const allowedPct = [...truth.pct, ...userPct, 0, 100];

  const ungrounded: string[] = [];
  for (const f of extractRm(reply)) if (!near(f, allowedRm)) ungrounded.push(f.raw);
  for (const f of extractPercent(reply)) if (!near(f, allowedPct)) ungrounded.push(f.raw);
  return { ok: ungrounded.length === 0, ungrounded };
}

// ── claims that something was saved ─────────────────────────

const CLAIMS: RegExp[] = [
  // English: Kapy as the subject, or the passive.
  /\b(?:i|i've|i have|kapy|we)\s+(?:just\s+|already\s+|have\s+)?(?:saved|recorded|logged|added|noted|entered)\b/i,
  /\b(?:has|have|had)\s+been\s+(?:saved|recorded|logged|added|entered)\b/i,
  /\b(?:is|was)\s+(?:now\s+)?(?:saved|recorded|logged)\b/i,
  /\b(?:saved|recorded|logged)\s+(?:it|that|this)\b/i,
  /\b(?:transaction|entry|expense|income)\s+(?:is\s+|was\s+|has been\s+)?(?:saved|recorded|logged|added)\b/i,
  /\ball\s+set\b[^.?!]*\b(?:saved|recorded|logged)\b/i,
  // Malay
  /\b(?:aku|saya|kapy)\s+(?:dah|telah|sudah)\s+(?:simpan|rekod|catat|tambah|masukkan)\b/i,
  /\b(?:dah|telah|sudah|berjaya)\s+(?:disimpan|direkod(?:kan)?|dicatat|ditambah|dimasukkan)\b/i,
  /\bsiap\s+(?:aku\s+|kapy\s+)?(?:simpan|rekod|catat)\b/i,
];

// "Nothing has been saved yet" and "Belum disimpan" use the same words as a
// claim but say the opposite. A sentence that negates is not a claim.
const NEGATION =
  /\b(?:not|no|nothing|never|none|yet to|belum|tidak|tak|bukan|jangan|tiada)\b|n['’]t\b/i;

/** True if the text asserts that a transaction has been saved. */
export function claimsRecorded(text: string): boolean {
  return text
    .split(/(?<=[.!?\n])\s+/)
    .some((sentence) => CLAIMS.some((re) => re.test(sentence)) && !NEGATION.test(sentence));
}
