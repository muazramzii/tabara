// Language handling: spelling normalisation, style detection, reply-language choice.

import test from "node:test";
import assert from "node:assert/strict";
import { conversationLanguage, detectLanguage, normalize } from "../supabase/functions/_shared/kapy/language";

test("informal spellings are expanded for lookup only", () => {
  assert.equal(normalize("Brp baki aku skrg"), "berapa baki aku sekarang");
  assert.equal(normalize("xde duit"), "tak ada duit");
  assert.equal(normalize("mcm mana nak jimat"), "macam mana nak jimat");
  assert.equal(normalize("tq kapy"), "thanks kapy");
  assert.equal(normalize("u r so kind"), "you are so kind");
});

test("elongated words and punctuation are tidied; numbers survive", () => {
  assert.equal(normalize("gilaaaa banyak!!!"), "gila banyak");
  assert.equal(normalize("RM 1,200.50 masuk."), "rm 1,200.50 masuk");
  assert.equal(normalize("50/30/20 rule?"), "50/30/20 rule");
  assert.equal(normalize("  Hai   Kapy  "), "hi kapy");
});

test("normalisation never throws and handles odd input", () => {
  for (const s of ["", "   ", "!!!", "🦫🦫", "\u0000\u0007", "a".repeat(10_000), "ﷺ ٣٤٥"]) {
    assert.doesNotThrow(() => normalize(s));
    assert.doesNotThrow(() => detectLanguage(s));
  }
});

test("clear Malay, English and Manglish are told apart", () => {
  assert.equal(detectLanguage("berapa baki aku sekarang").lang, "ms");
  assert.equal(detectLanguage("how much did I spend this month").lang, "en");
  assert.equal(detectLanguage("tolong check budget aku jap").lang, "manglish");
  assert.equal(detectLanguage("Can you check spending aku dekat food?").lang, "manglish");
});

test("a Manglish particle on its own marks code-switching", () => {
  assert.equal(detectLanguage("wei bro").lang, "manglish");
  assert.equal(detectLanguage("okay lah thanks").lang, "manglish");
});

test("English with a Malay loanword is still mostly English; Malay with an English term is still Malay", () => {
  assert.equal(detectLanguage("how much did I spend on food this month").lang, "en");
  assert.equal(detectLanguage("aku banyak sangat spend dekat makan ke").lang, "ms");
});

test("a message too short to judge is 'unknown', with no confidence", () => {
  for (const s of ["hmm", "?", "asdf", "123"]) {
    const d = detectLanguage(s);
    assert.equal(d.lang, "unknown", s);
    assert.equal(d.confidence, 0);
  }
});

test("more words mean more confidence", () => {
  assert.ok(
    detectLanguage("how much did I spend this month on food and groceries").confidence >
      detectLanguage("how much").confidence
  );
});

test("the reply language follows the recent conversation, newest weighing most", () => {
  assert.equal(conversationLanguage(["how much did I spend", "and last month?", "what about food"]), "en");
  assert.equal(conversationLanguage(["berapa baki aku", "bulan lepas pulak", "kalau transport pulak"]), "ms");
  // The person switches style: the reply follows the latest messages.
  assert.equal(conversationLanguage(["how much did I spend", "what about food", "berapa aku belanja kat transport"]), "ms");
});

test("with no usable evidence the reply language is English", () => {
  assert.equal(conversationLanguage([]), "en");
  assert.equal(conversationLanguage(["hmm", "?", "123"]), "en");
});

test("only the last three messages count", () => {
  const old = Array(10).fill("berapa baki aku sekarang");
  assert.equal(conversationLanguage([...old, "how much", "what is left", "show my spending"]), "en");
});
