// SECOND fresh set. Written after the analyser had been adjusted using the
// first fresh set's failures, so that there is one more score that is not
// tainted by having looked at its misses. Labels were fixed before the first
// run; the first-run number is the one reported.
//
// Same intent as before: slang, texting spelling, vocabulary the analyser may
// not contain, mixed-language phrasing, and ambiguity.

import type { EvalCase } from "./kapy-eval-types";

export const FRESH2: EvalCase[] = [
  { id: "g-01", text: "how much have i got in the bank rn", lang: "en", intent: "check_balance" },
  { id: "g-02", text: "any money left for the weekend", lang: "en", intent: "check_balance" },
  { id: "g-03", text: "how much did i get paid this month", lang: "en", intent: "check_income", period: "this_month" },
  { id: "g-04", text: "what did i spend on groceries in september", lang: "en", intent: "analyse_categories", category: "groceries", period: "month:9" },
  { id: "g-05", text: "put rm200 in my savings", lang: "en", intent: "record_expense", amount: 200, category: "savings" },
  { id: "g-06", text: "got paid rm2800 salary just now", lang: "en", intent: "record_income", amount: 2800, category: "salary" },
  { id: "g-07", text: "how do i start an emergency fund", lang: "en", intent: "financial_literacy" },
  { id: "g-08", text: "is my spending higher than last month", lang: "en", intent: "compare_periods", compare: ["this_month", "last_month"] },
  { id: "g-09", text: "show me everything i bought last week", lang: "en", intent: "transaction_history", period: "last_week" },
  { id: "g-10", text: "how many days until i run out of money", lang: "en", intent: "projection" },
  { id: "g-11", text: "good morning kapy", lang: "en", intent: "chitchat" },
  { id: "g-12", text: "is my budget ok", lang: "en", intent: "check_budget" },
  { id: "g-13", text: "am i saving enough", lang: "en", intent: "check_savings" },
  { id: "g-14", text: "ways to cut down on takeaway", lang: "en", intent: "savings_advice" },

  { id: "g-15", text: "duit gaji aku dah sampai ke belum", lang: "ms", intent: "check_income" },
  { id: "g-16", text: "baki duit aku bulan ni tinggal berapa", lang: "ms", intent: "check_balance", period: "this_month" },
  { id: "g-17", text: "berapa aku dah guna untuk minyak kereta minggu ni", lang: "ms", intent: "analyse_categories", category: "transport", period: "this_week" },
  { id: "g-18", text: "jumlah simpanan aku setakat ni", lang: "ms", intent: "check_savings" },
  { id: "g-19", text: "tadi beli kopi rm9", lang: "ms", intent: "record_expense", amount: 9, category: "food" },
  { id: "g-20", text: "baru dapat duit elaun rm600", lang: "ms", intent: "record_income", amount: 600, category: "allowance" },
  { id: "g-21", text: "apa beza simpanan dan pelaburan", lang: "ms", intent: "financial_literacy" },
  { id: "g-22", text: "bandingkan belanja minggu ni dan minggu lepas", lang: "ms", intent: "compare_periods", compare: ["this_week", "last_week"] },
  { id: "g-23", text: "tunjuk semua transaksi bulan lepas", lang: "ms", intent: "transaction_history", period: "last_month" },
  { id: "g-24", text: "belanja aku naik atau turun sejak tiga bulan lepas", lang: "ms", intent: "trends", period: "last_3_months" },
  { id: "g-25", text: "boleh ke aku beli phone baru bulan depan", lang: "ms", intent: "projection" },
  { id: "g-26", text: "cara nak simpan duit lebih setiap bulan", lang: "ms", intent: "savings_advice" },
  { id: "g-27", text: "bajet makan aku dah habis ke", lang: "ms", intent: "check_budget", category: "food" },

  { id: "g-28", text: "bro my duit tinggal berapa ah", lang: "manglish", intent: "check_balance" },
  { id: "g-29", text: "tolong check berapa aku spend on shopping this month", lang: "manglish", intent: "analyse_categories", category: "shopping", period: "this_month" },
  { id: "g-30", text: "aku baru topup tng rm30 lah", lang: "manglish", intent: "record_expense", amount: 30, category: "tng" },
  { id: "g-31", text: "eh my allowance dah masuk rm400 tadi", lang: "manglish", intent: "record_income", amount: 400, category: "allowance" },
  { id: "g-32", text: "what is zakat on savings ah", lang: "manglish", intent: "financial_literacy" },
  { id: "g-33", text: "this week vs last week mana lagi banyak aku spend", lang: "manglish", intent: "compare_periods", compare: ["this_week", "last_week"] },
  { id: "g-34", text: "walao why so mahal this month", lang: "manglish", intent: "clarify_previous", followUp: true },
  { id: "g-35", text: "thanks ya kapy sangat membantu", lang: "manglish", intent: "chitchat" },
  { id: "g-36", text: "aku patut cut spending kat mana ah", lang: "manglish", intent: "savings_advice" },
  { id: "g-37", text: "if aku save rm150 weekly how much by december", lang: "manglish", intent: "projection" },
  { id: "g-38", text: "my budget bulan ni macam okay je kan", lang: "manglish", intent: "check_budget", period: "this_month" },
  { id: "g-39", text: "hmm", lang: "unknown", intent: "unknown" },
  { id: "g-40", text: "asdf qwerty", lang: "unknown", intent: "unknown" },
];
