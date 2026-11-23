// Per-user quotas: what is asked of the database function, and what happens
// when it says no, fails, or does not exist yet.

import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LIMITS, MYT_OFFSET_SECONDS, consumeQuota, limitsFromEnv } from "../supabase/functions/_shared/kapy/ratelimit";

type Reply = { data?: unknown; error?: unknown };
const rpc = (script: (args: Record<string, unknown>) => Reply) => {
  const calls: Record<string, unknown>[] = [];
  return {
    calls,
    client: {
      rpc: (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, ...args });
        return Promise.resolve({ data: null, error: null, ...script(args) });
      },
    },
  };
};
const allow = { data: { allowed: true, uses: 1, retry_after_seconds: 0 } };
const deny = (retry: number) => ({ data: { allowed: false, uses: 5, retry_after_seconds: retry } });

const limits = { perMinute: 5, perDay: 50 };

test("both windows are consumed, minute first, with the right sizes and the Malaysian day offset", async () => {
  const { client, calls } = rpc(() => allow);
  const r = await consumeQuota(client, "kapy", limits);
  assert.deepEqual(r, { allowed: true, unavailable: false });
  assert.deepEqual(calls.map((c) => [c.fn, c.p_kind, c.p_window_seconds, c.p_max, c.p_offset_seconds]), [
    ["ai_consume", "kapy", 60, 5, 0],
    ["ai_consume", "kapy", 86400, 50, MYT_OFFSET_SECONDS],
  ]);
  assert.equal(MYT_OFFSET_SECONDS, 28800);
});

test("no user is ever passed: the database takes it from the token", async () => {
  const { client, calls } = rpc(() => allow);
  await consumeQuota(client, "scan", limits);
  for (const c of calls) assert.deepEqual(Object.keys(c).sort(), ["fn", "p_kind", "p_max", "p_offset_seconds", "p_window_seconds"]);
});

test("over the minute limit: refused, with the wait, and the day allowance is not spent", async () => {
  const { client, calls } = rpc((a) => (a.p_window_seconds === 60 ? deny(42) : allow));
  const r = await consumeQuota(client, "kapy", limits);
  assert.deepEqual(r, { allowed: false, reason: "limit", window: "minute", retryAfterSec: 42 });
  assert.equal(calls.length, 1);
});

test("over the daily limit: refused", async () => {
  const { client } = rpc((a) => (a.p_window_seconds === 86400 ? deny(7200) : allow));
  assert.deepEqual(await consumeQuota(client, "kapy", limits), { allowed: false, reason: "limit", window: "day", retryAfterSec: 7200 });
});

test("a wait is always at least one second", async () => {
  const { client } = rpc(() => deny(0));
  const r = await consumeQuota(client, "kapy", limits);
  assert.equal(r.allowed, false);
  if (!r.allowed && r.reason === "limit") assert.ok(r.retryAfterSec >= 1);
});

test("the function not existing yet (migration pending) lets the request through, flagged", async () => {
  for (const code of ["PGRST202", "42883"]) {
    const { client } = rpc(() => ({ error: { code } }));
    assert.deepEqual(await consumeQuota(client, "kapy", limits), { allowed: true, unavailable: true }, code);
  }
});

test("any other failure refuses: unknown is not 'allowed'", async () => {
  for (const code of ["08006", "57014", "42501", "28000", "XX000", ""]) {
    const { client } = rpc(() => ({ error: { code } }));
    const r = await consumeQuota(client, "kapy", limits);
    assert.equal(r.allowed, false, code);
    if (!r.allowed) assert.equal(r.reason, "error");
  }
});

test("a malformed answer refuses", async () => {
  for (const data of [null, undefined, "yes", 1, [], {}, { allowed: "true" }, { allowed: null }]) {
    const { client } = rpc(() => ({ data }));
    assert.equal((await consumeQuota(client, "kapy", limits)).allowed, false, JSON.stringify(data));
  }
});

test("a failure on the day window refuses too", async () => {
  const { client } = rpc((a) => (a.p_window_seconds === 86400 ? { error: { code: "08006" } } : allow));
  assert.equal((await consumeQuota(client, "kapy", limits)).allowed, false);
});

test("each kind has its own defaults, and scanning is stricter than chatting", () => {
  assert.ok(DEFAULT_LIMITS.scan.perDay < DEFAULT_LIMITS.kapy.perDay);
  assert.ok(DEFAULT_LIMITS.kapy_confirm.perMinute >= DEFAULT_LIMITS.kapy.perMinute);
});

test("environment overrides are used when valid and ignored when not", () => {
  const env = (m: Record<string, string>) => (k: string) => m[k];
  assert.deepEqual(limitsFromEnv("kapy", env({ KAPY_RATE_PER_MINUTE: "3", KAPY_RATE_PER_DAY: "20" })), { perMinute: 3, perDay: 20 });
  assert.deepEqual(limitsFromEnv("scan", env({ SCAN_RATE_PER_DAY: "5" })), { perMinute: DEFAULT_LIMITS.scan.perMinute, perDay: 5 });
  assert.deepEqual(limitsFromEnv("kapy_confirm", env({ KAPY_CONFIRM_RATE_PER_MINUTE: "2" })).perMinute, 2);
  for (const bad of ["0", "-5", "1.5", "abc", "", "999999999", "NaN", "1e9"]) {
    assert.deepEqual(limitsFromEnv("kapy", env({ KAPY_RATE_PER_MINUTE: bad })), DEFAULT_LIMITS.kapy, bad);
  }
});
