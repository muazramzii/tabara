// A small ledger whose totals were worked out by hand, shared by the Kapy tests.
//
// "Now" is Sunday 22 November 2026, 18:00 in Kuala Lumpur (10:00 UTC).
//
// Two rows sit exactly on a month boundary in Malaysia time, because that is
// where a server working in UTC goes wrong:
//   2026-10-31T16:00:00Z  = 1 Nov 00:00 MYT  -> November
//   2026-10-31T15:59:59.999Z = 31 Oct 23:59:59.999 MYT -> October
//
// Hand-computed expectations (sen-exact):
//
//   NOVEMBER   spent  341.55   (12.90+8.10+150.55+45.00+99.99+20.01+5.00)
//              saved  300.00
//              earned 3000.00
//              needs  195.55  (groceries 150.55 + transport 45.00)
//              wants  146.00  (food 46.01 + shopping 99.99)
//   OCTOBER    spent  300.00   (30+200+60+10)
//              saved  400.00
//              earned 500.00
//   SEPTEMBER  spent  200.00
//
//   profile: income 2500, savings goal 500, budgets food 40, groceries 200

export const NOW = Date.parse("2026-11-22T10:00:00Z");

export const PROFILE_ROW = {
  income: 2500,
  savings_goal: 500,
  budgets: { food: 40, groceries: 200 },
};

type Row = { id: string; amount: number; type: "expense" | "income"; category: string; date: string; note?: string | null };

let n = 0;
const row = (
  date: string,
  type: "expense" | "income",
  category: string,
  amount: number,
  note: string | null = null
): Row => ({ id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, amount, type, category, date, note });

export const LEDGER_ROWS: Row[] = [
  // September
  row("2026-09-10T04:00:00Z", "expense", "food", 200),

  // October
  row("2026-10-01T04:00:00Z", "expense", "food", 30),
  row("2026-10-15T04:00:00Z", "expense", "groceries", 200),
  row("2026-10-20T04:00:00Z", "expense", "savings", 400),
  row("2026-10-25T04:00:00Z", "income", "freelance", 500),
  row("2026-10-30T04:00:00Z", "expense", "transport", 60),
  row("2026-10-31T15:59:59.999Z", "expense", "food", 10), // 23:59:59.999 MYT, still October

  // November
  row("2026-10-31T16:00:00Z", "expense", "food", 5), // 00:00 MYT, already November
  row("2026-11-02T04:00:00Z", "expense", "food", 12.9),
  row("2026-11-03T04:00:00Z", "expense", "food", 8.1),
  row("2026-11-05T04:00:00Z", "expense", "groceries", 150.55),
  row("2026-11-07T04:00:00Z", "expense", "transport", 45),
  row("2026-11-10T04:00:00Z", "expense", "savings", 300),
  row("2026-11-12T04:00:00Z", "income", "salary", 3000),
  row("2026-11-15T04:00:00Z", "expense", "shopping", 99.99, "Shopee order"),
  row("2026-11-20T04:00:00Z", "expense", "food", 20.01, "Mamak"),
];
