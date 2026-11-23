// Money, handled as whole sen (1 RM = 100 sen) so arithmetic is exact.
//
// Floating point cannot represent 0.1 or 0.2, and 0.1 + 0.2 is
// 0.30000000000000004. Summing a month of RM 12.90 receipts in floats drifts in
// the last digits, and a total that is off by a sen is a total a person will
// notice. Every calculation in the Kapy engine therefore runs on integers; a
// ringgit number is only produced at the edge, for display and for the model.
//
// Amounts come out of Postgres as `numeric(12,2)`, so they never carry more
// than two decimals and `Math.round(x * 100)` recovers the exact sen.
//
// No imports: runs unchanged under Deno and the Node test runner.

export type Sen = number;

/** What the model and the app receive for every amount. */
export interface Money {
  /** Ringgit, at most two decimals. Negative for a shortfall or decrease. */
  amount: number;
  /** Ready to read aloud, e.g. "RM 1,234.50" or "-RM 35.00". */
  formatted: string;
  currency: "MYR";
}

// Far beyond any real figure (RM 10 million per transaction, thousands of rows),
// well inside Number.MAX_SAFE_INTEGER, so sums stay exact.
const MAX_SEN = 1e13;

/**
 * Converts a ringgit value (a number or a plain decimal string) to sen.
 * Returns null for anything that is not a finite amount with at most two
 * decimals, so a stray 12.345 is rejected rather than silently rounded.
 */
export function toSen(value: unknown): Sen | null {
  let n: number;
  if (typeof value === "number") {
    n = value;
  } else if (typeof value === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(value)) {
    n = Number(value);
  } else {
    return null;
  }
  if (!Number.isFinite(n)) return null;
  const sen = Math.round(n * 100);
  if (Math.abs(sen) > MAX_SEN) return null;
  // Allow for binary representation error (e.g. 1.005 * 100 = 100.49999...) but
  // not for a genuine third decimal place.
  if (Math.abs(n * 100 - sen) > 1e-6 * Math.max(1, Math.abs(sen))) return null;
  return sen;
}

/** "RM 1,234.50"; negatives as "-RM 35.00". */
export function formatSen(sen: Sen): string {
  const negative = sen < 0;
  const abs = Math.abs(sen);
  const ringgit = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, "0");
  const grouped = String(ringgit).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}RM ${grouped}.${cents}`;
}

export function money(sen: Sen): Money {
  return { amount: sen / 100, formatted: formatSen(sen), currency: "MYR" };
}

/** The exact sen behind a Money value. */
export const senOf = (m: Money): Sen => Math.round(m.amount * 100);

/**
 * `part / whole` as a percentage with `decimals` places, using integer
 * arithmetic only. Null when the whole is zero or negative (a percentage of
 * nothing is not 0%, it is undefined, and callers must say so).
 */
export function percent(part: Sen, whole: Sen, decimals = 1): number | null {
  if (!(whole > 0)) return null;
  const scale = 10 ** decimals;
  // Round half away from zero without ever dividing floats first.
  const scaled = Math.abs(part) * scale * 100;
  const q = Math.floor(scaled / whole);
  const r = scaled - q * whole;
  const rounded = r * 2 >= whole ? q + 1 : q;
  return (part < 0 ? -rounded : rounded) / scale;
}

/** `sen / n`, rounded half away from zero to the nearest sen. */
export function divideRound(sen: Sen, n: number): Sen {
  if (!(n > 0)) return 0;
  const abs = Math.abs(sen);
  const q = Math.floor(abs / n);
  const r = abs - q * n;
  const rounded = r * 2 >= n ? q + 1 : q;
  return sen < 0 ? -rounded : rounded;
}

/** `sen * numerator / denominator`, rounded half away from zero. */
export function scaleRound(sen: Sen, numerator: number, denominator: number): Sen {
  if (!(denominator > 0)) return 0;
  const abs = Math.abs(sen) * numerator;
  const q = Math.floor(abs / denominator);
  const r = abs - q * denominator;
  const rounded = r * 2 >= denominator ? q + 1 : q;
  return sen < 0 ? -rounded : rounded;
}

export const sumSen = (values: Iterable<Sen>): Sen => {
  let total = 0;
  for (const v of values) total += v;
  return total;
};
