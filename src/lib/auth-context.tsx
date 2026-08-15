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
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({} as AuthState);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

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

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Already signed out, or the token was rejected — either way the local
      // session is what matters and Supabase clears it regardless.
    }
  };

  return (
    <AuthContext.Provider value={{ user, initializing, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
