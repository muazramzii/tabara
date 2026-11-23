// Caller authentication for Edge Functions (supabase/functions/_shared/auth.ts).
//
// The regression this guards: an endpoint that trusted `verify_jwt` alone would
// accept the project's anon key — a validly signed token that belongs to nobody.

import test from "node:test";
import assert from "node:assert/strict";
import {
  authenticate,
  extractBearerToken,
  type GetUser,
} from "../supabase/functions/_shared/auth";

const TOKEN = "eyJhbGciOi.eyJzdWIiOiJ1.c2lnbmF0dXJl";

const req = (headers: Record<string, string> = {}) =>
  new Request("https://example.test/fn", { method: "POST", headers });

const bearer = (t = TOKEN) => ({ authorization: `Bearer ${t}` });

const never: GetUser = async () => {
  throw new Error("getUser must not be called");
};

test("extractBearerToken accepts a well-formed bearer token", () => {
  assert.equal(extractBearerToken(`Bearer ${TOKEN}`), TOKEN);
  assert.equal(extractBearerToken(`bearer ${TOKEN}`), TOKEN);
});

test("extractBearerToken rejects anything that is not exactly a bearer JWT", () => {
  for (const header of [
    null,
    "",
    "Bearer",
    "Bearer ",
    `Basic ${TOKEN}`,
    TOKEN, // no scheme
    "Bearer not-a-jwt",
    "Bearer a.b", // two segments
    `Bearer ${TOKEN} extra`,
    `Bearer ${TOKEN}\nX-Injected: 1`,
    `Bearer ${"a".repeat(5000)}.bbbb.cccc`, // absurdly long
    "Bearer aaaa.bbbb.cc cc",
  ]) {
    assert.equal(extractBearerToken(header), null, `should reject: ${String(header).slice(0, 30)}`);
  }
});

test("a request with no Authorization header is a 401 and never reaches the Auth server", async () => {
  const result = await authenticate(req(), never);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.response.status, 401);
  assert.equal(result.response.headers.get("www-authenticate"), 'Bearer realm="tabara"');
  const body = await result.response.json();
  assert.equal(body.code, "missing_token");
});

test("a malformed token is a 401 and never reaches the Auth server", async () => {
  const result = await authenticate(req({ authorization: "Bearer not-a-jwt" }), never);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.response.status, 401);
  assert.equal((await result.response.json()).code, "malformed_token");
});

test("a token the Auth server rejects is a 401 (anon key, expired, revoked, deleted user)", async () => {
  for (const status of [400, 401, 403]) {
    const getUser: GetUser = async () => ({
      user: null,
      error: { name: "AuthApiError", status, message: "invalid claim: missing sub claim" },
    });
    const result = await authenticate(req(bearer()), getUser);
    assert.equal(result.ok, false, `status ${status}`);
    if (result.ok) return;
    assert.equal(result.response.status, 401);
    const body = await result.response.json();
    assert.equal(body.code, "invalid_token");
    // The Auth server's own wording must not be echoed back.
    assert.ok(!JSON.stringify(body).includes("sub claim"));
  }
});

test("a missing session is treated as unauthenticated, not as a server error", async () => {
  const getUser: GetUser = async () => ({
    user: null,
    error: { name: "AuthSessionMissingError", status: 400 },
  });
  const result = await authenticate(req(bearer()), getUser);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.response.status, 401);
});

test("an Auth outage fails closed with 503, not open and not 401", async () => {
  const thrown: GetUser = async () => {
    throw new Error("connect ECONNREFUSED 10.0.0.1:443");
  };
  const retryable: GetUser = async () => ({
    user: null,
    error: { name: "AuthRetryableFetchError", status: 0 },
  });
  const upstream5xx: GetUser = async () => ({
    user: null,
    error: { name: "AuthApiError", status: 502 },
  });

  for (const getUser of [thrown, retryable, upstream5xx]) {
    const result = await authenticate(req(bearer()), getUser);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.response.status, 503);
    const text = await result.response.text();
    assert.ok(!text.includes("ECONNREFUSED"), "internal error text must not leak");
    assert.equal(JSON.parse(text).code, "auth_unavailable");
  }
});

test("an Auth response with no user and no error is still rejected", async () => {
  const result = await authenticate(req(bearer()), async () => ({ user: null, error: null }));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.response.status, 401);
});

test("a user object without an id is rejected", async () => {
  const result = await authenticate(req(bearer()), async () => ({
    user: { id: "" },
    error: null,
  }));
  assert.equal(result.ok, false);
});

test("an anonymous session is refused with 403", async () => {
  const result = await authenticate(req(bearer()), async () => ({
    user: { id: "u-1", is_anonymous: true },
    error: null,
  }));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.response.status, 403);
  assert.equal((await result.response.json()).code, "anonymous_not_allowed");
});

test("a confirmed user is accepted and the exact token is what was verified", async () => {
  let seen = "";
  const result = await authenticate(req(bearer()), async (jwt) => {
    seen = jwt;
    return { user: { id: "user-123", is_anonymous: false }, error: null };
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.user.id, "user-123");
  assert.equal(result.token, TOKEN);
  assert.equal(seen, TOKEN);
});
