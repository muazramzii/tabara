// Money amounts handed back by a language model.
//
// Same principle as date.ts: a confidently wrong number is worse than none, so
// nothing is used until it is a finite, positive, plausible sum. The ceiling
// matches the database CHECK on transactions.amount, so the two layers agree.

/** RM 10,000,000. Keep in step with transactions_amount_max_chk (migrations). */
export const MAX_AMOUNT = 10_000_000;

/**
 * Returns the amount rounded to sen, or null when it cannot be trusted:
 * not a number, NaN/Infinity, zero or negative, or above the ceiling.
 * A numeric string such as "12.50" is accepted; "RM 12.50" is not.
 */
export function validateAmount(raw: unknown): number | null {
  let value: number;
  if (typeof raw === "number") {
    value = raw;
  } else if (typeof raw === "string" && /^\s*\d+(\.\d+)?\s*$/.test(raw)) {
    value = Number(raw);
  } else {
    return null;
  }
  if (!Number.isFinite(value) || value <= 0 || value > MAX_AMOUNT) return null;
  const rounded = Math.round(value * 100) / 100;
  // A value below half a sen rounds to zero, which is no amount at all.
  return rounded > 0 ? rounded : null;
}
