import type { User } from "@supabase/supabase-js";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import { supabase } from "./supabase";

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
    // Restore a persisted session on launch...
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setInitializing(false);
    });

    // ...then track every login / logout / token refresh afterwards.
    // Keep this callback synchronous — awaiting Supabase calls inside it
    // can deadlock the auth client.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setInitializing(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const enterGuest = () => setGuest(true);

  const logout = async () => {
    setGuest(false);
    try {
      await supabase.auth.signOut();
    } catch {
      // no real session (e.g. guest mode) — nothing to sign out
    }
  };

  return (
    <AuthContext.Provider value={{ user, initializing, guest, enterGuest, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
