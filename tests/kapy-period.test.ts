// Date periods in Malaysia time.
//
// The sharp edge is the boundary: a transaction at 00:30 on 1 November in
// Kuala Lumpur is still 31 October in UTC.

import test from "node:test";
import assert from "node:assert/strict";
import {
  mustResolve,
  mytParts,
  parsePeriodSpec,
  recentMonthSpecs,
  resolvePeriod,
  shiftMonth,
  type PeriodSpec,
} from "../supabase/functions/_shared/kapy/period";
import { NOW } from "./fixtures/kapy-ledger";

const at = (iso: string) => Date.parse(iso);

test("mytParts reads Malaysia's calendar, not UTC's", () => {
  assert.deepEqual(mytParts(NOW), { year: 2026, month: 11, day: 22, weekday: 6, date: "2026-11-22", hour: 18 });
  // 16:30 UTC on 31 Oct is 00:30 on 1 Nov in Kuala Lumpur.
  const p = mytParts(at("2026-10-31T16:30:00Z"));
  assert.equal(p.date, "2026-11-01");
  assert.equal(p.hour, 0);
  // One second earlier is still the 31st.
  assert.equal(mytParts(at("2026-10-31T15:59:59Z")).date, "2026-10-31");
});

test("weekday is Monday-based", () => {
  assert.equal(mytParts(at("2026-11-16T04:00:00Z")).weekday, 0); // Monday
  assert.equal(mytParts(at("2026-11-22T04:00:00Z")).weekday, 6); // Sunday
  assert.equal(mytParts(at("2026-11-19T04:00:00Z")).weekday, 3); // Thursday
});

test("this month: boundaries are Malaysian midnight, expressed in UTC", () => {
  const p = mustResolve({ kind: "this_month" }, NOW);
  assert.equal(p.fromDate, "2026-11-01");
  assert.equal(p.toDate, "2026-11-30");
  assert.equal(p.startUtc, "2026-10-31T16:00:00.000Z");
  assert.equal(p.endUtc, "2026-11-30T16:00:00.000Z");
  assert.equal(p.days, 30);
  assert.equal(p.elapsedDays, 22);
  assert.equal(p.complete, false);
  assert.equal(p.isCalendarMonth, true);
  assert.equal(p.label, "November 2026");
});

test("last month", () => {
  const p = mustResolve({ kind: "last_month" }, NOW);
  assert.equal(p.fromDate, "2026-10-01");
  assert.equal(p.toDate, "2026-10-31");
  assert.equal(p.startUtc, "2026-09-30T16:00:00.000Z");
  assert.equal(p.endUtc, "2026-10-31T16:00:00.000Z");
  assert.equal(p.days, 31);
  assert.equal(p.elapsedDays, 31);
  assert.equal(p.complete, true);
});

test("just after midnight in Malaysia, 'this month' is already the new month", () => {
  const justBefore = mustResolve({ kind: "this_month" }, at("2026-10-31T15:59:59Z"));
  assert.equal(justBefore.label, "October 2026");
  const justAfter = mustResolve({ kind: "this_month" }, at("2026-10-31T16:00:00Z"));
  assert.equal(justAfter.label, "November 2026");
  assert.equal(justAfter.elapsedDays, 1);
});

test("last month across a year boundary", () => {
  const p = mustResolve({ kind: "last_month" }, at("2027-01-05T04:00:00Z"));
  assert.equal(p.fromDate, "2026-12-01");
  assert.equal(p.toDate, "2026-12-31");
});

test("leap years", () => {
  assert.equal(mustResolve({ kind: "month", year: 2028, month: 2 }, NOW).days, 29);
  assert.equal(mustResolve({ kind: "month", year: 2026, month: 2 }, NOW).days, 28);
  assert.equal(mustResolve({ kind: "month", year: 2100, month: 2 }, NOW).days, 28); // 2100 is not a leap year
});

test("this week and last week run Monday to Sunday", () => {
  const w = mustResolve({ kind: "this_week" }, NOW); // Sunday 22 Nov
  assert.equal(w.fromDate, "2026-11-16");
  assert.equal(w.toDate, "2026-11-22");
  assert.equal(w.elapsedDays, 7);
  assert.equal(w.isCalendarMonth, false);
  const lw = mustResolve({ kind: "last_week" }, NOW);
  assert.equal(lw.fromDate, "2026-11-09");
  assert.equal(lw.toDate, "2026-11-15");
  assert.equal(lw.complete, true);
});

test("a week that straddles two months", () => {
  const w = mustResolve({ kind: "this_week" }, at("2026-12-02T04:00:00Z")); // Wednesday
  assert.equal(w.fromDate, "2026-11-30");
  assert.equal(w.toDate, "2026-12-06");
  assert.equal(w.elapsedDays, 3);
});

test("today and yesterday", () => {
  const t = mustResolve({ kind: "today" }, NOW);
  assert.equal(t.fromDate, "2026-11-22");
  assert.equal(t.toDate, "2026-11-22");
  assert.equal(t.days, 1);
  const y = mustResolve({ kind: "yesterday" }, NOW);
  assert.equal(y.fromDate, "2026-11-21");
  assert.equal(y.complete, true);
});

test("rolling days include today", () => {
  const p = mustResolve({ kind: "last_n_days", days: 30 }, NOW);
  assert.equal(p.toDate, "2026-11-22");
  assert.equal(p.fromDate, "2026-10-24");
  assert.equal(p.days, 30);
});

test("last three months runs from the first of the month two back to the end of this one", () => {
  const p = mustResolve({ kind: "last_n_months", months: 3 }, NOW);
  assert.equal(p.fromDate, "2026-09-01");
  assert.equal(p.toDate, "2026-11-30");
  assert.equal(p.days, 30 + 31 + 30);
  assert.equal(p.isCalendarMonth, false);
});

test("a custom range is inclusive on both ends", () => {
  const p = mustResolve({ kind: "range", from: "2026-11-05", to: "2026-11-07" }, NOW);
  assert.equal(p.days, 3);
  assert.equal(p.startUtc, "2026-11-04T16:00:00.000Z");
  assert.equal(p.endUtc, "2026-11-07T16:00:00.000Z");
  assert.equal(p.complete, true);
});

test("a range in the future has no elapsed days", () => {
  const p = mustResolve({ kind: "range", from: "2026-12-01", to: "2026-12-05" }, NOW);
  assert.equal(p.elapsedDays, 0);
  assert.equal(p.complete, false);
});

test("parsePeriodSpec accepts valid specs", () => {
  for (const spec of [
    { kind: "today" },
    { kind: "this_month" },
    { kind: "month", year: 2026, month: 10 },
    { kind: "last_n_days", days: 7 },
    { kind: "last_n_months", months: 3 },
    { kind: "range", from: "2026-01-01", to: "2026-01-31" },
  ] as PeriodSpec[]) {
    assert.deepEqual(parsePeriodSpec(spec), spec);
  }
});

test("parsePeriodSpec rejects everything else", () => {
  const bad: unknown[] = [
    null, undefined, "this_month", 5, [], {},
    { kind: "forever" },
    { kind: "month", year: 2026, month: 13 },
    { kind: "month", year: 2026, month: 0 },
    { kind: "month", year: 1999, month: 1 },
    { kind: "month", year: 2026.5, month: 1 },
    { kind: "month", year: "2026", month: 1 },
    { kind: "last_n_days", days: 0 },
    { kind: "last_n_days", days: 367 },
    { kind: "last_n_months", months: 13 },
    { kind: "range", from: "2026-02-31", to: "2026-03-05" },
    { kind: "range", from: "2026-11-10", to: "2026-11-01" }, // reversed
    { kind: "range", from: "2026-01-01", to: "2027-06-01" }, // too long
    { kind: "range", from: "26-01-01", to: "2026-01-02" },
    { kind: "range", from: "2026-01-01" },
    { kind: "range", from: "1999-12-31", to: "2000-01-05" },
  ];
  for (const b of bad) assert.equal(parsePeriodSpec(b), null, JSON.stringify(b));
});

test("resolvePeriod reports an invalid spec instead of throwing", () => {
  assert.deepEqual(resolvePeriod({ kind: "month", year: 2026, month: 99 } as PeriodSpec, NOW), {
    ok: false,
    error: "invalid_period",
  });
});

test("shiftMonth wraps years in both directions", () => {
  assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
  assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
  assert.deepEqual(shiftMonth(2026, 6, -18), { year: 2024, month: 12 });
  assert.deepEqual(shiftMonth(2026, 11, 0), { year: 2026, month: 11 });
});

test("recentMonthSpecs lists months oldest first, ending with the current one", () => {
  assert.deepEqual(recentMonthSpecs(3, at("2027-01-10T04:00:00Z")), [
    { kind: "month", year: 2026, month: 11 },
    { kind: "month", year: 2026, month: 12 },
    { kind: "month", year: 2027, month: 1 },
  ]);
});
