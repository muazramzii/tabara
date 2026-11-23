// HELD-OUT evaluation set for Kapy's message analyser.
//
// Written BEFORE the analyser, and not used to tune it. The analyser was built
// against the dev set (kapy-eval-dev.ts); this set exists to show how far its
// accuracy falls on sentences it was not shaped around. If the held-out score is
// far below the dev score, the analyser has memorised its examples.
//
// Labelling rules (also used for the dev set):
//   lang    "ms"       — Malay; at most a loanword or two of English
//           "en"       — English
//           "manglish" — a genuine mix: the minority language is at least about a
//                        quarter of the content words, or an English sentence
//                        carrying Malaysian particles (lah, ah, bro, weh ...)
//   intent  what the person is trying to do, from the taxonomy in intent.ts.
//           A question about one category's spending is "analyse_categories".
//           "Can I afford / will it last / at this pace" is "projection".
//   period  resolved against "now" = Sunday 22 Nov 2026 (see kapy-ledger.ts)

import type { EvalCase } from "./kapy-eval-types";

export const HELDOUT: EvalCase[] = [
  // ── English ──
  { id: "h-en-01", text: "what's my balance right now", lang: "en", intent: "check_balance" },
  { id: "h-en-02", text: "how much have I earned so far this month", lang: "en", intent: "check_income", period: "this_month" },
  { id: "h-en-03", text: "total expenses for last month please", lang: "en", intent: "check_expenses", period: "last_month" },
  { id: "h-en-04", text: "did I manage to put anything into savings in September", lang: "en", intent: "check_savings", period: "month:9" },
  { id: "h-en-05", text: "am I within my budget", lang: "en", intent: "check_budget" },
  { id: "h-en-06", text: "this week vs last week spending", lang: "en", intent: "compare_periods", compare: ["this_week", "last_week"] },
  { id: "h-en-07", text: "which category is eating most of my money", lang: "en", intent: "analyse_categories" },
  { id: "h-en-08", text: "is my spending going up over the last few months", lang: "en", intent: "trends" },
  { id: "h-en-09", text: "any tips to save more money", lang: "en", intent: "savings_advice" },
  { id: "h-en-10", text: "how should I plan my monthly budget as a fresh grad", lang: "en", intent: "budgeting_advice" },
  { id: "h-en-11", text: "I just paid RM18.50 for lunch", lang: "en", intent: "record_expense", amount: 18.5, category: "food" },
  { id: "h-en-12", text: "got my allowance of RM400 today", lang: "en", intent: "record_income", amount: 400, category: "allowance" },
  { id: "h-en-13", text: "what is an emergency fund", lang: "en", intent: "financial_literacy" },
  { id: "h-en-14", text: "show me my last 5 transactions", lang: "en", intent: "transaction_history" },
  { id: "h-en-15", text: "what do you mean by that", lang: "en", intent: "clarify_previous", followUp: true },
  { id: "h-en-16", text: "at this pace how much will I have spent by month end", lang: "en", intent: "projection" },
  { id: "h-en-17", text: "thanks Kapy!", lang: "en", intent: "chitchat" },
  { id: "h-en-18", text: "how much did I spend on transport last week", lang: "en", intent: "analyse_categories", category: "transport", period: "last_week" },

  // ── Bahasa Melayu ──
  { id: "h-ms-01", text: "baki aku sekarang berapa", lang: "ms", intent: "check_balance" },
  { id: "h-ms-02", text: "gaji aku bulan ni dah masuk ke belum", lang: "ms", intent: "check_income", period: "this_month" },
  { id: "h-ms-03", text: "jumlah belanja aku semalam", lang: "ms", intent: "check_expenses", period: "yesterday" },
  { id: "h-ms-04", text: "berapa aku dah tabung bulan ni", lang: "ms", intent: "check_savings", period: "this_month" },
  { id: "h-ms-05", text: "bajet aku macam mana sekarang", lang: "ms", intent: "check_budget" },
  { id: "h-ms-06", text: "banding perbelanjaan bulan ni dengan bulan lepas", lang: "ms", intent: "compare_periods", compare: ["this_month", "last_month"] },
  { id: "h-ms-07", text: "duit aku paling banyak keluar untuk apa", lang: "ms", intent: "analyse_categories" },
  { id: "h-ms-08", text: "perbelanjaan aku makin naik ke 3 bulan ni", lang: "ms", intent: "trends", period: "last_3_months" },
  { id: "h-ms-09", text: "macam mana nak jimat duit", lang: "ms", intent: "savings_advice" },
  { id: "h-ms-10", text: "tolong bagi cadangan susun bajet untuk pelajar", lang: "ms", intent: "budgeting_advice" },
  { id: "h-ms-11", text: "tadi aku beli nasi lemak rm6", lang: "ms", intent: "record_expense", amount: 6, category: "food" },
  { id: "h-ms-12", text: "dapat duit raya rm200", lang: "ms", intent: "record_income", amount: 200 },
  { id: "h-ms-13", text: "apa itu dana kecemasan", lang: "ms", intent: "financial_literacy" },
  { id: "h-ms-14", text: "senarai transaksi aku minggu ni", lang: "ms", intent: "transaction_history", period: "this_week" },
  { id: "h-ms-15", text: "maksud kau apa tadi tu", lang: "ms", intent: "clarify_previous", followUp: true },
  { id: "h-ms-16", text: "kalau macam ni sampai hujung bulan berapa aku akan belanja", lang: "ms", intent: "projection" },
  { id: "h-ms-17", text: "terima kasih kapy", lang: "ms", intent: "chitchat" },

  // ── Manglish ──
  { id: "h-mg-01", text: "bro balance aku berapa eh now", lang: "manglish", intent: "check_balance" },
  { id: "h-mg-02", text: "my gaji dah masuk ke belum this month", lang: "manglish", intent: "check_income", period: "this_month" },
  { id: "h-mg-03", text: "aku spend berapa last week ah", lang: "manglish", intent: "check_expenses", period: "last_week" },
  { id: "h-mg-04", text: "last month aku save berapa ah", lang: "manglish", intent: "check_savings", period: "last_month" },
  { id: "h-mg-05", text: "wah budget aku dah burst ke", lang: "manglish", intent: "check_budget" },
  { id: "h-mg-06", text: "compare aku punya spending oct vs nov", lang: "manglish", intent: "compare_periods", compare: ["month:10", "month:11"] },
  { id: "h-mg-07", text: "most of my duit habis kat mana", lang: "manglish", intent: "analyse_categories" },
  { id: "h-mg-08", text: "spending aku macam naik naik je past 3 months", lang: "manglish", intent: "trends", period: "last_3_months" },
  { id: "h-mg-09", text: "any tips nak save more lah", lang: "manglish", intent: "savings_advice" },
  { id: "h-mg-10", text: "tadi aku bayar grab rm23", lang: "ms", intent: "record_expense", amount: 23, category: "transport" },
  { id: "h-mg-11", text: "bagi tau aku what is ptptn lah", lang: "manglish", intent: "financial_literacy" },
  { id: "h-mg-12", text: "can u list my transactions today", lang: "en", intent: "transaction_history", period: "today" },
  { id: "h-mg-13", text: "wait kenapa so high eh", lang: "manglish", intent: "clarify_previous", followUp: true },
  { id: "h-mg-14", text: "okay lah thanks", lang: "manglish", intent: "chitchat" },
  { id: "h-mg-15", text: "will my money last until end of month ah", lang: "manglish", intent: "projection" },
];
