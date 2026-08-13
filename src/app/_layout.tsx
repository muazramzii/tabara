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
import { setupFonts } from "../lib/setup-fonts";

setupFonts();

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
      router.replace("/(auth)/login");
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
  });

  if (!fontsLoaded) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={theme.primary} size="large" />
      </View>
    );
  }

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