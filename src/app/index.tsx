import { Redirect } from "expo-router";
import { useAuth } from "../lib/auth-context";

// Decides the first screen based on whether a session was restored.
export default function Index() {
  const { user, initializing } = useAuth();
  if (initializing) return null; // root layout already shows the loader
  // Signed-out people start at the welcome screen and pick their own path;
  // anyone with a session skips it entirely and never sees it.
  return <Redirect href={user ? "/(tabs)" : "/(auth)/welcome"} />;
}
