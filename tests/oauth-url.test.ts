// OAuth redirect handling (src/lib/oauth-url.ts).
//
// These checks sit between "a URL opened our app" and "sign this person in".

import test from "node:test";
import assert from "node:assert/strict";
import {
  isUserCancellation,
  matchesRedirect,
  parseAuthCallback,
} from "../src/lib/oauth-url";

const EXPECTED = "tabara://auth-callback";
const CODE = "3f2b8c1e-9d4a-4e6b-8a57-0c1d2e3f4a5b";

// ── matchesRedirect ─────────────────────────────────────────

test("the exact redirect URL matches, with or without a query or fragment", () => {
  assert.equal(matchesRedirect("tabara://auth-callback", EXPECTED), true);
  assert.equal(matchesRedirect(`tabara://auth-callback?code=${CODE}`, EXPECTED), true);
  assert.equal(matchesRedirect("tabara://auth-callback#access_token=x", EXPECTED), true);
  assert.equal(matchesRedirect("tabara://auth-callback/", EXPECTED), true);
  assert.equal(matchesRedirect("TABARA://auth-callback", EXPECTED), true);
});

test("Expo Go's development redirect matches itself", () => {
  const dev = "exp://192.168.1.20:8081/--/auth-callback";
  assert.equal(matchesRedirect(`${dev}?code=${CODE}`, dev), true);
  assert.equal(matchesRedirect("exp://192.168.1.99:8081/--/auth-callback", dev), false);
});

test("URLs that merely START with the redirect URL do not match", () => {
  // expo-web-browser on Android accepts these; this check must not.
  for (const url of [
    "tabara://auth-callback.evil/x",
    "tabara://auth-callbackX",
    "tabara://auth-callback/extra",
    "tabara://auth-callback/../other",
    "tabara://auth-callback@evil.example",
    "tabara://auth-callback:8080",
  ]) {
    assert.equal(matchesRedirect(url, EXPECTED), false, url);
  }
});

test("a different scheme or host does not match", () => {
  for (const url of [
    "evil://auth-callback",
    "https://auth-callback",
    "tabara://other-callback",
    "tabara://",
    "tabara:auth-callback",
    "",
    "not a url",
  ]) {
    assert.equal(matchesRedirect(url, EXPECTED), false, url);
  }
});

// ── parseAuthCallback ───────────────────────────────────────

test("a PKCE callback yields the code", () => {
  const p = parseAuthCallback(`tabara://auth-callback?code=${CODE}`);
  assert.deepEqual(p, { code: CODE, hasTokens: false, error: null });
});

test("the implicit-flow shape is recognised as tokens and yields no code", () => {
  const p = parseAuthCallback("tabara://auth-callback#access_token=AAA.BBB.CCC&refresh_token=rrr&token_type=bearer");
  assert.equal(p.hasTokens, true);
  assert.equal(p.code, null);
});

test("either token field alone marks the callback as token-bearing", () => {
  assert.equal(parseAuthCallback("tabara://auth-callback?access_token=x").hasTokens, true);
  assert.equal(parseAuthCallback("tabara://auth-callback#refresh_token=x").hasTokens, true);
});

test("a code alongside injected tokens is still flagged as token-bearing", () => {
  const p = parseAuthCallback(`tabara://auth-callback?code=${CODE}#access_token=AAA.BBB.CCC&refresh_token=r`);
  assert.equal(p.hasTokens, true);
  assert.equal(p.code, CODE);
});

test("token values are never returned", () => {
  const p = parseAuthCallback("tabara://auth-callback#access_token=SECRET.TOKEN.VALUE&refresh_token=SECRETREFRESH");
  assert.ok(!JSON.stringify(p).includes("SECRET"));
});

test("codes with unexpected characters or length are discarded", () => {
  for (const code of [
    "short",
    "a".repeat(513),
    "has space in it",
    "<script>alert(1)</script>",
    "abc;DROP TABLE users",
    "../../etc/passwd/xx",
    "%0d%0aX-Injected:1",
    "",
  ]) {
    const p = parseAuthCallback(`tabara://auth-callback?code=${encodeURIComponent(code)}`);
    assert.equal(p.code, null, code);
  }
});

test("the provider's error is kept as a short code, never its free-text description", () => {
  const p = parseAuthCallback(
    "tabara://auth-callback?error=server_error&error_description=" +
      encodeURIComponent("Database error saving new user: relation \"public.profiles\" violates ...")
  );
  assert.equal(p.error, "server_error");
  assert.ok(!JSON.stringify(p).includes("Database"));
});

test("an overlong error value is truncated", () => {
  const p = parseAuthCallback(`tabara://auth-callback?error=${"e".repeat(500)}`);
  assert.equal(p.error?.length, 64);
});

test("errors can arrive in the fragment too", () => {
  assert.equal(parseAuthCallback("tabara://auth-callback#error=access_denied").error, "access_denied");
});

test("when the query and fragment disagree, the query wins", () => {
  const p = parseAuthCallback(`tabara://auth-callback?code=${CODE}#code=11111111-aaaa-bbbb-cccc-222222222222`);
  assert.equal(p.code, CODE);
});

test("empty and malformed URLs do not throw", () => {
  for (const url of ["", "tabara://auth-callback", "tabara://auth-callback?", "tabara://auth-callback#", "?code", "%%%%", "tabara://auth-callback?code=%E0%A4%A"]) {
    assert.doesNotThrow(() => parseAuthCallback(url), url);
  }
  assert.deepEqual(parseAuthCallback(""), { code: null, hasTokens: false, error: null });
});

// ── cancellation ────────────────────────────────────────────

test("only access_denied counts as the person backing out", () => {
  assert.equal(isUserCancellation("access_denied"), true);
  assert.equal(isUserCancellation("server_error"), false);
  assert.equal(isUserCancellation("temporarily_unavailable"), false);
  assert.equal(isUserCancellation(null), false);
});
