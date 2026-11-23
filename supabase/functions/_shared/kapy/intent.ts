// Reading a message: what is being asked, about which period and category.
//
// Role in the system
// ------------------
// This is NOT the final decision-maker. Gemini decides what to do through
// function calling, and it copes with phrasings no word list anticipates. This
// module supplies *hints* that make that decision better and checkable:
//
//   - the reply language/style to use,
//   - a likely intent, period, category and amount, which are written into the
//     system prompt as "resolved context" and used to fill a tool call's
//     missing arguments,
//   - a measurable baseline: tests/kapy-eval.test.ts scores this analyser on
//     labelled Malay, English and Manglish sentences, so the claim "Kapy
//     understands X" is a number, not an impression.
//
// How it works
// ------------
// Weighted evidence rather than a lookup. Each intent accumulates points from
// several independent signals (topic words, sentence form, a question marker,
// an amount, the period named, follow-up phrasing). The winner needs to beat the
// runner-up to be confident; ties and low scores produce "unknown" and a low
// `confidence`, and the model is told so. Messages that match nothing are left
// to the model — they are not forced into a category.
//
// Limits (stated, and measured): it knows the vocabulary written here. A
// sentence phrased entirely outside it scores as "unknown". That is the
// intended failure — fall back to the model — not a wrong confident answer.
//
// No Deno- or Node-specific imports.

import { detectLanguage, normalize, type Lang } from "./language.ts";
import { toSen, type Sen } from "./money.ts";
import { mytParts, shiftMonth, type PeriodSpec } from "./period.ts";

export type Intent =
  | "check_balance"
  | "check_income"
  | "check_expenses"
  | "check_savings"
  | "check_budget"
  | "compare_periods"
  | "analyse_categories"
  | "trends"
  | "savings_advice"
  | "budgeting_advice"
  | "record_expense"
  | "record_income"
  | "financial_literacy"
  | "transaction_history"
  | "clarify_previous"
  | "projection"
  | "chitchat"
  | "unknown";

export const INTENTS: readonly Intent[] = [
  "check_balance", "check_income", "check_expenses", "check_savings", "check_budget",
  "compare_periods", "analyse_categories", "trends", "savings_advice", "budgeting_advice",
  "record_expense", "record_income", "financial_literacy", "transaction_history",
  "clarify_previous", "projection", "chitchat", "unknown",
];

export interface Analysis {
  /** The user's message, untouched. */
  text: string;
  lang: Lang;
  languageConfidence: number;
  intent: Intent;
  /** 0-1. Low means "treat as a suggestion, ask or let the model decide". */
  confidence: number;
  alternatives: { intent: Intent; score: number }[];
  /** A single period named in the message, if any. */
  period: PeriodSpec | null;
  /** Two periods named (or implied) for a comparison, in the order written. */
  comparePeriods: [PeriodSpec, PeriodSpec] | null;
  category: string | null;
  /** For recording an income category, e.g. salary. */
  incomeCategory: string | null;
  amountSen: Sen | null;
  /** The message leans on the previous turn ("what about food?", "yang tadi"). */
  followUp: boolean;
  /** "bulan tu" / "that month": names a period without saying which. */
  refersToPeriod: boolean;
  /** "is that too much?": points at something without naming it. */
  refersToSubject: boolean;
}

// ── numbers and amounts ─────────────────────────────────────

const NUMBER_WORDS: Record<string, number> = {
  satu: 1, one: 1, dua: 2, two: 2, tiga: 3, three: 3, empat: 4, four: 4, lima: 5, five: 5,
  enam: 6, six: 6, tujuh: 7, seven: 7, lapan: 8, eight: 8, sembilan: 9, nine: 9,
  sepuluh: 10, ten: 10, sebelas: 11, eleven: 11, "dua belas": 12, twelve: 12,
};
const NUM = "(\\d{1,3}|satu|one|dua belas|dua|two|tiga|three|empat|four|lima|five|enam|six|tujuh|seven|lapan|eight|sembilan|nine|sepuluh|ten|sebelas|eleven|twelve)";

const toInt = (s: string): number => (/^\d+$/.test(s) ? Number(s) : NUMBER_WORDS[s] ?? NaN);

export function extractAmount(normalized: string, allowBare: boolean): Sen | null {
  const withRm = /\brm\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(k)?\b/.exec(normalized);
  if (withRm) {
    const whole = withRm[1].replace(/,/g, "");
    const frac = withRm[2] ? withRm[2].padEnd(2, "0") : "00";
    let sen = toSen(`${whole}.${frac}`);
    if (sen !== null && withRm[3]) sen *= 1000;
    return sen;
  }
  const withWord = /\b(\d+(?:\.\d{1,2})?)\s?(?:ringgit|myr)\b/.exec(normalized);
  if (withWord) return toSen(withWord[1]);
  if (allowBare) {
    const nums = [...normalized.matchAll(/(?<![\d/.])(\d+(?:\.\d{1,2})?)(?![\d/%.]|\s?(?:bulan|months?|days?|hari|minggu|weeks?|%))/g)];
    if (nums.length === 1) return toSen(nums[0][1]);
  }
  return null;
}

// ── categories ──────────────────────────────────────────────

const CATEGORY_PATTERNS: [string, RegExp][] = [
  ["tng", /\b(tng|touch ?n ?go|touch and go|touch & go|tol|toll|plaza tol|rfid)\b/],
  ["food", /\b(makan|makanan|food|minum|minuman|kopi|coffee|mamak|restoran|restaurant|lunch|dinner|breakfast|sarapan|nasi|teh tarik|eat(?:ing)? out|makan luar|snacks?|grabfood|foodpanda|mcd|kfc|boba|bubble tea|cafe)\b/],
  ["groceries", /\b(groceries|grocery|barang dapur|pasar|pasar raya|mydin|tesco|lotus'?s?|giant|speedmart|99 speedmart|supermarket)\b/],
  ["transport", /\b(transport|pengangkutan|petrol|minyak|fuel|lrt|mrt|ktm|bas|bus|grab|ride|parking|parkir|teksi|taxi|kereta api)\b/],
  ["shopping", /\b(shopping|beli-?belah|beli belah|baju|shopee|lazada|clothes|clothing|fashion|kasut|shoes|tudung)\b/],
  ["bills", /\b(bil|bils|bills?|elektrik|electric(?:ity)?|utilit(?:y|ies)|internet|wifi|sewa|rent|astro|unifi|tnb|syabas)\b/],
  ["entertainment", /\b(entertainment|hiburan|movie|movies|wayang|netflix|spotify|games?|gaming|konsert|concert|cinema|tgv|gsc)\b/],
  ["health", /\b(health|kesihatan|klinik|clinic|ubat|medicine|doctor|doktor|hospital|gym|farmasi|pharmacy)\b/],
  ["education", /\b(education|pendidikan|yuran|tuition|buku|books?|kelas|course|kursus|ptptn)\b/],
  ["zakat", /\b(zakat|sedekah|derma|donation|charity|infaq)\b/],
];

const INCOME_CATEGORY_PATTERNS: [string, RegExp][] = [
  ["salary", /\b(gaji|salary|wages?|payslip)\b/],
  ["freelance", /\b(freelance|freelancing|gig|side ?hustle)\b/],
  ["allowance", /\b(elaun|allowance|duit poket|pocket money|biasiswa|scholarship)\b/],
  ["business", /\b(business|bisnes|perniagaan|jualan|sales)\b/],
  ["investment", /\b(investment|pelaburan|dividend|dividen|interest|faedah)\b/],
  ["refund", /\b(refund|bayaran balik|cashback)\b/],
];

function firstCategory(n: string, table: [string, RegExp][]): string | null {
  let best: { id: string; at: number } | null = null;
  for (const [id, re] of table) {
    const m = re.exec(n);
    if (m && (best === null || m.index < best.at)) best = { id, at: m.index };
  }
  return best?.id ?? null;
}

// ── periods ─────────────────────────────────────────────────

const MONTHS: [number, RegExp][] = [
  [1, /\b(jan(?:uary|uari)?)\b/],
  [2, /\b(feb(?:ruary|ruari)?)\b/],
  [3, /\b(mar(?:ch)?|mac)\b/],
  [4, /\b(apr(?:il)?)\b/],
  [5, /\b(mei|may)\b/],
  [6, /\b(jun(?:e)?)\b/],
  [7, /\b(jul(?:y|ai)?)\b/],
  [8, /\b(aug(?:ust)?|ogos)\b/],
  [9, /\b(sep(?:t(?:ember)?)?)\b/],
  [10, /\b(oct(?:ober)?|okt(?:ober)?)\b/],
  [11, /\b(nov(?:ember)?)\b/],
  [12, /\b(dec(?:ember)?|disember|(?<=bulan )dis)\b/],
];

/** "may" is also a verb; only treat it as a month with a month-ish word around it. */
const MAY_AS_MONTH = /\b(?:in|for|during|of|pada|bulan|compare|banding|and|dan|vs|versus)\s+may\b|\bmay\s+(?:20\d\d|spending|expenses)\b|\bmei\b/;

function monthMentions(n: string, now: number): { at: number; spec: PeriodSpec }[] {
  const t = mytParts(now);
  const found: { at: number; spec: PeriodSpec }[] = [];
  for (const [month, re] of MONTHS) {
    const g = new RegExp(re.source, "g");
    for (const m of n.matchAll(g)) {
      if (month === 5 && m[0] === "may" && !MAY_AS_MONTH.test(n)) continue;
      const after = n.slice((m.index ?? 0) + m[0].length);
      const yearMatch = /^\s*(20\d\d)\b/.exec(after);
      let year: number;
      if (yearMatch) year = Number(yearMatch[1]);
      else year = month <= t.month ? t.year : t.year - 1;
      found.push({ at: m.index ?? 0, spec: { kind: "month", year, month } });
    }
  }
  // "bulan 10" / "month 10"
  for (const m of n.matchAll(/\b(?:bulan|month)\s+(1[0-2]|[1-9])\b(?!\s*(?:lepas|lalu|ni|ini|months?))/g)) {
    const month = Number(m[1]);
    found.push({
      at: m.index ?? 0,
      spec: { kind: "month", year: month <= t.month ? t.year : t.year - 1, month },
    });
  }
  return found.sort((a, b) => a.at - b.at);
}

const THIS_MONTH = /\b(bulan ni|this month|bulan semasa|bulan kini|current month|this month's)\b/;
const LAST_MONTH = /\b(bulan lepas|last month|previous month|bulan lalu|bulan sebelum(?:nya)?|prior month)\b/;
const THIS_WEEK = /\b(minggu ni|this week|minggu kini)\b/;
const LAST_WEEK = /\b(minggu lepas|last week|minggu lalu|previous week)\b/;
const TODAY = /\b(hari ni|today|hari ini)\b/;
const YESTERDAY = /\b(semalam|yesterday)\b/;

interface Hit { at: number; spec: PeriodSpec }

function simplePeriods(n: string): Hit[] {
  const hits: Hit[] = [];
  const push = (re: RegExp, spec: PeriodSpec) => {
    const m = re.exec(n);
    if (m) hits.push({ at: m.index, spec });
  };
  push(THIS_MONTH, { kind: "this_month" });
  push(LAST_MONTH, { kind: "last_month" });
  push(THIS_WEEK, { kind: "this_week" });
  push(LAST_WEEK, { kind: "last_week" });
  push(TODAY, { kind: "today" });
  push(YESTERDAY, { kind: "yesterday" });

  const nMonths = new RegExp(
    `\\b(?:(?:past|last|previous|recent)\\s+${NUM}\\s+months?|${NUM}\\s+bulan\\s+(?:lepas|lalu|kebelakangan|terakhir|ni|ini)|${NUM}\\s+months?)\\b`
  ).exec(n);
  if (nMonths) {
    const raw = nMonths.slice(1).find((x) => x !== undefined) as string;
    const k = toInt(raw);
    if (k >= 1 && k <= 12) hits.push({ at: nMonths.index, spec: { kind: "last_n_months", months: k } });
  }
  const nDays = new RegExp(`\\b(?:(?:past|last)\\s+${NUM}\\s+days?|${NUM}\\s+hari\\s+(?:lepas|lalu|kebelakangan|terakhir))\\b`).exec(n);
  if (nDays) {
    const raw = nDays.slice(1).find((x) => x !== undefined) as string;
    const k = toInt(raw);
    if (k >= 1 && k <= 366) hits.push({ at: nDays.index, spec: { kind: "last_n_days", days: k } });
  }
  return hits;
}

// ── intent evidence ─────────────────────────────────────────

type Rule = [intent: Intent, weight: number, pattern: RegExp];

const RULES: Rule[] = [
  // balance
  ["check_balance", 4, /\bbaki\b|\bbalance\b/],
  ["check_balance", 3.5, /\b(money|duit|wang) (?:aku |saya |kau )?(?:left|tinggal)\b|\b(?:left|tinggal) (?:berapa|to spend)\b|\bhave left\b|\bleft to spend\b|\bduit (?:aku |saya )?tinggal\b|\btinggal berapa\b/],
  ["check_balance", 3.5, /\bhow much (?:cash|money|duit) (?:do )?(?:i|aku) (?:still |lagi )?(?:have|got|ada)\b/],
  ["check_balance", 2, /\bhow much (?:money |duit )?do i have\b|\bhow much (?:money )?have i got\b|\bberapa duit (?:aku|saya) ada\b/],
  ["check_balance", 3, /\bkira baki\b/],
  ["check_balance", 3.5, /\bhow much (?:is |do i have |have i got )?(?:left|remaining)\b|\bwhat(?:'s|s| is) left\b|\bleft of my (?:money|cash|salary|allowance)\b|\bberapa (?:lagi )?(?:yang )?(?:tinggal|berbaki)\b|\b(?:cash|duit|wang) (?:aku |saya )?(?:still |lagi )?(?:have|ada|tinggal)\b/],
  ["check_balance", 3, /\b(?:tak|tiada) ada duit\b|\bduit (?:aku |saya )?(?:dah )?kong\b/],

  // income
  ["check_income", 3, /\b(income|pendapatan)\b/],
  ["check_income", 2.5, /\b(gaji|salary)\b/],
  ["check_income", 2.5, /\b(earned|earn|earning)\b|\b(?:get|got|getting) paid\b|\btake[- ]?home\b|\bpaid me\b/],
  ["check_income", 1, /\bmasuk\b/],

  // expenses
  ["check_expenses", 2, /\b(belanja|perbelanjaan|spend|spent|spending|expenses?|expenditure)\b/],
  ["check_expenses", 1, /\b(jumlah|total)\b/],
  ["check_expenses", 2.5, /\b(boros|pembaziran|membazir|extravagant|splurge|splurged|blew|blow)\b/],
  ["check_expenses", 1.5, /\btotal (?:spending|expenses?)\b|\bjumlah (?:belanja|perbelanjaan)\b/],
  ["check_expenses", 2.5, /\bduit\b.*\bhabis\b|\bhabis\b.*\bduit\b|\bduit\b.*\bkeluar\b|\bkeluar duit\b|\bkeluar\b.*\bduit\b/],

  // savings
  ["check_savings", 3, /\b(simpanan|tabung|savings?|saved|saving)\b/],
  ["check_savings", 2.5, /\b(simpan|save|tabung)\b/],
  ["check_savings", 3, /\bsavings rate\b|\bkadar simpanan\b/],

  // budget
  ["check_budget", 3, /\b(bajet|budget)\b/],
  ["check_budget", 3, /\b(overspend|overspent|over ?budget|terlebih|burst|overshoot|boncos|melebihi)\b/],
  ["check_budget", 1.5, /\bdah lebih\b|\bterlebih\b/],
  ["check_budget", 3.5, /\b(?:left|remaining|tinggal|berbaki)\b.*\b(?:budget|bajet)\b|\b(?:budget|bajet)\b.*\b(?:left|remaining|tinggal|berbaki)\b/],

  // compare
  ["compare_periods", 4, /\b(banding|bandingkan|compare|comparison|vs|versus|berbanding)\b/],
  ["compare_periods", 4, /\bstack(?:s|ed)? up (?:against|to|with)\b|\bagainst (?:last|this|the|previous)\b/],
  ["compare_periods", 4, /\b(higher|lower|more|less|better|worse) than\b|\blebih (?:tinggi|banyak|rendah) (?:dari|daripada)\b/],

  // categories
  ["analyse_categories", 3, /\bcategor(?:y|ies)\b|\bkategori\b/],
  ["analyse_categories", 3, /\bpaling banyak\b|\bterbanyak\b|\bthe most\b|\bmost of my\b|\bmost on\b|\bbiggest expense\b|\bpaling tinggi\b/],
  ["analyse_categories", 3, /\b(?:kat|dekat) mana\b|\bwhere (?:did|does|is|has)\b.*\b(?:go|went|going)\b|\buntuk apa\b/],
  ["analyse_categories", 2, /\bbreakdown\b/],

  // trends
  ["trends", 4, /\btrends?\b/],
  ["trends", 3.5, /\b(makin|semakin)\b|\bgetting (?:better|worse|higher|lower|less|more)\b|\bgoing (?:up|down)\b|\bnaik naik\b|\bover the (?:last |past )?(?:few |several )?months\b|\bover the months\b|\bsejak\b/],
  ["trends", 2, /\bnaik\b|\bturun\b/],

  // advice
  ["savings_advice", 3, /\b(tips?|advice|cadangan|nasihat|suggestions?)\b/],
  ["savings_advice", 3.5, /\bmacam mana nak (?:elak|kawal|urus|berhenti|stop)\b|\bhow (?:do|can|to|should) (?:i |we )?(?:stop|avoid|control|curb|manage)\b|\bimpulse\b|\bkawal (?:belanja|perbelanjaan)\b|\bjimat cermat\b|\bstop spending\b/],
  ["savings_advice", 3.5, /\bhow (?:can|do|to|should) (?:i |we )?(?:save|cut|reduce|spend less)\b|\bmacam mana nak (?:jimat|simpan|kurang(?:kan)?)\b|\bcara (?:nak )?(?:jimat|simpan|kurangkan)\b|\bcut (?:down|back)\b|\b(?:patut|should)\b.*\b(?:cut|kurang|jimat|reduce)\b|\bwhere (?:can|should) i (?:cut|save)\b|\bways to (?:save|cut|reduce)\b|\bsave more\b|\bnak save\b|\bjimat\b|\bkurangkan\b/],
  ["budgeting_advice", 5, /\b(?:plan|buat|susun|create|set up|setup|atur|make|rancang)\b[^.?]{0,30}\b(?:budget|bajet)\b/],
  ["budgeting_advice", 4.5, /\bstick to (?:a |my )?budget\b|\bbudgeting\b|\bmengurus(?:kan)? (?:duit|kewangan)\b/],

  // projection
  ["projection", 3, /\bhujung bulan\b|\bakhir bulan\b|\bend of (?:the )?month\b|\bmonth[- ]?end\b|\bby month end\b/],
  ["projection", 3, /\bat this (?:rate|pace)\b|\bkalau macam (?:ni|tu)\b|\bif this continues\b|\bif i keep\b/],
  ["projection", 4, /\bafford\b|\bmampu\b/],
  ["projection", 3, /\blast until\b|\brun out\b|\btak cukup\b|\bnot enough\b/],
  ["projection", 2, /\bcukup (?:ke|tak)\b/],
  ["projection", 3, /\bproject(?:ion|ed)?\b|\banggaran\b|\bramalan\b/],
  ["projection", 4, /\b(?:kalau|if) (?:aku |saya |i )?(?:save|simpan|put aside|set aside)\b|\b(?:boleh ke|can i) (?:aku )?(?:beli|buy|get)\b/],
  ["projection", 2, /\bwill i have\b|\bberapa (?:aku|saya) akan\b/],
  ["projection", 3.5, /\bwill i (?:hit|reach|make|get to|be able)\b|\bafter \d+ months?\b|\bselepas \d+ bulan\b|\bboleh (?:tak )?(?:aku |saya )?(?:simpan|save)\b|\bcan i (?:save|put aside|set aside)\b/],

  // history
  ["transaction_history", 3.5, /\btransactions?\b|\btransaksi\b|\bhistory\b|\bsejarah\b/],
  ["transaction_history", 3, /\bsenarai\b|\bapa yang (?:aku|saya) (?:beli|belanja|bayar)\b|\bwhat did i (?:buy|pay for)\b|\beverything i (?:bought|spent|paid)\b|\ball (?:my )?purchases\b|\brecent (?:purchases|spending)\b/],

  // clarify
  ["clarify_previous", 3, /\b(?:yang )?tadi(?: tu)?\b/],
  ["clarify_previous", 3, /\bmaksud (?:kau|awak)\b|\bwhat do you mean\b|\bmean by that\b/],
  ["clarify_previous", 3.5, /\bhow did you (?:calculate|get|work|come)\b|\bmacam mana (?:kau |awak )?kira\b|\bbetul ke\b|\bare you sure\b/],
  ["clarify_previous", 3.5, /\bwhy (?:is|are|was|were) [a-z]+ (?:so )?(?:higher|lower|high|low)\b|\bkenapa (?:so |sangat )?(?:tinggi|rendah|high|low|banyak)\b|\bwhy (?:so )?(?:high|low|expensive|mahal|much)\b/],
  ["clarify_previous", 3, /\bexplain (?:that|it|this)\b|\bexplain (?:the |your )?(?:last |previous )?answer\b|\bhow (?:do )?(?:you|u) get (?:that|this|the)\b|\bwhere did (?:that|this|the) (?:number|figure|amount)\b/],
  ["clarify_previous", 2, /\bwhy is (?:that|it|this)\b|\bkenapa (?:macam tu|camtu|tu)\b/],

  // chitchat
  ["chitchat", 4, /\b(thanks|thank you|terima kasih|hi|hello|bye|goodbye|assalamualaikum|salam)\b/],
  ["chitchat", 4, /\bare you (?:there|here|awake)\b|\byou there\b|\bhow are you\b|\bapa khabar\b/],
  ["chitchat", 4, /\bselamat (?:pagi|petang|malam|tengah hari)\b|\bgood (?:morning|night|evening)\b|\bokay lah\b/],
];

const LITERACY_TOPICS =
  /\b(emergency fund|dana kecemasan|50\/30\/20|ptptn|epf|kwsp|asb|asnb|needs and wants|needs dan wants|needs|wants|inflation|inflasi|compound(?:ing)?|interest rate|faedah|akpk|duitnow|insurance|takaful|credit score|ccris|pelaburan|saham|unit trust|zakat|riba|fixed deposit|stocks?|debt|hutang|pinjaman|loan|investing|invest|retirement|persaraan|net worth|50 30 20)\b/;
const LITERACY_FRAME =
  /\b(what is|what's|whats|what are|what does|what happens|what if|apa (?:itu|tu)|apa jadi|apa maksud|explain|eli5|terangkan|jelaskan|define|meaning of|bagi tau|how does|how do|macam mana|bagaimana|tell me about|cerita pasal)\b/;
const LITERACY_WORKS = /\b(works?|berfungsi|function)\b/;

const QUESTION_WORD =
  /\?|\b(berapa|how|what|which|apa|mana|kenapa|why|bila|when|can|could|boleh|am i|do i|did i|is my|are my|adakah|where)\b|\b(?:ke|tak|ke tak)\s*$/;
const RECORD_VERB_EXPENSE =
  /\b(spent|paid|bought|purchased|topped up|top up|topup|beli|bayar|belanja|belanjakan|habis|masukkan|letak|transfer|put|ordered|order|beli-?kan)\b/;
const RECORD_VERB_INCOME =
  /\b(dapat|terima|received|got|earned|paid me|credited|masuk|gaji|salary|allowance|elaun|payment|duit raya)\b/;
const RECORD_TO_SAVINGS = /\b(?:masukkan|letak|put|transfer|simpan|save|tambah|add)\b.*\b(?:tabung|simpanan|savings?)\b/;

const FOLLOW_UP_START =
  /^(and|then|so(?! far)|also|what about|how about|bagaimana dengan|macam mana dengan|dan|pulak|pula|and what|how bout|bout)\b/;
const FOLLOW_UP_ANYWHERE =
  /\b(pulak|pula|yang tadi|tadi tu|bulan tu|bulan itu|that month|same month|those|them|itu|that one|the same)\b/;
const DEICTIC_PERIOD = /\b(bulan tu|bulan itu|that month|same month|minggu tu|that week|masa tu|then)\b/;
const DEICTIC_SUBJECT = /\b(is that|are those|is it|are they|that too|that much|itu terlalu|tu terlalu|that high|that low|ok ke tu|banyak ke tu)\b/;

// ── the analyser ────────────────────────────────────────────

export function analyzeMessage(text: string, now: number): Analysis {
  const n = ` ${normalize(text)} `.replace(/\s+/g, " ");
  const trimmed = n.trim();
  const tokens = trimmed.split(" ").filter(Boolean);
  const lang = detectLanguage(text);

  const isQuestion = QUESTION_WORD.test(trimmed);

  // amount, category
  const amountRm = extractAmount(trimmed, false);
  const hasRecordVerb = RECORD_VERB_EXPENSE.test(trimmed) || RECORD_VERB_INCOME.test(trimmed);
  const amountSen = amountRm ?? (hasRecordVerb ? extractAmount(trimmed, true) : null);
  const category = firstCategory(trimmed, CATEGORY_PATTERNS);
  const incomeCategory = firstCategory(trimmed, INCOME_CATEGORY_PATTERNS);

  // periods
  const months = monthMentions(` ${trimmed} `, now);
  const simple = simplePeriods(trimmed);
  const allHits: Hit[] = [...months, ...simple].sort((a, b) => a.at - b.at);

  // score
  const score = new Map<Intent, number>();
  const add = (i: Intent, w: number) => score.set(i, (score.get(i) ?? 0) + w);
  for (const [intent, w, re] of RULES) if (re.test(trimmed)) add(intent, w);

  // General-knowledge questions: a finance topic asked about in an explaining
  // frame ("what is ...", "apa itu ...", "how does ... work"). A question about
  // the person's own figures has no such topic, so "what is my balance" is not one.
  if (LITERACY_TOPICS.test(trimmed) && (LITERACY_FRAME.test(trimmed) || LITERACY_WORKS.test(trimmed))) {
    add("financial_literacy", 4.5);
  }

  // "difference between X and Y": between periods it is a comparison; between
  // finance concepts it is a request to explain them.
  if (/\b(?:beza|perbezaan|difference|differ)\b/.test(trimmed)) {
    if (allHits.length >= 1) add("compare_periods", 4);
    else if (LITERACY_TOPICS.test(trimmed)) add("financial_literacy", 4.5);
  }

  // Recording: an amount plus a past-tense "this happened" verb, said as a statement.
  const asksForAdvice = (score.get("savings_advice") ?? 0) >= 3 || (score.get("budgeting_advice") ?? 0) >= 3;
  if (amountSen !== null && !isQuestion && !asksForAdvice) {
    if (RECORD_TO_SAVINGS.test(trimmed)) add("record_expense", 6);
    const incomeLike = RECORD_VERB_INCOME.test(trimmed) || incomeCategory !== null;
    const expenseLike = RECORD_VERB_EXPENSE.test(trimmed);
    if (incomeLike && !/\b(beli|bought|bayar|paid for|spent|belanja)\b/.test(trimmed)) add("record_income", 6);
    else if (expenseLike) add("record_expense", 5.5);
    else if (category !== null) add("record_expense", 4.5);
  }

  // A category named in a spending question is a question about that category.
  const spendingQuestionTopic =
    (score.get("check_expenses") ?? 0) > 0 ||
    isQuestion ||
    /\b(banyak|too much|lately|recently|baru-baru)\b/.test(trimmed) ||
    /\b(what about|how about|kalau|pulak|pula)\b/.test(trimmed);
  if (category !== null && spendingQuestionTopic) {
    const blocked = (["transaction_history", "record_expense", "record_income", "financial_literacy", "compare_periods", "savings_advice", "budgeting_advice", "check_balance", "check_budget", "check_savings", "check_income", "projection", "trends"] as Intent[])
      .some((i) => (score.get(i) ?? 0) >= 3);
    if (!blocked) add("analyse_categories", 3.5);
  }

  // A savings/budget/trend question named alongside "why" is that question, not a request to explain a reply.
  const topicalIntents: Intent[] = ["check_savings", "check_budget", "check_balance", "check_income", "check_expenses"];
  if ((score.get("clarify_previous") ?? 0) > 0 && topicalIntents.some((i) => (score.get(i) ?? 0) >= 2.5)) {
    score.set("clarify_previous", (score.get("clarify_previous") ?? 0) - 1);
  }

  // Greetings only count when that is all the message is.
  if ((score.get("chitchat") ?? 0) > 0) {
    const others = [...score.entries()].filter(([i]) => i !== "chitchat").reduce((m, [, v]) => Math.max(m, v), 0);
    if (tokens.length > 6 || others >= 2.5) score.delete("chitchat");
  }

  // A recorded amount outranks a same-words question about spending.
  if ((score.get("record_expense") ?? 0) > 0 || (score.get("record_income") ?? 0) > 0) {
    score.delete("check_expenses");
    score.delete("check_income");
    score.delete("check_savings");
  }

  const ranked = [...score.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  const second = ranked[1];
  const MIN_SCORE = 2;
  const intent: Intent = top && top[1] >= MIN_SCORE ? top[0] : "unknown";
  const confidence = top && top[1] >= MIN_SCORE ? top[1] / (top[1] + (second ? second[1] : 0) + 1) : 0;

  // periods, shaped by intent
  const comparePeriods = intent === "compare_periods" ? comparePair(allHits) : null;
  const period = intent === "compare_periods" ? null : (allHits[0]?.spec ?? null);

  // follow-up phrasing
  const fewWords = tokens.length <= 5;
  const onlyFragment = fewWords && (allHits.length > 0 || category !== null) && intent === "unknown";
  const followUp =
    FOLLOW_UP_START.test(trimmed) ||
    FOLLOW_UP_ANYWHERE.test(trimmed) ||
    intent === "clarify_previous" ||
    onlyFragment ||
    (category !== null && /\b(what about|how about|kalau)\b/.test(trimmed) && fewWords);

  return {
    text,
    lang: lang.lang,
    languageConfidence: lang.confidence,
    intent,
    confidence,
    alternatives: ranked.slice(0, 3).map(([i, s]) => ({ intent: i, score: s })),
    period,
    comparePeriods,
    category:
      intent === "record_income"
        ? incomeCategory
        : intent === "record_expense" && RECORD_TO_SAVINGS.test(trimmed)
          ? "savings"
          : category,
    incomeCategory: intent === "record_income" || intent === "check_income" ? incomeCategory : null,
    amountSen,
    followUp,
    refersToPeriod: DEICTIC_PERIOD.test(trimmed) && allHits.length === 0,
    refersToSubject: DEICTIC_SUBJECT.test(trimmed) && category === null,
  };
}

/**
 * Two periods for a comparison, in the order written. A single named period
 * is compared with the current month ("compare my spending with last month").
 */
function comparePair(hits: Hit[]): [PeriodSpec, PeriodSpec] | null {
  const uniq: PeriodSpec[] = [];
  for (const h of hits) if (!uniq.some((u) => JSON.stringify(u) === JSON.stringify(h.spec))) uniq.push(h.spec);
  if (uniq.length >= 2) return [uniq[0], uniq[1]];
  if (uniq.length === 1) {
    const only = uniq[0];
    if (only.kind === "this_month") return [only, { kind: "last_month" }];
    if (only.kind === "this_week") return [only, { kind: "last_week" }];
    if (only.kind === "last_week") return [{ kind: "this_week" }, only];
    return [{ kind: "this_month" }, only];
  }
  return [{ kind: "this_month" }, { kind: "last_month" }];
}

/** A month a given number of months before `now` — used by tests and the resolver. */
export function monthsAgo(now: number, k: number): PeriodSpec {
  const t = mytParts(now);
  const m = shiftMonth(t.year, t.month, -k);
  return { kind: "month", year: m.year, month: m.month };
}
