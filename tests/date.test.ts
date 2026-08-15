// Dates that came from a language model reading a photograph. A missing date
// is recoverable — the app falls back to today. A confidently wrong one is
// not: it files a transaction in a month the user is not looking at.

import test from "node:test";
import assert from "node:assert/strict";
import {
  validateDateString,
  validateConfidence,
  toTimestamp,
} from "../supabase/functions/_shared/date";

const NOW = Date.UTC(2026, 7, 16); // 16 August 2026
const at = (s: unknown) => validateDateString(s, NOW);

test("accepts real recent dates", () => {
  assert.equal(at("2026-08-16"), "2026-08-16", "today");
  assert.equal(at("2026-08-11"), "2026-08-11", "a few days ago");
  assert.equal(at("2025-12-25"), "2025-12-25", "last year, still in range");
  assert.equal(at("  2026-08-16  "), "2026-08-16", "padded input is trimmed");
});

test("allows one day of slack for timezones", () => {
  assert.equal(at("2026-08-17"), "2026-08-17", "tonight's receipt is not the future");
});

test("rejects dates in the future", () => {
  assert.equal(at("2026-09-16"), null, "next month");
  assert.equal(at("2027-01-01"), null, "next year");
});

test("rejects implausibly old dates", () => {
  // 2016 for 2026 is a single misread digit, and would bury the transaction
  // ten years back where nobody would find it.
  assert.equal(at("2016-08-16"), null);
});

test("rejects dates that do not exist", () => {
  // Date.UTC rolls 31 February forward to 3 March rather than failing, so the
  // parts have to be compared back out.
  assert.equal(at("2026-02-31"), null, "31 February");
  assert.equal(at("2026-02-29"), null, "29 February in a non-leap year");
  assert.equal(at("2026-13-01"), null, "month 13");
  assert.equal(at("2026-08-00"), null, "day zero");
});

test("accepts a real leap day when it is in range", () => {
  assert.equal(
    validateDateString("2024-02-29", Date.UTC(2024, 5, 1)),
    "2024-02-29"
  );
});

test("rejects anything that is not a plain YYYY-MM-DD string", () => {
  assert.equal(at("16/08/2026"), null, "day-first format");
  assert.equal(at("2026-08-16T10:00:00Z"), null, "full timestamp");
  assert.equal(at("2026-8-6"), null, "unpadded");
  assert.equal(at(""), null);
  assert.equal(at(null), null);
  assert.equal(at(20260816), null, "a number, not a string");
  assert.equal(at({}), null);
  assert.equal(at("2026-08-16'; drop table transactions--"), null);
});

test("timestamps survive a timezone round trip", () => {
  // Stored at noon UTC rather than midnight: at midnight, anywhere west of
  // UTC reads the date back as the previous day.
  const ts = toTimestamp("2026-08-03");
  for (const offsetHours of [-11, -5, 0, 8, 11]) {
    const local = new Date(new Date(ts).getTime() + offsetHours * 3600000);
    assert.equal(
      local.toISOString().slice(0, 10),
      "2026-08-03",
      `shifted a day at UTC${offsetHours >= 0 ? "+" : ""}${offsetHours}`
    );
  }
});

test("confidence is clamped to 0-1", () => {
  assert.equal(validateConfidence(0.7), 0.7);
  assert.equal(validateConfidence(0), 0);
  assert.equal(validateConfidence(1), 1);
  assert.equal(validateConfidence(5), 1, "clamped down");
  assert.equal(validateConfidence(-2), 0, "clamped up");
  assert.equal(validateConfidence("0.5"), 0.5, "numeric string accepted");
});

test("unusable confidence becomes null rather than a guess", () => {
  assert.equal(validateConfidence("very sure"), null);
  assert.equal(validateConfidence(undefined), null);
  assert.equal(validateConfidence(NaN), null);
  assert.equal(validateConfidence({}), null);
});
