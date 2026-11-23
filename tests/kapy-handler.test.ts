// Kapy's HTTP surface: authentication, authorisation, input limits, quotas,
// duplicate writes, and that nothing sensitive leaves in a response or a log.

import test from "node:test";
import assert from "node:assert/strict";
import { handleKapy, MAX_BODY_BYTES } from "../supabase/functions/kapy/handler";
import { ModelError } from "../supabase/functions/_shared/kapy/gemini";
import { assertSafeMetrics } from "../supabase/functions/_shared/kapy/telemetry";
import {
  ALICE, ALICE_TOKEN, BOB, BOB_TOKEN, callTools, chatRequest, ledgerDb, makeHandlerDeps, say, tokenFor, userSays,
} from "./fixtures/kapy-harness";
import { LEDGER_ROWS } from "./fixtures/kapy-ledger";
import { uuid } from "./fixtures/fake-supabase";

const json = async (res: Response) => (await res.json()) as any;
const THIS_MONTH = { period: { kind: "this_month" } };

// ── authentication ──────────────────────────────────────────

test("no token: 401, the model is never called, nothing is read", async () => {
  const h = makeHandlerDeps({ steps: [say("hi")] });
  const res = await handleKapy(chatRequest(userSays("hi"), null), h.deps);
  assert.equal(res.status, 401);
  assert.equal((await json(res)).code, "missing_token");
  assert.equal(h.model.calls, 0);
  assert.equal(h.clients.length, 0, "no database client may even be created");
});

test("a malformed token is 401 before reaching the Auth server", async () => {
  const h = makeHandlerDeps({ steps: [say("hi")] });
  for (const bad of ["not-a-jwt", "a.b", "Bearer x", "aaaa.bbbb"]) {
    const res = await handleKapy(chatRequest(userSays("hi"), bad), h.deps);
    assert.equal(res.status, 401, bad);
  }
  assert.equal(h.model.calls, 0);
});

test("the anon key, an expired token and a revoked token are all 401", async () => {
  const h = makeHandlerDeps({ steps: [say("hi")] });
  for (const t of [tokenFor("anon-key"), tokenFor("expired"), tokenFor("revoked-session")]) {
    const res = await handleKapy(chatRequest(userSays("hi"), t), h.deps);
    assert.equal(res.status, 401, t);
    assert.equal((await json(res)).code, "invalid_token");
  }
  assert.equal(h.model.calls, 0);
});

test("an Auth outage fails closed (503), not open", async () => {
  const h = makeHandlerDeps({ getUser: async () => { throw new Error("connect ECONNREFUSED 10.0.0.9"); }, steps: [say("hi")] });
  const res = await handleKapy(chatRequest(userSays("hi")), h.deps);
  assert.equal(res.status, 503);
  assert.ok(!(await res.text()).includes("ECONNREFUSED"));
  assert.equal(h.model.calls, 0);
});

test("methods other than POST are refused; preflight needs no token", async () => {
  const h = makeHandlerDeps();
  assert.equal((await handleKapy(new Request("https://x/", { method: "GET" }), h.deps)).status, 405);
  assert.equal((await handleKapy(new Request("https://x/", { method: "OPTIONS" }), h.deps)).status, 200);
});

// ── authorisation: one user's data, one user's rows ─────────

test("Alice's questions are answered from Alice's data only; Bob's never appears", async () => {
  const h = makeHandlerDeps({ steps: [callTools({ name: "get_financial_summary", args: THIS_MONTH }), say("November 2026: you spent RM 341.55.")] });
  const res = await handleKapy(chatRequest(userSays("how much did I spend this month")), h.deps);
  assert.equal(res.status, 200);
  const body = await json(res);
  assert.match(body.reply, /341\.55/);

  const everything = JSON.stringify(h.model.requests) + JSON.stringify(body);
  assert.ok(!/987,?654|555,?555|BOB-SECRET|777,?777/.test(everything), "Bob's data reached the model or the response");
  assert.deepEqual([...new Set(h.clients.map((c) => c.user))], [ALICE]);
});

test("the same question from Bob returns Bob's data, not Alice's", async () => {
  const h = makeHandlerDeps({ steps: [callTools({ name: "get_financial_summary", args: THIS_MONTH }), say("November 2026: you spent RM 987,654.32.")] });
  const res = await handleKapy(chatRequest(userSays("how much did I spend this month"), BOB_TOKEN), h.deps);
  const everything = JSON.stringify(h.model.requests);
  assert.match(everything, /987,654\.32/);
  assert.ok(!/341\.55/.test(everything));
  assert.equal(res.status, 200);
});

test("a user id in the request body is ignored: it cannot select whose data is read", async () => {
  const h = makeHandlerDeps({ steps: [callTools({ name: "get_financial_summary", args: { ...THIS_MONTH, user_id: BOB } }), say("ok")] });
  const res = await handleKapy(
    chatRequest({ ...userSays("how much did I spend"), user_id: BOB, userId: BOB, uid: BOB, context: { user_id: BOB } }),
    h.deps
  );
  assert.equal(res.status, 200);
  assert.ok(!/987,?654|BOB-SECRET/.test(JSON.stringify(h.model.requests)));
  assert.deepEqual([...new Set(h.clients.map((c) => c.user))], [ALICE]);
});

test("a confirmation cannot write for someone else, whatever it claims", async () => {
  const h = makeHandlerDeps();
  const res = await handleKapy(
    chatRequest({ action: "confirm_transaction", proposal: { requestId: uuid(1), amount: 5, type: "expense", category: "food", user_id: BOB, userId: BOB } }),
    h.deps
  );
  assert.equal(res.status, 200);
  const saved = h.db.transactions.filter((t) => t.client_request_id === uuid(1));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].user_id, ALICE);
  assert.ok(!h.db.transactions.some((t) => t.user_id === BOB && t.client_request_id));
});

// ── confirmation ────────────────────────────────────────────

const proposal = (over: Record<string, unknown> = {}) => ({ requestId: uuid(7), amount: 12.5, type: "expense", category: "food", date: "2026-11-22", note: "Mamak", ...over });
const confirm = (p: unknown, token: string | null = ALICE_TOKEN) => chatRequest({ action: "confirm_transaction", proposal: p }, token);

test("confirming saves the transaction and returns what the database stored", async () => {
  const h = makeHandlerDeps();
  const before = h.db.transactions.length;
  const res = await handleKapy(confirm(proposal()), h.deps);
  assert.equal(res.status, 200);
  const body = await json(res);
  assert.equal(body.status, "recorded");
  assert.equal(body.transaction.formatted, "RM 12.50");
  assert.equal(h.db.transactions.length, before + 1);
});

test("MISBEHAVIOUR (client): two taps on Confirm save one transaction", async () => {
  const h = makeHandlerDeps();
  const before = h.db.transactions.length;
  const a = await json(await handleKapy(confirm(proposal()), h.deps));
  const b = await json(await handleKapy(confirm(proposal()), h.deps));
  assert.equal(a.status, "recorded");
  assert.equal(b.status, "already_recorded");
  assert.equal(h.db.transactions.length, before + 1);
});

test("MISBEHAVIOUR (client): twenty simultaneous confirmations save exactly one", async () => {
  const h = makeHandlerDeps();
  const before = h.db.transactions.length;
  const results = await Promise.all(Array.from({ length: 20 }, () => handleKapy(confirm(proposal()), h.deps)));
  const bodies = await Promise.all(results.map(json));
  assert.ok(results.every((r) => r.status === 200));
  assert.equal(bodies.filter((b) => b.status === "recorded").length, 1);
  assert.equal(h.db.transactions.length, before + 1);
});

test("invalid confirmations are 400 and never touch the database", async () => {
  const h = makeHandlerDeps();
  const before = h.db.transactions.length;
  const bad: unknown[] = [
    proposal({ amount: -5 }), proposal({ amount: 0 }), proposal({ amount: "x" }), proposal({ type: "transfer" }),
    proposal({ category: "nope" }), proposal({ requestId: "abc" }), proposal({ date: "2026-02-31" }),
    null, "x", 5, [], undefined,
  ];
  for (const p of bad) {
    const res = await handleKapy(confirm(p), h.deps);
    assert.equal(res.status, 400, JSON.stringify(p));
    assert.equal((await json(res)).code, "invalid_transaction");
  }
  assert.equal(h.db.transactions.length, before);
});

test("a database failure while saving is a clear 'not saved' with no database detail", async () => {
  for (const [code, status] of [["57014", 503], ["23514", 422], ["42501", 403]] as const) {
    const h = makeHandlerDeps({ fake: { insertFail: code } });
    const res = await handleKapy(confirm(proposal()), h.deps);
    assert.equal(res.status, status, code);
    const text = await res.text();
    assert.ok(!/secret|12345|boom/.test(text), text);
  }
});

test("confirmation needs authentication like everything else", async () => {
  const h = makeHandlerDeps();
  const before = h.db.transactions.length;
  assert.equal((await handleKapy(confirm(proposal(), null), h.deps)).status, 401);
  assert.equal((await handleKapy(confirm(proposal(), tokenFor("anon-key")), h.deps)).status, 401);
  assert.equal(h.db.transactions.length, before);
});

// ── the chat flow with a proposal ───────────────────────────

test("chat → proposal → confirm: the whole path, and the model alone saved nothing", async () => {
  const h = makeHandlerDeps({ steps: [callTools({ name: "propose_transaction", args: { amount: 15, type: "expense", category: "food", note: "Nasi lemak" } }), say("Done, saved!")] });
  const before = h.db.transactions.length;
  const chatRes = await json(await handleKapy(chatRequest(userSays("tadi aku beli nasi lemak rm15")), h.deps));
  assert.equal(h.db.transactions.length, before, "the chat step must not write");
  assert.equal(chatRes.proposal.formatted, "RM 15.00");
  assert.match(chatRes.reply, /Belum disimpan|isn't saved/);

  const confirmRes = await json(await handleKapy(confirm(chatRes.proposal), h.deps));
  assert.equal(confirmRes.status, "recorded");
  assert.equal(h.db.transactions.length, before + 1);
});

test("an older app (no protocol) gets answers but no recording", async () => {
  const h = makeHandlerDeps({ steps: [callTools({ name: "propose_transaction", args: { amount: 15, type: "expense", category: "food" } }), say("Please update the app.")] });
  const before = h.db.transactions.length;
  const res = await handleKapy(chatRequest({ history: [{ role: "user", text: "I spent RM15 on lunch" }], financialSummary: "stale", categories: ["food"] }), h.deps);
  const body = await json(res);
  assert.equal(body.proposal, null);
  assert.equal(h.db.transactions.length, before);
  assert.ok(typeof body.reply === "string" && body.reply.length > 0); // the old client reads only `reply`
  assert.ok(!JSON.stringify(h.model.requests[0].tools).includes("propose_transaction"));
});

test("a stale client summary and category list are ignored: the server reads the truth itself", async () => {
  const h = makeHandlerDeps({ steps: [callTools({ name: "get_financial_summary", args: THIS_MONTH }), say("RM 341.55")] });
  await handleKapy(chatRequest({ ...userSays("how much did I spend"), financialSummary: "Spent so far: RM 1.00", categories: ["x"] }), h.deps);
  assert.ok(!JSON.stringify(h.model.requests).includes("RM 1.00"));
});

// ── input limits ────────────────────────────────────────────

test("malformed requests are rejected with the right status", async () => {
  const h = makeHandlerDeps({ steps: [say("x")] });
  const cases: [string, Request, number][] = [
    ["wrong content type", new Request("https://x/", { method: "POST", headers: { authorization: `Bearer ${ALICE_TOKEN}`, "content-type": "text/plain" }, body: "{}" }), 415],
    ["invalid JSON", new Request("https://x/", { method: "POST", headers: { authorization: `Bearer ${ALICE_TOKEN}`, "content-type": "application/json" }, body: "{oops" }), 400],
    ["JSON array", new Request("https://x/", { method: "POST", headers: { authorization: `Bearer ${ALICE_TOKEN}`, "content-type": "application/json" }, body: "[]" }), 400],
    ["unknown action", chatRequest({ action: "drop_database" }), 400],
    ["no history", chatRequest({ protocol: 2 }), 400],
    ["history not an array", chatRequest({ history: "hi", protocol: 2 }), 400],
    ["empty history", chatRequest({ history: [], protocol: 2 }), 400],
    ["only the model spoke", chatRequest({ history: [{ role: "model", text: "hi" }], protocol: 2 }), 400],
    ["blank message", chatRequest({ history: [{ role: "user", text: "   " }], protocol: 2 }), 400],
  ];
  for (const [label, req, status] of cases) assert.equal((await handleKapy(req, h.deps)).status, status, label);
  assert.equal(h.model.calls, 0);
});

test("an oversized body is 413 before it is parsed", async () => {
  const h = makeHandlerDeps({ steps: [say("x")] });
  const huge = "x".repeat(MAX_BODY_BYTES + 1000);
  const res = await handleKapy(chatRequest({ history: [{ role: "user", text: huge }] }), h.deps);
  assert.equal(res.status, 413);
  assert.equal(h.model.calls, 0);
});

test("a very long message is trimmed, not rejected, and never reaches the model whole", async () => {
  const h = makeHandlerDeps({ steps: [say("ok")] });
  const res = await handleKapy(chatRequest({ history: [{ role: "user", text: "a".repeat(20_000) }], protocol: 2 }), h.deps);
  assert.equal(res.status, 200);
  const sent = h.model.requests[0].contents[0].parts[0].text as string;
  assert.ok(sent.length <= 1500);
});

test("a hundred history items are trimmed to the most recent few", async () => {
  const h = makeHandlerDeps({ steps: [say("ok")] });
  const history = Array.from({ length: 100 }, (_, i) => ({ role: i % 2 ? "model" : "user", text: `m${i}` })).concat([{ role: "user", text: "latest" }]);
  await handleKapy(chatRequest({ history, protocol: 2 }), h.deps);
  assert.ok(h.model.requests[0].contents.length <= 12);
  assert.equal(h.model.requests[0].contents.at(-1)!.parts[0].text, "latest");
});

test("a tampered context is ignored, not trusted", async () => {
  const h = makeHandlerDeps({ steps: [say("ok")] });
  const res = await handleKapy(chatRequest({ ...userSays("hi"), context: { v: 1, at: 1, turn: 99, intent: "rm -rf", period: { kind: "forever" }, category: "x" } }), h.deps);
  assert.equal(res.status, 200);
});

// ── quotas ──────────────────────────────────────────────────

test("MISBEHAVIOUR (client): over the per-minute limit — 429 with Retry-After, and no model spend", async () => {
  const h = makeHandlerDeps({
    steps: [say("x")],
    quota: { respond: (_k, win) => ({ data: { allowed: win !== 60, uses: 10, retry_after_seconds: 42 }, error: null }) },
  });
  const res = await handleKapy(chatRequest(userSays("hi")), h.deps);
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("retry-after"), "42");
  const body = await json(res);
  assert.equal(body.code, "rate_limited");
  assert.equal(body.retryAfterSec, 42);
  assert.equal(h.model.calls, 0);
});

test("over the daily limit is also 429, in the user's language", async () => {
  const h = makeHandlerDeps({
    steps: [say("x")],
    quota: { respond: (_k, win) => ({ data: { allowed: win !== 86400, uses: 150, retry_after_seconds: 3600 }, error: null }) },
  });
  const res = await handleKapy(chatRequest(userSays("berapa baki aku")), h.deps);
  assert.equal(res.status, 429);
  assert.match((await json(res)).error, /esok/);
});

test("the quota is counted with the caller's own token and the right windows", async () => {
  const h = makeHandlerDeps({ steps: [say("ok")] });
  await handleKapy(chatRequest(userSays("hi")), h.deps);
  const calls = h.rpcCalls.args.filter((a) => a.fn === "ai_consume");
  assert.deepEqual(calls.map((c) => [c.p_kind, c.p_window_seconds]), [["kapy", 60], ["kapy", 86400]]);
  assert.equal(calls[1].p_offset_seconds, 28800); // the day resets at Malaysian midnight
  assert.ok(calls.every((c) => !("p_user" in c) && !("user_id" in c)), "no user is ever passed to the quota");
});

test("confirmations have their own, separate allowance", async () => {
  const h = makeHandlerDeps();
  await handleKapy(confirm(proposal()), h.deps);
  assert.ok(h.rpcCalls.args.every((a) => a.p_kind === "kapy_confirm"));
});

test("the quota service failing refuses the request rather than running it unmetered", async () => {
  const h = makeHandlerDeps({ steps: [say("x")], quota: { respond: () => ({ data: null, error: { code: "08006" } }) } });
  const res = await handleKapy(chatRequest(userSays("hi")), h.deps);
  assert.equal(res.status, 503);
  assert.equal(h.model.calls, 0);
});

test("a migration that has not been applied yet does not take Kapy down", async () => {
  const h = makeHandlerDeps({ steps: [say("hello")], quota: { respond: () => ({ data: null, error: { code: "PGRST202" } }) } });
  const res = await handleKapy(chatRequest(userSays("hi")), h.deps);
  assert.equal(res.status, 200);
  assert.ok(h.logs.some((l) => l.includes("kapy.quota_unavailable")));
});

test("limits can be tuned by environment, within sane bounds", async () => {
  const h = makeHandlerDeps({ steps: [say("ok")], env: { KAPY_RATE_PER_MINUTE: "3", KAPY_RATE_PER_DAY: "not-a-number" } });
  await handleKapy(chatRequest(userSays("hi")), h.deps);
  const calls = h.rpcCalls.args;
  assert.equal(calls[0].p_max, 3);
  assert.equal(calls[1].p_max, 150); // the invalid override fell back to the default
});

// ── model failures ──────────────────────────────────────────

test("model failures become appropriate statuses with generic text", async () => {
  const table: [ModelError["kind"], number, string][] = [
    ["timeout", 504, "model_timeout"],
    ["unavailable", 503, "model_unavailable"],
    ["rate_limited", 503, "model_unavailable"],
    ["invalid_request", 502, "model_failed"],
    ["bad_response", 502, "model_failed"],
    ["auth", 503, "not_configured"],
  ];
  for (const [kind, status, code] of table) {
    const h = makeHandlerDeps({ steps: [new ModelError(kind, 500)] });
    const res = await handleKapy(chatRequest(userSays("hi")), h.deps);
    assert.equal(res.status, status, kind);
    const body = await json(res);
    assert.equal(body.code, code, kind);
    assert.ok(!/gemini|api key|test-key|model_error/i.test(JSON.stringify(body)), JSON.stringify(body));
  }
});

test("a blocked reply is answered politely with 200, not as an error", async () => {
  const h = makeHandlerDeps({ steps: [new ModelError("blocked")] });
  const res = await handleKapy(chatRequest(userSays("something")), h.deps);
  assert.equal(res.status, 200);
  assert.match((await json(res)).reply, /can't help/i);
});

test("an unexpected exception is a generic 500 with no message", async () => {
  const h = makeHandlerDeps({ steps: [new Error("TypeError: cannot read secret_column of /srv/app/handler.ts:99")] });
  const res = await handleKapy(chatRequest(userSays("hi")), h.deps);
  assert.equal(res.status, 500);
  const text = await res.text();
  assert.ok(!/secret_column|handler\.ts|TypeError/.test(text), text);
  assert.ok(!h.logs.join("\n").includes("secret_column"), "the exception message must not be logged either");
});

test("a missing model key is a generic 503 and the secret's name is never mentioned", async () => {
  const h = makeHandlerDeps({ geminiApiKey: undefined, steps: [say("x")] });
  const res = await handleKapy(chatRequest(userSays("hi")), h.deps);
  assert.equal(res.status, 503);
  assert.ok(!/gemini|api_key|secret/i.test(await res.text()));
  assert.equal(h.model.calls, 0);
});

test("authentication is checked before the key's presence is revealed", async () => {
  const h = makeHandlerDeps({ geminiApiKey: undefined });
  assert.equal((await handleKapy(chatRequest(userSays("hi"), null), h.deps)).status, 401);
});

test("the API key never appears in a response or a log", async () => {
  const h = makeHandlerDeps({ steps: [say("hi"), new ModelError("auth", 403)] });
  const outputs: string[] = [];
  outputs.push(await (await handleKapy(chatRequest(userSays("hi")), h.deps)).text());
  outputs.push(await (await handleKapy(chatRequest(userSays("hi")), h.deps)).text());
  outputs.push(await (await handleKapy(chatRequest(userSays("hi"), null), h.deps)).text());
  assert.ok(![...outputs, ...h.logs].join("\n").includes("test-key-not-real"));
});

// ── logs ────────────────────────────────────────────────────

test("every log line is structured, and none contains what the person said or spent", async () => {
  const h = makeHandlerDeps({
    steps: [callTools({ name: "get_financial_summary", args: THIS_MONTH }), say("November 2026: you spent RM 341.55 at Kopitiam Ah Seng.")],
  });
  await handleKapy(chatRequest(userSays("berapa aku belanja kat Kopitiam Ah Seng rahsia bulan ni")), h.deps);
  await handleKapy(confirm(proposal({ note: "Rahsia Besar Punya Nota" })), h.deps);
  assert.ok(h.logs.length >= 2);
  for (const line of h.logs) {
    const parsed = JSON.parse(line);
    assert.doesNotThrow(() => assertSafeMetrics(parsed), line);
    assert.ok(!/Kopitiam|rahsia|Rahsia|Ah Seng|341\.55|12\.50|Mamak/i.test(line), line);
    assert.ok(!line.includes(ALICE) && !line.includes(ALICE_TOKEN), "no user id or token in logs");
  }
  const request = JSON.parse(h.logs.find((l) => l.includes('"kapy.request"'))!);
  assert.equal(request.outcome, "ok");
  assert.equal(request.tokens.total, 300);
  assert.equal(request.toolCalls.get_financial_summary.ok, 1);
});

test("rate-limit and failure events are logged as counts and enums only", async () => {
  const h = makeHandlerDeps({ quota: { respond: (_k, win) => ({ data: { allowed: win !== 60, uses: 10, retry_after_seconds: 5 }, error: null }) } });
  await handleKapy(chatRequest(userSays("hi")), h.deps);
  await handleKapy(chatRequest(userSays("hi"), null), h.deps);
  for (const line of h.logs) assert.doesNotThrow(() => assertSafeMetrics(JSON.parse(line)), line);
  assert.ok(h.logs.some((l) => l.includes("kapy.rate_limited")));
  assert.ok(h.logs.some((l) => l.includes("kapy.auth_failed")));
});

test("the ledger fixture is intact", () => {
  assert.ok(LEDGER_ROWS.length > 10 && ledgerDb().transactions.some((t) => t.user_id === BOB));
});
