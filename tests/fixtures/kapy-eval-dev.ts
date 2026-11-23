// DEV evaluation set for Kapy's message analyser — the set the analyser was
// built and tuned against. It includes every example sentence from the Phase 2
// brief. See kapy-eval-heldout.ts for the set that was not used for tuning, and
// for the labelling rules.

import type { ContextScenario, EvalCase } from "./kapy-eval-types";

export const DEV: EvalCase[] = [
  // ── the brief's Bahasa Melayu examples ──
  { id: "d-ms-01", text: "Berapa duit aku dah habis bulan ni?", lang: "ms", intent: "check_expenses", period: "this_month" },
  { id: "d-ms-02", text: "Aku banyak sangat spend dekat makan ke?", lang: "ms", intent: "analyse_categories", category: "food" },
  { id: "d-ms-03", text: "Tolong kira baki duit aku.", lang: "ms", intent: "check_balance" },
  { id: "d-ms-04", text: "Bulan lepas aku berjaya simpan berapa?", lang: "ms", intent: "check_savings", period: "last_month" },
  { id: "d-ms-05", text: "Aku rasa duit aku tak cukup sampai hujung bulan.", lang: "ms", intent: "projection" },
  { id: "d-ms-06", text: "Macam mana nak kurangkan perbelanjaan?", lang: "ms", intent: "savings_advice" },
  { id: "d-mg-01", text: "Boleh explain kenapa savings aku rendah?", lang: "manglish", intent: "check_savings" },

  // ── the brief's English examples ──
  { id: "d-en-01", text: "How much did I spend this month?", lang: "en", intent: "check_expenses", period: "this_month" },
  { id: "d-en-02", text: "Am I spending too much on food?", lang: "en", intent: "analyse_categories", category: "food" },
  { id: "d-en-03", text: "How much money do I have left?", lang: "en", intent: "check_balance" },
  { id: "d-en-04", text: "Can I afford to save RM300 this month?", lang: "en", intent: "projection", period: "this_month", amount: 300 },
  { id: "d-en-05", text: "Compare my spending with last month.", lang: "en", intent: "compare_periods", compare: ["this_month", "last_month"] },

  // ── the brief's Manglish examples ──
  { id: "d-mg-02", text: "Weh, duit aku tinggal berapa sekarang?", lang: "manglish", intent: "check_balance" },
  { id: "d-mg-03", text: "Aku rasa bulan ni overspend gila.", lang: "manglish", intent: "check_budget", period: "this_month" },
  { id: "d-mg-04", text: "Can you check spending aku dekat food?", lang: "manglish", intent: "analyse_categories", category: "food" },
  { id: "d-mg-05", text: "This month macam banyak sangat keluar duit.", lang: "manglish", intent: "check_expenses", period: "this_month" },
  { id: "d-mg-06", text: "Kalau aku save RM200 monthly okay tak?", lang: "manglish", intent: "projection", amount: 200 },
  { id: "d-mg-07", text: "Kapy, tolong check budget aku jap.", lang: "manglish", intent: "check_budget" },
  { id: "d-mg-08", text: "Aku dah terlebih budget ke?", lang: "manglish", intent: "check_budget" },
  { id: "d-mg-09", text: "Why savings aku makin sikit?", lang: "manglish", intent: "trends" },

  // ── the brief's data-retrieval examples ──
  { id: "d-en-06", text: "How much did I spend last month?", lang: "en", intent: "check_expenses", period: "last_month" },
  { id: "d-en-07", text: "What category did I spend the most on?", lang: "en", intent: "analyse_categories" },
  { id: "d-en-08", text: "How much did I save in October?", lang: "en", intent: "check_savings", period: "month:10" },
  { id: "d-en-09", text: "Compare my expenses this month and last month.", lang: "en", intent: "compare_periods", compare: ["this_month", "last_month"] },
  { id: "d-en-10", text: "Show my spending trend for the past three months.", lang: "en", intent: "trends", period: "last_3_months" },
  { id: "d-ms-08", text: "Berapa banyak aku spend dekat food?", lang: "ms", intent: "analyse_categories", category: "food" },
  { id: "d-ms-09", text: "Aku banyak guna duit untuk transport ke?", lang: "ms", intent: "analyse_categories", category: "transport" },
  { id: "d-en-11", text: "Compare October and November.", lang: "en", intent: "compare_periods", compare: ["month:10", "month:11"] },

  // ── balance ──
  { id: "d-bal-01", text: "what is my balance", lang: "en", intent: "check_balance" },
  { id: "d-bal-02", text: "how much do I have left to spend", lang: "en", intent: "check_balance" },
  { id: "d-bal-03", text: "duit aku tinggal berapa", lang: "ms", intent: "check_balance" },
  { id: "d-bal-04", text: "baki akaun aku berapa sekarang", lang: "ms", intent: "check_balance" },
  { id: "d-bal-05", text: "brp baki aku skrg", lang: "ms", intent: "check_balance" },
  { id: "d-bal-06", text: "kapy my money left berapa", lang: "manglish", intent: "check_balance" },

  // ── income ──
  { id: "d-inc-01", text: "how much income did I get this month", lang: "en", intent: "check_income", period: "this_month" },
  { id: "d-inc-02", text: "berapa gaji aku masuk bulan lepas", lang: "ms", intent: "check_income", period: "last_month" },
  { id: "d-inc-03", text: "total pendapatan aku bulan ni", lang: "ms", intent: "check_income", period: "this_month" },
  { id: "d-inc-04", text: "my income this week berapa", lang: "manglish", intent: "check_income", period: "this_week" },

  // ── expenses ──
  { id: "d-exp-01", text: "total spending today", lang: "en", intent: "check_expenses", period: "today" },
  { id: "d-exp-02", text: "berapa aku belanja minggu ni", lang: "ms", intent: "check_expenses", period: "this_week" },
  { id: "d-exp-03", text: "aku dah spend berapa semalam", lang: "manglish", intent: "check_expenses", period: "yesterday" },
  { id: "d-exp-04", text: "how much did i spend in the last 30 days", lang: "en", intent: "check_expenses", period: "last_30_days" },
  { id: "d-exp-05", text: "berapa duit aku keluar bulan lepas", lang: "ms", intent: "check_expenses", period: "last_month" },
  { id: "d-exp-06", text: "spending bulan ni berapa", lang: "manglish", intent: "check_expenses", period: "this_month" },

  // ── savings ──
  { id: "d-sav-01", text: "how much have I saved this month", lang: "en", intent: "check_savings", period: "this_month" },
  { id: "d-sav-02", text: "berapa simpanan aku bulan ni", lang: "ms", intent: "check_savings", period: "this_month" },
  { id: "d-sav-03", text: "what is my savings rate", lang: "en", intent: "check_savings" },
  { id: "d-sav-04", text: "tabung aku bulan lepas berapa", lang: "ms", intent: "check_savings", period: "last_month" },

  // ── budget ──
  { id: "d-bud-01", text: "am I over budget", lang: "en", intent: "check_budget" },
  { id: "d-bud-02", text: "how is my budget looking", lang: "en", intent: "check_budget" },
  { id: "d-bud-03", text: "bajet aku masih cukup tak", lang: "ms", intent: "check_budget" },
  { id: "d-bud-04", text: "dah overspend ke aku bulan ni", lang: "manglish", intent: "check_budget", period: "this_month" },

  // ── compare ──
  { id: "d-cmp-01", text: "banding bulan ni dengan bulan lepas", lang: "ms", intent: "compare_periods", compare: ["this_month", "last_month"] },
  { id: "d-cmp-02", text: "is this month higher than last month", lang: "en", intent: "compare_periods", compare: ["this_month", "last_month"] },
  { id: "d-cmp-03", text: "bulan ni vs bulan lepas macam mana", lang: "manglish", intent: "compare_periods", compare: ["this_month", "last_month"] },
  { id: "d-cmp-04", text: "compare september and october spending", lang: "en", intent: "compare_periods", compare: ["month:9", "month:10"] },

  // ── categories ──
  { id: "d-cat-01", text: "how much on groceries this month", lang: "en", intent: "analyse_categories", category: "groceries", period: "this_month" },
  { id: "d-cat-02", text: "berapa aku habis untuk minyak kereta", lang: "ms", intent: "analyse_categories", category: "transport" },
  { id: "d-cat-03", text: "spending on entertainment lately", lang: "en", intent: "analyse_categories", category: "entertainment" },
  { id: "d-cat-04", text: "aku banyak shopping ke bulan ni", lang: "manglish", intent: "analyse_categories", category: "shopping", period: "this_month" },
  { id: "d-cat-05", text: "kategori mana aku paling banyak belanja", lang: "ms", intent: "analyse_categories" },
  { id: "d-cat-06", text: "bil elektrik dan air bulan ni berapa", lang: "ms", intent: "analyse_categories", category: "bills", period: "this_month" },
  { id: "d-cat-07", text: "how much did I spend on tol and touch n go", lang: "en", intent: "analyse_categories", category: "tng" },

  // ── trends ──
  { id: "d-trd-01", text: "is my spending getting better over the months", lang: "en", intent: "trends" },
  { id: "d-trd-02", text: "trend perbelanjaan aku 6 bulan lepas", lang: "ms", intent: "trends" },

  // ── advice ──
  { id: "d-adv-01", text: "how can I save more", lang: "en", intent: "savings_advice" },
  { id: "d-adv-02", text: "tips jimat duit untuk pelajar", lang: "ms", intent: "savings_advice" },
  { id: "d-adv-03", text: "how do I stick to a budget", lang: "en", intent: "budgeting_advice" },
  { id: "d-adv-04", text: "macam mana nak buat bajet bulanan", lang: "ms", intent: "budgeting_advice" },
  { id: "d-adv-05", text: "help me plan my budget lah", lang: "manglish", intent: "budgeting_advice" },

  // ── recording ──
  { id: "d-rec-01", text: "I spent RM12 on lunch", lang: "en", intent: "record_expense", amount: 12, category: "food" },
  { id: "d-rec-02", text: "saya belanja makan rm15 hari ni", lang: "ms", intent: "record_expense", amount: 15, category: "food" },
  { id: "d-rec-03", text: "just topped up touch n go rm50", lang: "en", intent: "record_expense", amount: 50, category: "tng" },
  { id: "d-rec-04", text: "masukkan RM 50 ke tabung saya", lang: "ms", intent: "record_expense", amount: 50, category: "savings" },
  { id: "d-rec-05", text: "dapat gaji 2000", lang: "ms", intent: "record_income", amount: 2000, category: "salary" },
  { id: "d-rec-06", text: "received my freelance payment RM800", lang: "en", intent: "record_income", amount: 800, category: "freelance" },
  { id: "d-rec-07", text: "aku baru beli baju rm89.90 kat shopee", lang: "ms", intent: "record_expense", amount: 89.9, category: "shopping" },

  // ── literacy ──
  { id: "d-lit-01", text: "what is the 50/30/20 rule", lang: "en", intent: "financial_literacy" },
  { id: "d-lit-02", text: "explain what an emergency fund is", lang: "en", intent: "financial_literacy" },
  { id: "d-lit-03", text: "apa maksud needs dan wants", lang: "ms", intent: "financial_literacy" },
  { id: "d-lit-04", text: "macam mana PTPTN berfungsi", lang: "ms", intent: "financial_literacy" },

  // ── history ──
  { id: "d-his-01", text: "show my recent transactions", lang: "en", intent: "transaction_history" },
  { id: "d-his-02", text: "apa yang aku beli minggu lepas", lang: "ms", intent: "transaction_history", period: "last_week" },
  { id: "d-his-03", text: "tunjuk transaksi food bulan ni", lang: "ms", intent: "transaction_history", category: "food", period: "this_month" },

  // ── clarify / follow-up ──
  { id: "d-clr-01", text: "Why is November higher?", lang: "en", intent: "clarify_previous", followUp: true },
  { id: "d-clr-02", text: "yang tadi tu kenapa", lang: "ms", intent: "clarify_previous", followUp: true },
  { id: "d-clr-03", text: "how did you calculate that", lang: "en", intent: "clarify_previous", followUp: true },
  { id: "d-fup-01", text: "What about food?", lang: "en", intent: "analyse_categories", category: "food", followUp: true },
  { id: "d-fup-02", text: "bulan lepas pulak?", lang: "ms", intent: "unknown", period: "last_month", followUp: true },
  { id: "d-fup-03", text: "kalau transport pulak", lang: "ms", intent: "analyse_categories", category: "transport", followUp: true },

  // ── projection ──
  { id: "d-prj-01", text: "will I run out of money before the end of the month", lang: "en", intent: "projection" },
  { id: "d-prj-02", text: "cukup ke duit aku sampai akhir bulan", lang: "ms", intent: "projection" },

  // ── chit-chat and unclear ──
  { id: "d-chi-01", text: "hi kapy", lang: "en", intent: "chitchat" },
  { id: "d-chi-02", text: "terima kasih", lang: "ms", intent: "chitchat" },
  { id: "d-chi-03", text: "selamat pagi", lang: "ms", intent: "chitchat" },
  { id: "d-unk-01", text: "hmm", lang: "unknown", intent: "unknown" },
];

/**
 * Multi-turn scenarios for the context resolver. "Now" is 22 Nov 2026.
 * Turns are processed in order; each expectation is what the resolver should
 * have settled on for that turn.
 */
export const SCENARIOS: ContextScenario[] = [
  {
    id: "s-food-followup",
    description: "A period is kept when the next question only names a category",
    turns: [
      { text: "How much did I spend this month?", expect: { intent: "check_expenses", period: "this_month" } },
      { text: "What about food?", expect: { intent: "analyse_categories", category: "food", period: "this_month", inherited: ["period"] } },
    ],
  },
  {
    id: "s-compare-why",
    description: "'Why is November higher?' keeps the comparison it refers to",
    turns: [
      { text: "Compare October and November.", expect: { intent: "compare_periods", compare: ["month:10", "month:11"] } },
      { text: "Why is November higher?", expect: { intent: "clarify_previous", compare: ["month:10", "month:11"], inherited: ["compare"] } },
    ],
  },
  {
    id: "s-last-month-pulak",
    description: "A bare period reuses the previous question's subject",
    turns: [
      { text: "berapa aku belanja untuk food bulan ni", expect: { intent: "analyse_categories", category: "food", period: "this_month" } },
      { text: "bulan lepas pulak?", expect: { category: "food", period: "last_month", inherited: ["category"] } },
    ],
  },
  {
    id: "s-category-switch",
    description: "Naming a new category replaces the old one but keeps the period",
    turns: [
      { text: "berapa aku spend dekat food bulan lepas", expect: { category: "food", period: "last_month" } },
      { text: "kalau transport pulak", expect: { category: "transport", period: "last_month", inherited: ["period"] } },
    ],
  },
  {
    id: "s-explicit-wins",
    description: "A period stated in the new message always beats the remembered one",
    turns: [
      { text: "how much did I spend last month", expect: { period: "last_month" } },
      { text: "and this week?", expect: { period: "this_week" } },
    ],
  },
  {
    id: "s-topic-change",
    description: "A change of subject does not drag the old category along",
    turns: [
      { text: "how much did I spend on food last month", expect: { category: "food", period: "last_month" } },
      { text: "what is an emergency fund", expect: { intent: "financial_literacy", category: null } },
      { text: "what is my balance", expect: { intent: "check_balance", category: null } },
    ],
  },
  {
    id: "s-no-context",
    description: "A reference with nothing to refer to asks instead of guessing",
    turns: [
      { text: "bulan tu berapa aku belanja", expect: { needsClarification: "period" } },
      { text: "is that too much?", expect: { needsClarification: "category" } },
    ],
  },
  {
    id: "s-pronoun-category",
    description: "'that' / 'tu' refers to the category just discussed",
    turns: [
      { text: "how much did I spend on transport this month", expect: { category: "transport", period: "this_month" } },
      { text: "is that too much?", expect: { category: "transport", period: "this_month", inherited: ["category", "period"] } },
    ],
  },
  {
    id: "s-record-does-not-set-period",
    description: "Recording an expense leaves the remembered period alone",
    turns: [
      { text: "how much did I spend last month", expect: { period: "last_month" } },
      { text: "I spent RM12 on lunch", expect: { intent: "record_expense" } },
      { text: "and in total?", expect: { period: "last_month", inherited: ["period"] } },
    ],
  },
  {
    id: "s-malay-period-word",
    description: "'bulan tu' means the month under discussion",
    turns: [
      { text: "banding oktober dengan november", expect: { compare: ["month:10", "month:11"] } },
      { text: "bulan tu kenapa tinggi", expect: { intent: "clarify_previous", compare: ["month:10", "month:11"], inherited: ["compare"] } },
    ],
  },
];
