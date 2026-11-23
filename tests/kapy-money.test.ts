// Money arithmetic: exact, in whole sen.

import test from "node:test";
import assert from "node:assert/strict";
import {
  divideRound,
  formatSen,
  money,
  percent,
  scaleRound,
  senOf,
  sumSen,
  toSen,
} from "../supabase/functions/_shared/kapy/money";

test("toSen converts ringgit exactly", () => {
  assert.equal(toSen(12.5), 1250);
  assert.equal(toSen("12.50"), 1250);
  assert.equal(toSen(0.07), 7);
  assert.equal(toSen(1.005 + 0.005), 101); // 1.01 despite binary representation
  assert.equal(toSen("-35"), -3500);
  assert.equal(toSen(0), 0);
});

test("toSen rejects what is not an amount with at most two decimals", () => {
  for (const bad of [12.345, "12.345", NaN, Infinity, -Infinity, "abc", "RM 5", "", null, undefined, {}, [], true, 1e20, "1e3"]) {
    assert.equal(toSen(bad), null, String(bad));
  }
});

test("floating point would drift here; sen does not", () => {
  assert.notEqual(0.1 + 0.2, 0.3);
  assert.equal(sumSen([toSen(0.1)!, toSen(0.2)!]), toSen(0.3));

  const thousand = Array.from({ length: 1000 }, () => toSen(12.9)!);
  assert.equal(sumSen(thousand), 1_290_000);
  assert.equal(money(sumSen(thousand)).amount, 12900);
  // The naive float sum is not exactly 12900.
  assert.notEqual(
    Array.from({ length: 1000 }, () => 12.9).reduce((a, b) => a + b, 0),
    12900
  );
});

test("formatSen: grouping, sen padding, negatives", () => {
  assert.equal(formatSen(123450), "RM 1,234.50");
  assert.equal(formatSen(5), "RM 0.05");
  assert.equal(formatSen(0), "RM 0.00");
  assert.equal(formatSen(-3500), "-RM 35.00");
  assert.equal(formatSen(100_000_000), "RM 1,000,000.00");
  assert.equal(formatSen(99), "RM 0.99");
  assert.equal(formatSen(100), "RM 1.00");
});

test("money() round-trips through senOf", () => {
  for (const sen of [0, 1, 99, 100, 123456, -4250, 1_000_000_00]) {
    assert.equal(senOf(money(sen)), sen);
  }
  assert.deepEqual(money(85000), { amount: 850, formatted: "RM 850.00", currency: "MYR" });
});

test("percent rounds half away from zero, using integers", () => {
  assert.equal(percent(1, 3), 33.3);
  assert.equal(percent(2, 3), 66.7);
  assert.equal(percent(1, 8), 12.5);
  assert.equal(percent(1, 16), 6.3); // 6.25 -> 6.3
  assert.equal(percent(5, 10, 0), 50);
  assert.equal(percent(1, 3, 0), 33);
  assert.equal(percent(-1, 3), -33.3);
  assert.equal(percent(4155, 30000), 13.9); // 13.85 -> 13.9
  assert.equal(percent(0, 100), 0);
  assert.equal(percent(150, 100), 150);
});

test("percent of nothing is undefined, not zero", () => {
  assert.equal(percent(5, 0), null);
  assert.equal(percent(5, -10), null);
});

test("divideRound rounds half away from zero", () => {
  assert.equal(divideRound(1000, 3), 333);
  assert.equal(divideRound(1001, 2), 501);
  assert.equal(divideRound(-1001, 2), -501);
  assert.equal(divideRound(34155, 22), 1553); // 1552.5 -> 1553
  assert.equal(divideRound(500, 0), 0);
  assert.equal(divideRound(500, -3), 0);
});

test("scaleRound multiplies before dividing", () => {
  assert.equal(scaleRound(34155, 30, 22), 46575); // exactly RM 465.75
  assert.equal(scaleRound(100, 1, 3), 33);
  assert.equal(scaleRound(100, 2, 3), 67);
  assert.equal(scaleRound(100, 1, 0), 0);
});
