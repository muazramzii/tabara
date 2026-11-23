// The category list, as the server needs it.
//
// The app's source of truth is src/constants/categories.ts. An Edge Function
// cannot import from outside supabase/, so this is a copy — and
// tests/kapy-finance.test.ts fails if the two ever disagree on an id, a label
// or a needs/wants/savings type, so it cannot drift silently.
//
// Needing it server-side is the point of Phase 2: Kapy now computes the
// Needs/Wants split and validates categories itself instead of trusting a list
// sent by the client.

export type CategoryKind = "needs" | "wants" | "income" | "savings";

export interface CategoryInfo {
  id: string;
  label: string;
  kind: CategoryKind;
}

export const EXPENSE_CATEGORIES: readonly CategoryInfo[] = [
  { id: "food", label: "Food & Drink", kind: "wants" },
  { id: "groceries", label: "Groceries", kind: "needs" },
  { id: "transport", label: "Transport", kind: "needs" },
  { id: "tng", label: "Touch 'n Go / Tol", kind: "needs" },
  { id: "shopping", label: "Shopping", kind: "wants" },
  { id: "bills", label: "Bills & Utilities", kind: "needs" },
  { id: "entertainment", label: "Entertainment", kind: "wants" },
  { id: "health", label: "Health", kind: "needs" },
  { id: "education", label: "Education / PTPTN", kind: "needs" },
  { id: "zakat", label: "Zakat & Sedekah", kind: "needs" },
  { id: "savings", label: "Savings", kind: "savings" },
  { id: "other", label: "Other", kind: "wants" },
];

export const INCOME_CATEGORIES: readonly CategoryInfo[] = [
  { id: "salary", label: "Salary", kind: "income" },
  { id: "freelance", label: "Freelance", kind: "income" },
  { id: "allowance", label: "Allowance", kind: "income" },
  { id: "business", label: "Business", kind: "income" },
  { id: "investment", label: "Investment", kind: "income" },
  { id: "refund", label: "Refund", kind: "income" },
  { id: "income_other", label: "Other income", kind: "income" },
];

const ALL = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];
const BY_ID = new Map(ALL.map((c) => [c.id, c]));

export const ALL_CATEGORY_IDS: readonly string[] = ALL.map((c) => c.id);
export const EXPENSE_CATEGORY_IDS: readonly string[] = EXPENSE_CATEGORIES.map((c) => c.id);
export const INCOME_CATEGORY_IDS: readonly string[] = INCOME_CATEGORIES.map((c) => c.id);

export const categoryInfo = (id: string): CategoryInfo | undefined => BY_ID.get(id);

/** A readable name for any id, including ones this list does not know. */
export const categoryLabel = (id: string): string => BY_ID.get(id)?.label ?? id;

/** Whether `id` may be used for a transaction of this type (as the Add screen enforces). */
export function isValidCategoryFor(type: "expense" | "income", id: string): boolean {
  return (type === "income" ? INCOME_CATEGORY_IDS : EXPENSE_CATEGORY_IDS).includes(id);
}
