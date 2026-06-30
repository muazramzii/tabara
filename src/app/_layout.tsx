import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { AuthProvider, useAuth } from "../lib/auth-context";
import { theme } from "../constants/theme";

function RootNavigator() {
  const { user, guest, initializing } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (initializing) return;
    const inAuthGroup = segments[0] === "(auth)";
    const inProtected = segments[0] === "(tabs)" || segments[0] === "onboarding";
    const signedIn = !!user || guest;

    if (!signedIn && inProtected) {
      // Block protected screens when not signed in
      router.replace("/(auth)/login");
    } else if (guest && inAuthGroup) {
      // Dev guest tapped "Skip" — drop into the app
      router.replace("/(tabs)");
    }
  }, [user, guest, initializing, segments]);

  if (initializing) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={theme.primary} size="large" />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </AuthProvider>
  );
}

const styles = {
  loader: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: theme.bg,
  },
};
