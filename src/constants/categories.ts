// Default categories live in code (not Firestore) — easier to theme,
// fewer reads. Only user-created custom categories get stored in Firestore.
// `type` follows the Needs vs Wants model.

export type CategoryType = "needs" | "wants";

export interface Category {
  id: string;
  label: string;
  icon: string; // Ionicons name
  type: CategoryType;
}

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
  { id: "savings", label: "Savings", icon: "wallet-outline", type: "needs" },
  { id: "other", label: "Other", icon: "ellipsis-horizontal-outline", type: "wants" },
];
