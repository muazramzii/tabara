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
  /** Real spending this month — excludes money moved into savings. */
  spent: number;
  /** Money deliberately put into the savings category this month. */
  saved: number;
  /** Income transactions logged this month (on top of the profile figure). */
  earned: number;
  /** profile.income + earned — everything that came in. */
  income: number;
  /** income − spent − saved. What's still loose. */
  balance: number;
  budget: number;
  remaining: number;
  savingsGoal: number;
  mood: Mood;
};

type FinanceState = {
  transactions: Transaction[];
  profile: UserProfile | null;
  loading: boolean;
  /** Set when the load failed, so screens can tell "offline" from "empty". */
  error: string | null;
  derived: Derived;
  refreshProfile: () => Promise<void>;
  retry: () => void;
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
  const uid = user?.id;

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumping this re-runs the effect below, which re-subscribes and refetches.
  const [attempt, setAttempt] = useState(0);
  const retry = () => setAttempt((n) => n + 1);

  const refreshProfile = async () => {
    if (!uid) return;
    try {
      setProfile(await getUserProfile(uid));
    } catch {
      setProfile(null); // offline or not set up yet — Home falls back to "set your income"
    }
  };

  useEffect(() => {
    if (!uid) {
      setTransactions([]);
      setProfile(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    refreshProfile();
    const unsub = listenTransactions(
      uid,
      (txns) => {
        setTransactions(txns);
        setError(null);
        setLoading(false);
      },
      (message) => {
        // Don't blank the list on a failed refresh — keep whatever we had and
        // let the screen say the load failed.
        setError(message);
        setLoading(false);
      }
    );
    return unsub;
  }, [uid, attempt]);

  const derived = useMemo<Derived>(() => {
    const baseIncome = profile?.income ?? 0;
    const savingsGoal = profile?.savingsGoal ?? 0;

    const thisMonth = transactions.filter((t) => isThisMonth(t.date));

    // Income transactions were previously ignored entirely, so logging a
    // salary changed nothing on screen. They now add to what came in.
    const earned = thisMonth
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);

    // Moving money into savings is stored as an expense in the "savings"
    // category. It leaves your spendable pool, but it is not *spending* — so
    // it's tracked separately and no longer counts against the budget or
    // makes Kapy stressed.
    const saved = thisMonth
      .filter((t) => t.type === "expense" && t.category === "savings")
      .reduce((sum, t) => sum + t.amount, 0);

    const spent = thisMonth
      .filter((t) => t.type === "expense" && t.category !== "savings")
      .reduce((sum, t) => sum + t.amount, 0);

    const income = baseIncome + earned;
    const balance = income - spent - saved;
    const budget = Math.max(income - savingsGoal, 0);

    return {
      spent,
      saved,
      earned,
      income,
      balance,
      budget,
      remaining: budget - spent,
      savingsGoal,
      mood: computeMood(spent, budget),
    };
  }, [transactions, profile]);

  return (
    <FinanceContext.Provider
      value={{ transactions, profile, loading, error, derived, refreshProfile, retry }}
    >
      {children}
    </FinanceContext.Provider>
  );
}