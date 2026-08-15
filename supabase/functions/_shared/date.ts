// Shared date validation for anything the model hands back.
//
// Both the receipt scanner and Kapy's add_transaction tool take a date from
// an LLM, and a confidently wrong date is worse than no date at all: it files
// a transaction in a month the user isn't looking at, which quietly distorts
// their totals and their streak. So nothing is trusted — a value has to be a
// real calendar date, in a plausible range, before it is used.

// Older than this is almost certainly a misread year (2016 for 2026 is one
// wrong digit) rather than a genuinely old receipt someone is entering now.
export const MAX_AGE_DAYS = 730;
const DAY_MS = 86_400_000;

/**
 * Returns a normalised YYYY-MM-DD string, or null if the input can't be
 * trusted. Callers treat null as "use today".
 */
export function validateDateString(raw: unknown, now = Date.now()): string | null {
  if (typeof raw !== "string") return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const parsed = new Date(Date.UTC(year, month - 1, day));
  // Round-trip check: Date.UTC silently rolls 2026-02-31 forward to 3 March
  // instead of failing, so compare the parts back out to reject impossible
  // dates. This is also what catches 29 February in a non-leap year.
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  // A day of slack: the phone, the shop's till and this server can sit in
  // different time zones, and something bought tonight isn't from the future.
  if (parsed.getTime() > now + DAY_MS) return null;
  if (parsed.getTime() < now - MAX_AGE_DAYS * DAY_MS) return null;

  return `${match[1]}-${match[2]}-${match[3]}`;
}

/**
 * A timestamp for the transactions table.
 *
 * Noon UTC rather than midnight, deliberately: stored at midnight, a date
 * read back in a timezone behind UTC lands on the previous calendar day.
 * Noon leaves ~12 hours of slack in both directions, so the date the user
 * saw on the receipt is the date they see in their history.
 */
export function toTimestamp(dateString: string): string {
  return new Date(`${dateString}T12:00:00.000Z`).toISOString();
}

/** Clamps a model-supplied confidence to 0–1, or null if unusable. */
export function validateConfidence(raw: unknown): number | null {
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.min(Math.max(value, 0), 1);
}
