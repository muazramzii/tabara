import { Redirect } from "expo-router";
import { useAuth } from "../lib/auth-context";

// Decides the first screen based on whether a session was restored.
export default function Index() {
  const { user, guest, initializing } = useAuth();
  if (initializing) return null; // root layout already shows the loader
  return <Redirect href={user || guest ? "/(tabs)" : "/(auth)/login"} />;
}
