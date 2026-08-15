// The client-side mirror of the Supabase password policy. The server is the
// authority; these rules exist so the user sees what is wrong while typing
// rather than after submitting.

import test from "node:test";
import assert from "node:assert/strict";
import { isValidPassword, strength, validateUsername } from "../src/lib/password";

test("a password meeting every rule is accepted", () => {
  assert.equal(isValidPassword("Kapy2026!"), true);
  assert.equal(isValidPassword("Muaz@123"), true);
});

test("each missing rule fails on its own", () => {
  assert.equal(isValidPassword("kapy2026!"), false, "no uppercase");
  assert.equal(isValidPassword("KAPY2026!"), false, "no lowercase");
  assert.equal(isValidPassword("KapyKapy!"), false, "no digit");
  assert.equal(isValidPassword("Kapy2026"), false, "no symbol");
  assert.equal(isValidPassword("Kap2!"), false, "too short");
  assert.equal(isValidPassword(""), false);
});

test("strength runs from 0 to 1 and only reaches 1 when valid", () => {
  assert.equal(strength(""), 0);
  assert.equal(strength("Kapy2026!"), 1);
  assert.ok(strength("kapy") > 0 && strength("kapy") < 1);
});

test("ordinary names are accepted", () => {
  for (const name of ["Muaz", "Muaz Ramzi", "Ah Seng", "O'Brien", "Nur-Aisyah", "muaz.123"]) {
    assert.equal(validateUsername(name), null, `${name} should be allowed`);
  }
});

test("names in other scripts are accepted", () => {
  assert.equal(validateUsername("阿明"), null, "non-Latin letters are still letters");
});

test("names that would break the greeting are rejected", () => {
  assert.notEqual(validateUsername("M"), null, "too short");
  assert.notEqual(validateUsername("x".repeat(21)), null, "too long");
  assert.notEqual(validateUsername(""), null);
  assert.notEqual(validateUsername("   "), null, "whitespace only");
  assert.notEqual(validateUsername("<script>"), null, "markup rejected");
});

test("surrounding whitespace does not change the verdict", () => {
  assert.equal(validateUsername("  Muaz  "), null);
});
