// FRESH evaluation set: written after the analyser was frozen against the dev
// and held-out sets, and deliberately harder — slang, texting spelling, words
// the analyser's vocabulary does not contain, and a few traps (a month
// abbreviation that is also a texting spelling of "this", advice that mentions
// an amount without recording one).
//
// Labels were fixed before this set was first run. The first-run score is the
// honest estimate of how the analyser does on language it was not shaped
// around; any later score on this set is no longer independent, because
// failures were then looked at. Both are reported.

import type { EvalCase } from "./kapy-eval-types";

export const FRESH: EvalCase[] = [
  // ── English, informal ──
  { id: "f-01", text: "yo how much cash do i still have", lang: "en", intent: "check_balance" },
  { id: "f-02", text: "whats left of my money this month", lang: "en", intent: "check_balance", period: "this_month" },
  { id: "f-03", text: "did my salary come in yet", lang: "en", intent: "check_income" },
  { id: "f-04", text: "how much did i blow on food last month", lang: "en", intent: "analyse_categories", category: "food", period: "last_month" },
  { id: "f-05", text: "why am i always broke by the 20th", lang: "en", intent: "unknown" },
  { id: "f-06", text: "ive been saving rm100 every week, will i hit rm1000 by december", lang: "en", intent: "projection" },
  { id: "f-07", text: "break down my spending by category for october", lang: "en", intent: "analyse_categories", period: "month:10" },
  { id: "f-08", text: "how does my spending this week stack up against last week", lang: "en", intent: "compare_periods", compare: ["this_week", "last_week"] },
  { id: "f-09", text: "log rm35 for petrol", lang: "en", intent: "record_expense", amount: 35, category: "transport" },
  { id: "f-10", text: "add income rm1500 from freelance work", lang: "en", intent: "record_income", amount: 1500, category: "freelance" },
  { id: "f-11", text: "eli5 compound interest", lang: "en", intent: "financial_literacy" },
  { id: "f-12", text: "give me my transaction list for yesterday", lang: "en", intent: "transaction_history", period: "yesterday" },
  { id: "f-13", text: "can you explain that last answer again", lang: "en", intent: "clarify_previous", followUp: true },
  { id: "f-14", text: "hello!", lang: "en", intent: "chitchat" },
  { id: "f-16", text: "i feel like im spending way too much lately", lang: "en", intent: "check_expenses" },
  { id: "f-17", text: "whats my savings rate this month", lang: "en", intent: "check_savings", period: "this_month" },
  { id: "f-18", text: "tips for budgeting when my allowance is only rm500", lang: "en", intent: "budgeting_advice" },
  { id: "f-19", text: "show me my top 3 categories", lang: "en", intent: "analyse_categories" },

  // ── Bahasa Melayu ──
  { id: "f-20", text: "duit aku tinggal berapa ringgit lagi ni", lang: "ms", intent: "check_balance" },
  { id: "f-21", text: "gaji dah masuk belum", lang: "ms", intent: "check_income" },
  { id: "f-22", text: "bulan lepas aku boros ke", lang: "ms", intent: "check_expenses", period: "last_month" },
  { id: "f-23", text: "berapa belanja aku untuk makan luar bulan oktober", lang: "ms", intent: "analyse_categories", category: "food", period: "month:10" },
  { id: "f-24", text: "bagi aku senarai belanja hari ni", lang: "ms", intent: "transaction_history", period: "today" },
  { id: "f-25", text: "aku nak tahu beza belanja september dengan oktober", lang: "ms", intent: "compare_periods", compare: ["month:9", "month:10"] },
  { id: "f-26", text: "tolong terangkan apa itu 50/30/20", lang: "ms", intent: "financial_literacy" },
  { id: "f-27", text: "macam mana nak elak kehabisan duit sebelum gaji", lang: "ms", intent: "savings_advice" },
  { id: "f-28", text: "baru bayar bil elektrik rm120", lang: "ms", intent: "record_expense", amount: 120, category: "bills" },
  { id: "f-29", text: "dapat elaun rm300 hari ni", lang: "ms", intent: "record_income", amount: 300, category: "allowance" },
  { id: "f-30", text: "kenapa tinggi sangat bulan ni", lang: "ms", intent: "clarify_previous", followUp: true },
  { id: "f-31", text: "boleh tak aku simpan rm500 sebulan", lang: "ms", intent: "projection" },
  { id: "f-32", text: "perbelanjaan aku makin teruk ke", lang: "ms", intent: "trends" },
  { id: "f-33", text: "cukup tak bajet aku sampai habis bulan", lang: "ms", intent: "check_budget" },
  { id: "f-34", text: "aku dah tak ada duit la", lang: "ms", intent: "check_balance" },
  { id: "f-35", text: "terima kasih banyak banyak", lang: "ms", intent: "chitchat" },

  // ── Manglish and slang ──
  { id: "f-36", text: "eh bro i think my duit keluar too much la this month", lang: "manglish", intent: "check_expenses", period: "this_month" },
  { id: "f-37", text: "wah gaji baru masuk terus habis lol", lang: "manglish", intent: "check_expenses" },
  { id: "f-38", text: "how much aku spend on mamak ah last week", lang: "manglish", intent: "analyse_categories", category: "food", period: "last_week" },
  { id: "f-39", text: "can help me check my baki or not", lang: "manglish", intent: "check_balance" },
  { id: "f-40", text: "jimat cermat tips please", lang: "manglish", intent: "savings_advice" },
  { id: "f-41", text: "so far this month berapa dah aku save", lang: "manglish", intent: "check_savings", period: "this_month" },
  { id: "f-42", text: "tapau nasi lemak rm7 just now", lang: "manglish", intent: "record_expense", amount: 7, category: "food" },
  { id: "f-43", text: "lepas bayar ptptn how much left eh", lang: "manglish", intent: "check_balance" },
  { id: "f-44", text: "ptptn tu what happens if tak bayar", lang: "manglish", intent: "financial_literacy" },
  { id: "f-45", text: "last month vs this month, which one aku lagi boros", lang: "manglish", intent: "compare_periods", compare: ["last_month", "this_month"] },
  { id: "f-46", text: "show me tng reload history", lang: "en", intent: "transaction_history", category: "tng" },
  { id: "f-47", text: "wait what? how u get that number", lang: "en", intent: "clarify_previous", followUp: true },
  { id: "f-48", text: "ok thanks bye", lang: "en", intent: "chitchat" },
  { id: "f-49", text: "dis month aku overspend ke tak", lang: "manglish", intent: "check_budget", period: "this_month" },
  { id: "f-50", text: "gimme my balance now", lang: "en", intent: "check_balance" },
  { id: "f-51", text: "kalau aku save 300 every month, after 6 months berapa", lang: "manglish", intent: "projection" },
  { id: "f-52", text: "i spent 25 bucks on grab", lang: "en", intent: "record_expense", amount: 25, category: "transport" },
  { id: "f-53", text: "rm 1,200 gaji masuk tadi", lang: "ms", intent: "record_income", amount: 1200, category: "salary" },
  { id: "f-54", text: "any idea how to stop impulse buying lol", lang: "en", intent: "savings_advice" },
  { id: "f-55", text: "total belanja aku 3 bulan ni", lang: "ms", intent: "check_expenses", period: "last_3_months" },
  { id: "f-56", text: "kategori yang paling boros apa", lang: "ms", intent: "analyse_categories" },
  { id: "f-57", text: "how much is left in my food budget", lang: "en", intent: "check_budget", category: "food" },
  { id: "f-58", text: "ada transaksi pelik tak minggu ni", lang: "ms", intent: "transaction_history", period: "this_week" },
  { id: "f-59", text: "whats kwsp", lang: "en", intent: "financial_literacy" },
  { id: "f-60", text: "kapy are you there", lang: "en", intent: "chitchat" },
];
