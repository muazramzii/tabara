import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth } from "./firebase";

type AuthState = {
  user: User | null;
  initializing: boolean;
  guest: boolean; // dev-only escape hatch
  enterGuest: () => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({} as AuthState);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [guest, setGuest] = useState(false);

  useEffect(() => {
    // Fires once on launch (restoring a persisted session) and on every
    // login / logout afterwards.
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setInitializing(false);
    });
    return unsub;
  }, []);

  const enterGuest = () => setGuest(true);

  const logout = async () => {
    setGuest(false);
    try {
      await signOut(auth);
    } catch {
      // no real user (e.g. guest mode) — nothing to sign out
    }
  };

  return (
    <AuthContext.Provider value={{ user, initializing, guest, enterGuest, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
