import {
  Fredoka_500Medium,
  Fredoka_600SemiBold,
  Fredoka_700Bold,
} from "@expo-google-fonts/fredoka";
import {
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/nunito";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { theme } from "../constants/theme";
import { AuthProvider, useAuth } from "../lib/auth-context";
import { StreakCelebration } from "../components/ui/streak-celebration";
import { FinanceProvider } from "../lib/finance-context";
import { setupFonts } from "../lib/setup-fonts";

setupFonts();

function RootNavigator() {
  const { user, guest, initializing } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (initializing) return;
    const inAuthGroup = segments[0] === "(auth)";
    const signedIn = !!user || guest;
    // Everything outside the auth group is protected. This used to name the
    // protected routes explicitly, which quietly missed the screens that live
    // at the root rather than inside (tabs) — profile, budgets, notifications.
    // Logging out from any of those left you sitting on the same screen.
    // Stated this way, a new screen is protected by default.
    if (!signedIn && !inAuthGroup) {
      router.replace("/(auth)/welcome");
    } else if (guest && inAuthGroup) {
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
  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    // Display face, used only where a typeface should have personality —
    // the wordmark. Nunito stays the workhorse for everything else.
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={theme.primary} size="large" />
      </View>
    );
  }

  return (
    // FinanceProvider sits here rather than inside (tabs) so routes outside
    // the tab group — profile, budgets, notifications — can use useFinance()
    // too. It must stay inside AuthProvider, which it depends on for the uid,
    // and it loads nothing until someone is signed in.
    <AuthProvider>
      <FinanceProvider>
        <StatusBar style="dark" />
        <RootNavigator />
        {/* Renders above every route, so the burst lands whether the streak
            ticked up from the Add screen or from Kapy recording something. */}
        <StreakCelebration />
      </FinanceProvider>
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