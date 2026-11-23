// The financial knowledge base: it must find the right passage in each language,
// find nothing when it has nothing, and — above all — contain no invented
// policy, rate or amount.

import test from "node:test";
import assert from "node:assert/strict";
import { KNOWLEDGE, MIN_KNOWLEDGE_SCORE, searchKnowledge } from "../supabase/functions/_shared/kapy/knowledge";

const top = (q: string, lang: "en" | "ms" | "manglish" = "en") => searchKnowledge(q, lang)[0]?.id;

// ── retrieval ───────────────────────────────────────────────

test("the right passage is found in English", () => {
  assert.equal(top("what is an emergency fund"), "emergency-fund");
  assert.equal(top("explain the 50/30/20 rule"), "budget-50-30-20");
  assert.equal(top("how does ptptn work"), "ptptn");
  assert.equal(top("what is epf"), "epf-kwsp");
  assert.equal(top("tell me about compound interest"), "compound-interest");
  assert.equal(top("how do I deal with debt"), "debt-basics");
});

test("the right passage is found in Malay", () => {
  assert.equal(top("apa itu dana kecemasan", "ms"), "emergency-fund");
  assert.equal(top("apa itu kwsp", "ms"), "epf-kwsp");
  assert.equal(top("macam mana nak bayar ptptn", "ms"), "ptptn");
  assert.equal(top("apa maksud keperluan dan kehendak", "ms"), "needs-vs-wants");
  assert.equal(top("zakat atas simpanan", "ms"), "zakat-awareness");
});

test("the right passage is found in Manglish and with texting spelling", () => {
  assert.equal(top("bagi tau aku what is ptptn lah", "manglish"), "ptptn");
  assert.equal(top("eh dana kecemasan tu apa", "manglish"), "emergency-fund");
  assert.equal(top("how to jimat cermat", "manglish"), "reduce-spending");
});

test("the passage comes back in the person's language", () => {
  assert.match(searchKnowledge("emergency fund", "en")[0].text, /emergency fund is money set aside/i);
  assert.match(searchKnowledge("emergency fund", "ms")[0].text, /Dana kecemasan ialah/);
  assert.match(searchKnowledge("emergency fund", "manglish")[0].text, /Dana kecemasan ialah/);
});

test("a question it has nothing for returns nothing, rather than the nearest guess", () => {
  for (const q of ["what is the weather today", "best nasi lemak in KL", "what's my balance", "asdf qwerty", "", "   ", "the", "bitcoin price prediction tomorrow"]) {
    assert.deepEqual(searchKnowledge(q), [], q);
  }
});

test("a single stray word is not enough", () => {
  assert.deepEqual(searchKnowledge("my fund"), []);
  assert.ok(MIN_KNOWLEDGE_SCORE >= 2);
});

test("results are capped and ordered by relevance", () => {
  const hits = searchKnowledge("ptptn loan education debt hutang pinjaman", "en", 3);
  assert.ok(hits.length >= 1 && hits.length <= 3);
  for (let i = 1; i < hits.length; i++) assert.ok(hits[i - 1].score >= hits[i].score);
  assert.equal(searchKnowledge("ptptn loan debt", "en", 1).length, 1);
  assert.ok(searchKnowledge("ptptn loan debt", "en", 99).length <= 3);
});

test("searching is deterministic", () => {
  assert.deepEqual(searchKnowledge("what is an emergency fund"), searchKnowledge("what is an emergency fund"));
});

// ── content: nothing invented ───────────────────────────────

test("every entry is complete, bilingual, and marked as not yet reviewed by a person", () => {
  const ids = new Set<string>();
  for (const e of KNOWLEDGE) {
    assert.ok(!ids.has(e.id), `duplicate id ${e.id}`);
    ids.add(e.id);
    assert.ok(e.topics.length >= 3, e.id);
    for (const lang of ["en", "ms"] as const) {
      assert.ok(e.title[lang].length > 3, `${e.id} title ${lang}`);
      assert.ok(e.body[lang].length > 80 && e.body[lang].length < 900, `${e.id} body ${lang}: ${e.body[lang].length}`);
    }
    assert.equal(e.review, "unreviewed", `${e.id}: an entry may only be marked reviewed by a person who reviewed it`);
  }
  assert.ok(KNOWLEDGE.length >= 12);
});

test("no entry states an amount of money", () => {
  for (const e of KNOWLEDGE) {
    for (const lang of ["en", "ms"] as const) {
      assert.ok(!/\bRM\s?\d|\d\s?ringgit|\bMYR\b/i.test(e.body[lang]), `${e.id}/${lang}`);
    }
  }
});

test("the only percentages are the 50/30/20 rule's own", () => {
  for (const e of KNOWLEDGE) {
    for (const lang of ["en", "ms"] as const) {
      const pct = e.body[lang].match(/\d+(\.\d+)?\s?%/g) ?? [];
      if (e.id === "budget-50-30-20") assert.deepEqual(pct.map((p) => p.replace(/\s/g, "")).sort(), ["20%", "30%", "50%"], lang);
      else assert.deepEqual(pct, [], `${e.id}/${lang} states a percentage`);
    }
  }
});

test("every number that appears is declared, so it can be grounded; none is a rate, date or fee", () => {
  for (const e of KNOWLEDGE) {
    for (const lang of ["en", "ms"] as const) {
      const nums = (e.body[lang].match(/\b\d+(?:\.\d+)?\b/g) ?? []).map(Number);
      for (const n of nums) assert.ok((e.figures ?? []).includes(n), `${e.id}/${lang}: undeclared number ${n}`);
    }
  }
});

test("no entry makes a promise, a guarantee, or states a deadline or eligibility rule", () => {
  const banned = /\bguarantee[sd]?\b|\bpromise[sd]?\b|\bdijamin\b|\bpasti untung\b|\bdeadline\b|\btarikh akhir\b|\bmust pay by\b|\beligible if\b|\bboleh layak jika\b|per cent|\bper annum\b|\bp\.a\b|\bunjuran pulangan\b/i;
  for (const e of KNOWLEDGE) for (const lang of ["en", "ms"] as const) {
    // "Never promise returns"-style warnings are allowed; positive claims are not.
    const text = e.body[lang].replace(/(?:cannot|tidak boleh|not|jangan|be careful with|berhati-hati dengan)[^.]*\b(?:guarantee[sd]?|promise[sd]?|menjanjikan|menjamin|dijamin)\b[^.]*\./gi, "");
    assert.ok(!banned.test(text), `${e.id}/${lang}: ${text.match(banned)?.[0]}`);
  }
});

test("official pointers are bare homepages of the institution, never deep links or other sites", () => {
  const allowed = new Map([
    ["https://www.bnm.gov.my", "Bank Negara Malaysia"],
    ["https://www.akpk.org.my", "AKPK"],
    ["https://www.kwsp.gov.my", "KWSP / EPF"],
    ["https://www.ptptn.gov.my", "PTPTN"],
    ["https://www.dosm.gov.my", "Department of Statistics Malaysia (DOSM)"],
    ["https://www.sc.com.my", "Securities Commission Malaysia"],
  ]);
  for (const e of KNOWLEDGE) {
    for (const p of e.pointers ?? []) {
      assert.equal(allowed.get(p.url), p.org, `${e.id}: ${p.url}`);
      assert.doesNotMatch(p.url, /[?#]|\/[^/]+\/[^/]+/, "no deep links");
    }
  }
});

test("topics that depend on an institution point to it, and say that rules change", () => {
  const byId = Object.fromEntries(KNOWLEDGE.map((e) => [e.id, e]));
  assert.ok(byId["ptptn"].pointers?.some((p) => p.org === "PTPTN"));
  assert.ok(byId["epf-kwsp"].pointers?.some((p) => p.org.includes("KWSP")));
  assert.ok(byId["debt-basics"].pointers?.some((p) => p.org === "AKPK"));
  assert.match(byId["ptptn"].body.en, /can change|check PTPTN/i);
  assert.match(byId["epf-kwsp"].body.en, /can change|check KWSP/i);
  assert.match(byId["zakat-awareness"].body.en, /state zakat authority/i);
});

test("the investing entry declines to advise and warns about guaranteed returns", () => {
  const e = KNOWLEDGE.find((x) => x.id === "investing-caution")!;
  assert.match(e.body.en, /cannot recommend investments/i);
  assert.match(e.body.en, /guarantees? high returns/i);
  assert.match(e.body.en, /licensed/i);
});

test("the emergency-fund guidance is labelled a rule of thumb, not a requirement", () => {
  const e = KNOWLEDGE.find((x) => x.id === "emergency-fund")!;
  assert.match(e.body.en, /rule of thumb/i);
  assert.match(e.body.en, /not an official requirement/i);
  assert.match(e.body.ms, /bukan syarat rasmi/i);
});
