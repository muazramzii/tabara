// Safe error messages (src/lib/errors.ts).
//
// The point of this file: whatever the backend throws, the text a person sees
// is chosen by us. Postgres constraint names, row contents, provider messages
// and "non-2xx status code" never reach a screen.

import test from "node:test";
import assert from "node:assert/strict";
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/functions-js";
import {
  AppError,
  GENERIC_ERROR,
  NETWORK_ERROR,
  SESSION_EXPIRED,
  messageForStatus,
  safeServerMessage,
  toSafeError,
  toSafeFunctionError,
} from "../src/lib/errors";

// A PostgREST error as supabase-js returns it. `details` carries the failing row.
const pgError = (code: string, message: string, details = "") => ({
  code,
  message,
  details,
  hint: null,
});

// ── database errors ─────────────────────────────────────────

test("a check violation becomes a sentence about the rule, not the constraint", () => {
  const cases: [string, RegExp][] = [
    ['new row for relation "transactions" violates check constraint "transactions_amount_max_chk"', /too large/i],
    ['new row for relation "transactions" violates check constraint "transactions_amount_check"', /greater than zero/i],
    ['new row for relation "transactions" violates check constraint "transactions_category_format_chk"', /category/i],
    ['new row for relation "transactions" violates check constraint "transactions_note_length_chk"', /note is too long/i],
    ['new row for relation "transactions" violates check constraint "transactions_date_range_chk"', /date/i],
    ['new row for relation "profiles" violates check constraint "profiles_income_nonneg_chk"', /negative/i],
    ['new row for relation "profiles" violates check constraint "profiles_budgets_valid_chk"', /budget/i],
  ];
  for (const [message, expected] of cases) {
    const err = toSafeError(pgError("23514", message));
    assert.match(err.message, expected, message);
    assert.ok(!/constraint|violates|_chk|relation|transactions_|profiles_/i.test(err.message), err.message);
  }
});

test("an unrecognised check violation is still generic and leaks nothing", () => {
  const err = toSafeError(pgError("23514", 'violates check constraint "some_future_chk"'));
  assert.equal(err.message, "Some of those values aren't allowed.");
});

test("row contents in `details` never reach the message", () => {
  const err = toSafeError(
    pgError(
      "23514",
      'new row for relation "transactions" violates check constraint "transactions_amount_max_chk"',
      "Failing row contains (a943e8d0-a28b, 22222222-2222, 20000000.00, income, other, salary note, 2026-11-22)."
    )
  );
  assert.ok(!/a943e8d0|22222222|20000000|salary note/.test(err.message));
});

test("other database error codes map to plain language", () => {
  assert.match(toSafeError(pgError("22003", "numeric field overflow")).message, /too large/i);
  assert.match(toSafeError(pgError("23502", 'null value in column "amount" violates not-null constraint')).message, /required/i);
  assert.match(toSafeError(pgError("42501", 'new row violates row-level security policy for table "transactions"')).message, /permission/i);
  assert.match(toSafeError(pgError("23503", "insert or update violates foreign key constraint")).message, /log in again/i);
  assert.match(toSafeError(pgError("23505", 'duplicate key value violates unique constraint "x"')).message, /already exists/i);
  assert.match(toSafeError(pgError("57014", "canceling statement due to statement timeout")).message, /too long/i);
});

test("an expired or invalid session is reported as such", () => {
  assert.equal(toSafeError(pgError("PGRST301", "JWT expired")).message, SESSION_EXPIRED);
  assert.equal(toSafeError(pgError("", "JWT expired")).message, SESSION_EXPIRED);
  assert.equal(toSafeError(pgError("PGRST303", "JWT invalid")).message, SESSION_EXPIRED);
});

test("network failures are recognised, in the shapes React Native produces", () => {
  for (const e of [
    new TypeError("Network request failed"),
    pgError("", "TypeError: Network request failed"),
    { name: "AuthRetryableFetchError", message: "fetch failed" },
    new Error("Failed to fetch"),
  ]) {
    assert.equal(toSafeError(e).message, NETWORK_ERROR);
  }
});

test("an error nobody anticipated becomes the fallback, and its text is not passed on", () => {
  const e = new Error('FATAL: password authentication failed for user "postgres" at 10.1.2.3:5432');
  const err = toSafeError(e);
  assert.equal(err.message, GENERIC_ERROR);
  assert.ok(!/postgres|10\.1\.2\.3|password/.test(err.message));
  // ...but it is kept for debugging.
  assert.equal(err.cause, e);
});

test("a custom fallback is used for unknown errors", () => {
  assert.equal(toSafeError(new Error("x"), "Couldn't load your transactions.").message, "Couldn't load your transactions.");
});

test("things that are not Error objects are handled", () => {
  for (const value of [null, undefined, "a string", 42, {}, [], Symbol.iterator]) {
    assert.equal(toSafeError(value as unknown).message, GENERIC_ERROR);
  }
});

test("an AppError passes through unchanged", () => {
  const original = new AppError("Already safe.", "custom");
  assert.equal(toSafeError(original), original);
});

// ── Edge Function errors ────────────────────────────────────

const httpError = (status: number, body: unknown) =>
  new FunctionsHttpError(
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status })
  );

test("the message our function sent is surfaced, not supabase-js's generic one", async () => {
  const err = await toSafeFunctionError(
    httpError(413, { error: "That image is too large. Try a smaller photo.", code: "payload_too_large" })
  );
  assert.equal(err.message, "That image is too large. Try a smaller photo.");
  assert.doesNotMatch(err.message, /non-2xx/i);
});

test("a 401 from our function reads as an expired session", async () => {
  const err = await toSafeFunctionError(httpError(401, { error: "Please log in to continue.", code: "missing_token" }));
  assert.equal(err.message, "Please log in to continue.");
});

test("a platform error with no `error` field falls back to the status", async () => {
  // e.g. the gateway rejecting a token before our code runs: {"code":401,"message":"Invalid JWT"}
  const err = await toSafeFunctionError(httpError(401, { code: 401, message: "Invalid JWT" }));
  assert.equal(err.message, SESSION_EXPIRED);
  assert.ok(!/JWT/.test(err.message));
});

test("a non-JSON error body falls back to the status", async () => {
  const err = await toSafeFunctionError(httpError(502, "<html>Bad gateway nginx/1.2.3</html>"));
  assert.equal(err.message, messageForStatus(502));
  assert.ok(!/nginx/.test(err.message));
});

test("an error message that is long or multi-line is not shown", async () => {
  for (const error of [
    "x".repeat(500),
    "Error: boom\n    at handler (/srv/app/index.ts:10:5)",
    "",
    { nested: "object" },
    42,
  ]) {
    const err = await toSafeFunctionError(httpError(500, { error }));
    assert.equal(err.message, messageForStatus(500));
  }
});

test("the response body is cloned, so the caller can still read it", async () => {
  const response = new Response(JSON.stringify({ error: "Nope." }), { status: 400 });
  await toSafeFunctionError(new FunctionsHttpError(response));
  assert.equal(response.bodyUsed, false);
});

test("a network failure calling the function is reported as such", async () => {
  const err = await toSafeFunctionError(new FunctionsFetchError(new TypeError("Network request failed")));
  assert.equal(err.message, NETWORK_ERROR);
});

test("a relay error is reported as the service being unavailable", async () => {
  const err = await toSafeFunctionError(new FunctionsRelayError(new Response("relay", { status: 502 })));
  assert.match(err.message, /temporarily unavailable/i);
});

test("an unknown error calling the function is generic", async () => {
  const err = await toSafeFunctionError(new Error("socket hang up"));
  assert.equal(err.message, GENERIC_ERROR);
});

// ── helpers ─────────────────────────────────────────────────

test("safeServerMessage accepts short single-line text only", () => {
  assert.equal(safeServerMessage("  Try again.  "), "Try again.");
  assert.equal(safeServerMessage(""), null);
  assert.equal(safeServerMessage("   "), null);
  assert.equal(safeServerMessage("a".repeat(201)), null);
  assert.equal(safeServerMessage("line1\nline2"), null);
  assert.equal(safeServerMessage("tab\there"), null);
  assert.equal(safeServerMessage(null), null);
  assert.equal(safeServerMessage({ message: "x" }), null);
});

test("every status has a sensible message", () => {
  for (const status of [400, 401, 403, 404, 413, 415, 429, 500, 502, 503, 504, 418]) {
    const m = messageForStatus(status);
    assert.ok(m.length > 5 && m.length < 100, `${status}: ${m}`);
    assert.ok(!/\d{3}|http|status code/i.test(m), `${status} should not expose the code: ${m}`);
  }
});
