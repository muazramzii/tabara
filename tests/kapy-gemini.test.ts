// The Gemini client: bounded, retried only when safe, honest about failure.
// Fake time and a fake network, so nothing here really waits.

import test from "node:test";
import assert from "node:assert/strict";
import { backoffMs, callGemini, DEFAULT_BASE_URL, ModelError, type CallOptions } from "../supabase/functions/_shared/kapy/gemini";

const cfg = { apiKey: "test-key-not-real", model: "gemini-test" };
const req = { system: "sys", contents: [{ role: "user", parts: [{ text: "hi" }] }], tools: [] };

const okBody = (parts: unknown[] = [{ text: "hello" }], extra: Record<string, unknown> = {}) => ({
  candidates: [{ content: { role: "model", parts }, finishReason: "STOP" }],
  usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, totalTokenCount: 120 },
  ...extra,
});
const respond = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

/**
 * AbortSignal.timeout() uses an unref'd timer in Node, so nothing keeps the loop
 * alive while a test waits for it. A running server always has the loop alive;
 * this stands in for that.
 */
async function withLoopAlive<T>(fn: () => Promise<T>): Promise<T> {
  const t = setInterval(() => {}, 20);
  try {
    return await fn();
  } finally {
    clearInterval(t);
  }
}

/** A fetch that plays back responses, and a clock that only moves when asked to sleep. */
function rig(script: (Response | Error | ((init: RequestInit) => Promise<Response>))[], over: Partial<CallOptions> = {}) {
  let clock = 1_000_000;
  const sleeps: number[] = [];
  const calls: { url: string; init: RequestInit }[] = [];
  let i = 0;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const step = script[Math.min(i++, script.length - 1)];
    if (typeof step === "function") return step(init);
    if (step instanceof Error) throw step;
    return step.clone();
  }) as unknown as typeof fetch;
  const opts: CallOptions = {
    fetch: fetchImpl,
    deadline: clock + 40_000,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    random: () => 0,
    ...over,
  };
  return { opts, calls, sleeps, advance: (ms: number) => (clock += ms) };
}

test("a good reply is returned with its token usage", async () => {
  const { opts } = rig([respond(okBody())]);
  const t = await callGemini(cfg, req, opts);
  assert.deepEqual(t.content, { role: "model", parts: [{ text: "hello" }] });
  assert.deepEqual(t.usage, { promptTokens: 100, outputTokens: 20, totalTokens: 120 });
  assert.equal(t.finishReason, "STOP");
});

test("the key travels in a header, never in the URL or the body", async () => {
  const { opts, calls } = rig([respond(okBody())]);
  await callGemini(cfg, req, opts);
  const { url, init } = calls[0];
  assert.equal(url, `${DEFAULT_BASE_URL}gemini-test:generateContent`);
  assert.ok(!url.includes("test-key-not-real"));
  assert.equal((init.headers as Record<string, string>)["x-goog-api-key"], "test-key-not-real");
  assert.ok(!String(init.body).includes("test-key-not-real"));
});

test("function-calling parts come back untouched (the API requires them echoed exactly)", async () => {
  const parts = [{ functionCall: { name: "get_financial_summary", args: { period: { kind: "this_month" } } }, thoughtSignature: "abc" }];
  const { opts } = rig([respond(okBody(parts))]);
  assert.deepEqual((await callGemini(cfg, req, opts)).content.parts, parts);
});

test("sampling is conservative by default", async () => {
  const { opts, calls } = rig([respond(okBody())]);
  await callGemini(cfg, req, opts);
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.generationConfig.temperature, 0.3);
  assert.equal(body.generationConfig.maxOutputTokens, 800);
});

// ── retry ───────────────────────────────────────────────────

test("a transient 503 is retried and the second attempt succeeds", async () => {
  const { opts, calls, sleeps } = rig([respond({}, 503), respond(okBody())]);
  const t = await callGemini(cfg, req, opts);
  assert.equal(t.content.parts[0].text, "hello");
  assert.equal(calls.length, 2);
  assert.deepEqual(sleeps, [400]);
});

test("backoff grows with each attempt, and has a ceiling", () => {
  assert.equal(backoffMs(0, () => 0, null), 400);
  assert.equal(backoffMs(1, () => 0, null), 800);
  assert.equal(backoffMs(2, () => 0, null), 1600);
  assert.equal(backoffMs(10, () => 0, null), 4000);
  assert.ok(backoffMs(0, () => 0.999, null) < 400 + 250);
});

test("a short Retry-After is honoured; a long one is not trusted", async () => {
  const short = rig([respond({}, 429, { "retry-after": "2" }), respond(okBody())]);
  await callGemini(cfg, req, short.opts);
  assert.deepEqual(short.sleeps, [2000]);
  const long = rig([respond({}, 429, { "retry-after": "3600" }), respond(okBody())]);
  await callGemini(cfg, req, long.opts);
  assert.deepEqual(long.sleeps, [400]);
});

test("every transient status is retried", async () => {
  for (const status of [429, 500, 502, 503, 504]) {
    const { opts, calls } = rig([respond({}, status), respond(okBody())]);
    await callGemini(cfg, req, opts);
    assert.equal(calls.length, 2, String(status));
  }
});

test("a network failure is retried", async () => {
  const { opts, calls } = rig([new TypeError("fetch failed"), respond(okBody())]);
  await callGemini(cfg, req, opts);
  assert.equal(calls.length, 2);
});

test("it gives up after the attempt limit and reports why", async () => {
  const { opts, calls } = rig([respond({}, 503)], { maxAttempts: 3 });
  await assert.rejects(callGemini(cfg, req, opts), (e: unknown) => e instanceof ModelError && e.kind === "unavailable" && e.status === 503);
  assert.equal(calls.length, 3);
});

test("rate limiting is reported as such", async () => {
  const { opts } = rig([respond({}, 429)], { maxAttempts: 2 });
  await assert.rejects(callGemini(cfg, req, opts), (e: unknown) => e instanceof ModelError && e.kind === "rate_limited");
});

test("errors that retrying cannot fix are not retried", async () => {
  for (const [status, kind] of [[400, "invalid_request"], [404, "invalid_request"], [401, "auth"], [403, "auth"], [418, "invalid_request"]] as const) {
    const { opts, calls } = rig([respond({ error: { message: "secret detail" } }, status)]);
    await assert.rejects(callGemini(cfg, req, opts), (e: unknown) => {
      assert.ok(e instanceof ModelError);
      assert.equal((e as ModelError).kind, kind, String(status));
      assert.ok(!(e as Error).message.includes("secret"));
      return true;
    });
    assert.equal(calls.length, 1, `${status} must not be retried`);
  }
});

// ── time ────────────────────────────────────────────────────

test("a stalled request is cut off by the per-attempt timeout", async () => {
  const hang = (init: RequestInit) =>
    new Promise<Response>((_, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "TimeoutError")));
    });
  const { opts, calls } = rig([hang, respond(okBody())], { attemptTimeoutMs: 30 });
  const t = await withLoopAlive(() => callGemini(cfg, req, opts));
  assert.equal(t.content.parts[0].text, "hello");
  assert.equal(calls.length, 2);
});

test("it never waits past the overall deadline", async () => {
  // 40s budget, but the clock says only 900ms remain: no backoff can fit.
  const r = rig([respond({}, 503)]);
  const opts = { ...r.opts, deadline: 1_000_000 + 900 };
  await assert.rejects(callGemini(cfg, req, opts), (e: unknown) => e instanceof ModelError);
  assert.deepEqual(r.sleeps, []);
  assert.equal(r.calls.length, 1);
});

test("an exhausted deadline fails as a timeout without calling the model", async () => {
  const r = rig([respond(okBody())]);
  await assert.rejects(callGemini(cfg, req, { ...r.opts, deadline: 1_000_000 }), (e: unknown) => e instanceof ModelError && e.kind === "timeout");
  assert.equal(r.calls.length, 0);
});

test("a caller's abort signal stops it, reported as a timeout", async () => {
  const ac = new AbortController();
  const hang = (init: RequestInit) =>
    new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
  const r = rig([hang], { signal: ac.signal });
  const p = callGemini(cfg, req, r.opts);
  ac.abort();
  await assert.rejects(p, (e: unknown) => e instanceof ModelError && e.kind === "timeout");
});

// ── what a reply can be ─────────────────────────────────────

test("a safety block is classified, not returned as text, and not retried", async () => {
  for (const body of [
    { promptFeedback: { blockReason: "SAFETY" } },
    { candidates: [{ finishReason: "SAFETY", content: { parts: [{ text: "partial" }] } }] },
    { candidates: [{ finishReason: "PROHIBITED_CONTENT" }] },
  ]) {
    const { opts, calls } = rig([respond(body)]);
    await assert.rejects(callGemini(cfg, req, opts), (e: unknown) => e instanceof ModelError && e.kind === "blocked");
    assert.equal(calls.length, 1);
  }
});

test("an empty reply is retried once, then reported", async () => {
  const empty = respond({ candidates: [{ content: { parts: [] }, finishReason: "STOP" }] });
  const ok = rig([empty, respond(okBody())]);
  assert.equal((await callGemini(cfg, req, ok.opts)).content.parts[0].text, "hello");
  assert.equal(ok.calls.length, 2);

  const bad = rig([empty]);
  await assert.rejects(callGemini(cfg, req, bad.opts), (e: unknown) => e instanceof ModelError && e.kind === "bad_response");
});

test("malformed bodies are reported as a bad response", async () => {
  for (const body of [{}, { candidates: [] }, { candidates: [{}] }, { candidates: "x" }, null, "text", []]) {
    const { opts } = rig([respond(body)]);
    await assert.rejects(callGemini(cfg, req, opts), (e: unknown) => e instanceof ModelError && e.kind === "bad_response");
  }
  const notJson = rig([new Response("<html>oops</html>", { status: 200 })]);
  await assert.rejects(callGemini(cfg, req, notJson.opts), (e: unknown) => e instanceof ModelError);
});

test("missing usage metadata is zero, not a crash", async () => {
  const { opts } = rig([respond({ candidates: [{ content: { parts: [{ text: "hi" }] } }] })]);
  assert.deepEqual((await callGemini(cfg, req, opts)).usage, { promptTokens: 0, outputTokens: 0, totalTokens: 0 });
});

test("model errors never carry the provider's message", async () => {
  const { opts } = rig([respond({ error: { status: "PERMISSION_DENIED", message: "API key test-key-not-real is invalid" } }, 403)]);
  await assert.rejects(callGemini(cfg, req, opts), (e: unknown) => {
    assert.ok(!(e as Error).message.includes("test-key-not-real"));
    assert.ok(!(e as Error).message.includes("PERMISSION"));
    return true;
  });
});
