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

  // Loaded-ness is tracked per source, and "loading" means either is not ready.
  // Previously loading flipped false as soon as the transactions arrived,
  // while the profile was still in flight. deriveTotals reads
  // profile?.income ?? 0, so during that window Home rendered a balance of
  // income-zero minus everything spent — a large negative number, on data
  // that was perfectly correct. That gap is the bug this replaces.
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [txnsLoaded, setTxnsLoaded] = useState(false);
  const loading = !(profileLoaded && txnsLoaded);

  // Kept apart so a successful transaction refresh cannot silently clear a
  // profile failure, which would leave wrong totals on screen with nothing
  // saying anything had gone wrong.
  const [profileError, setProfileError] = useState<string | null>(null);
  const [txnError, setTxnError] = useState<string | null>(null);
  const error = profileError ?? txnError;

  // Bumping this re-runs the effect below, which re-subscribes and refetches.
  const [attempt, setAttempt] = useState(0);
  const retry = () => setAttempt((n) => n + 1);

  const refreshProfile = async () => {
    if (!uid) return;
    try {
      setProfile(await getUserProfile(uid));
      setProfileError(null);
    } catch {
      // Deliberately does NOT blank the profile. Nulling it makes income read
      // as zero, which turns a momentary network failure into a balance of
      // minus everything you have ever spent. Keep the last known figures and
      // say the refresh failed — the same choice the transaction listener
      // below already makes about the list.
      setProfileError("Couldn't load your budget. Check your connection.");
    } finally {
      setProfileLoaded(true);
    }
  };

  useEffect(() => {
    if (!uid) {
      setTransactions([]);
      setProfile(null);
      setProfileLoaded(true);
      setTxnsLoaded(true);
      setProfileError(null);
      setTxnError(null);
      return;
    }
    setProfileLoaded(false);
    setTxnsLoaded(false);
    setProfileError(null);
    setTxnError(null);

    refreshProfile();
    const unsub = listenTransactions(
      uid,
      (txns) => {
        setTransactions(txns);
        setTxnError(null);
        setTxnsLoaded(true);
      },
      (message) => {
        // Do not blank the list on a failed refresh — keep whatever we had
        // and let the screen say the load failed.
        setTxnError(message);
        setTxnsLoaded(true);
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