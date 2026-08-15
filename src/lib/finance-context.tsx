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

// The month's maths lives in derive.ts so it can be tested without mounting
// a provider. Re-exported here because screens already import these names
// from this module.
import { deriveTotals, type Derived, type Mood } from "./derive";
export type { Derived, Mood };

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

  const derived = useMemo<Derived>(
    () => deriveTotals(transactions, profile),
    [transactions, profile]
  );

  return (
    <FinanceContext.Provider
      value={{ transactions, profile, loading, error, derived, refreshProfile, retry }}
    >
      {children}
    </FinanceContext.Provider>
  );
}