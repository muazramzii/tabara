// Default categories live in code (not the database) — easier to theme, fewer
// reads. `type` follows the Needs vs Wants model for expenses.

// "savings" is deliberately its own type rather than a need. Money moved into
// savings isn't consumed, so it must not count toward the Needs half of the
// 50/30/20 split — it has its own row there, and its own filter in History.
export type CategoryType = "needs" | "wants" | "income" | "savings";

export interface Category {
  id: string;
  label: string;
  icon: string; // Ionicons name
  type: CategoryType;
}

/**
 * Expense categories. Unchanged — every id and type is the same as before, so
 * existing transactions and the 50/30/20 split are unaffected.
 */
export const CATEGORIES: Category[] = [
  { id: "food", label: "Food & Drink", icon: "fast-food-outline", type: "wants" },
  { id: "groceries", label: "Groceries", icon: "basket-outline", type: "needs" },
  { id: "transport", label: "Transport", icon: "car-outline", type: "needs" },
  { id: "tng", label: "Touch 'n Go / Tol", icon: "card-outline", type: "needs" },
  { id: "shopping", label: "Shopping", icon: "bag-handle-outline", type: "wants" },
  { id: "bills", label: "Bills & Utilities", icon: "receipt-outline", type: "needs" },
  { id: "entertainment", label: "Entertainment", icon: "game-controller-outline", type: "wants" },
  { id: "health", label: "Health", icon: "medkit-outline", type: "needs" },
  { id: "education", label: "Education / PTPTN", icon: "school-outline", type: "needs" },
  { id: "zakat", label: "Zakat & Sedekah", icon: "heart-outline", type: "needs" },
  { id: "savings", label: "Savings", icon: "wallet-outline", type: "savings" },
  { id: "other", label: "Other", icon: "ellipsis-horizontal-outline", type: "wants" },
];

/**
 * Income categories. Previously the Add screen offered the expense list for
 * income too, so a salary got filed under "Food & Drink" — which then skewed
 * the donut and the needs/wants split.
 *
 * These ids are new, so they never collide with an existing transaction.
 */
export const INCOME_CATEGORIES: Category[] = [
  { id: "salary", label: "Salary", icon: "briefcase-outline", type: "income" },
  { id: "freelance", label: "Freelance", icon: "laptop-outline", type: "income" },
  { id: "allowance", label: "Allowance", icon: "gift-outline", type: "income" },
  { id: "business", label: "Business", icon: "storefront-outline", type: "income" },
  { id: "investment", label: "Investment", icon: "trending-up-outline", type: "income" },
  { id: "refund", label: "Refund", icon: "return-down-back-outline", type: "income" },
  { id: "income_other", label: "Other income", icon: "ellipsis-horizontal-outline", type: "income" },
];

/**
 * Everything, for looking up a label or icon by id. Income transactions saved
 * before these existed still carry an expense category id, and they resolve
 * from here exactly as they used to.
 */
export const ALL_CATEGORIES: Category[] = [...CATEGORIES, ...INCOME_CATEGORIES];

/** The list to show for a given transaction type. */
export const categoriesFor = (type: "expense" | "income") =>
  type === "income" ? INCOME_CATEGORIES : CATEGORIES;
