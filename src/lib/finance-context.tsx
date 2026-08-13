import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
    type PropsWithChildren,
} from "react";
import { useAuth } from "./auth-context";
import {
    getUserProfile,
    listenTransactions,
    type Transaction,
    type UserProfile,
} from "./db";

type Mood = { emoji: string; title: string; subtitle: string };

type Derived = {
  spent: number;
  budget: number;
  remaining: number;
  income: number;
  savingsGoal: number;
  mood: Mood;
};

type FinanceState = {
  transactions: Transaction[];
  profile: UserProfile | null;
  loading: boolean;
  derived: Derived;
  refreshProfile: () => Promise<void>;
};

const FinanceContext = createContext<FinanceState>({} as FinanceState);
export const useFinance = () => useContext(FinanceContext);

const isThisMonth = (d: Date) => {
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
};

function computeMood(spent: number, budget: number): Mood {
  if (budget <= 0)
    return { emoji: "🦫", title: "Kapy is waiting", subtitle: "Set your income to start tracking" };
  const ratio = spent / budget;
  if (ratio <= 0.7)
    return { emoji: "🦫", title: "Kapy is feeling chill", subtitle: "You're well within budget" };
  if (ratio <= 1)
    return { emoji: "🦫", title: "Kapy is a bit careful", subtitle: "Getting close to your budget" };
  return { emoji: "🦫", title: "Kapy is stressed", subtitle: "You've gone over budget this month" };
}

export function FinanceProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const uid = user?.uid;

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    if (!uid) return;
    setProfile(await getUserProfile(uid));
  };

  useEffect(() => {
    if (!uid) {
      setTransactions([]);
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    refreshProfile();
    const unsub = listenTransactions(uid, (txns) => {
      setTransactions(txns);
      setLoading(false);
    });
    return unsub;
  }, [uid]);

  const derived = useMemo<Derived>(() => {
    const income = profile?.income ?? 0;
    const savingsGoal = profile?.savingsGoal ?? 0;
    const spent = transactions
      .filter((t) => t.type === "expense" && isThisMonth(t.date))
      .reduce((sum, t) => sum + t.amount, 0);
    const budget = Math.max(income - savingsGoal, 0);
    return {
      spent,
      budget,
      remaining: budget - spent,
      income,
      savingsGoal,
      mood: computeMood(spent, budget),
    };
  }, [transactions, profile]);

  return (
    <FinanceContext.Provider
      value={{ transactions, profile, loading, derived, refreshProfile }}
    >
      {children}
    </FinanceContext.Provider>
  );
}