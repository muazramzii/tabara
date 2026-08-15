import { router } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../../constants/theme";

const capy = require("../../assets/capy-party.png");

/**
 * First thing a signed-out person sees.
 *
 * Its whole job is to make the choice between "I'm new" and "I've been here
 * before" obvious, so neither group lands on the wrong form. Everything else
 * — fields, validation, providers — belongs to the screens it leads to.
 */
export default function Welcome() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.hero}>
        <Image source={capy} style={styles.capy} resizeMode="contain" />

        <Text style={styles.wordmark}>Tabara</Text>
        <Text style={styles.tagline}>
          Track your money without{"\n"}the boring spreadsheet.
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.primary, pressed && { opacity: 0.8 }]}
          onPress={() => router.push("/(auth)/signup")}
        >
          <Text style={styles.primaryText}>Get started</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.6 }]}
          onPress={() => router.push("/(auth)/login")}
        >
          <Text style={styles.secondaryText}>I already have an account</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.bg,
    paddingHorizontal: theme.space.xl,
  },
  hero: { flex: 1, alignItems: "center", justifyContent: "center" },
  capy: { width: 200, height: 200 },
  wordmark: {
    fontFamily: theme.font.displayBold,
    fontSize: 46,
    color: theme.primaryDark,
    letterSpacing: -0.5,
    lineHeight: 54,
    marginTop: theme.space.base,
  },
  tagline: {
    fontSize: theme.size.body,
    color: theme.primaryDark,
    textAlign: "center",
    lineHeight: 24,
    marginTop: theme.space.sm,
  },
  actions: { gap: theme.space.md, paddingBottom: theme.space.xl },
  primary: {
    backgroundColor: theme.primaryDark,
    borderRadius: theme.radius.md,
    paddingVertical: theme.space.base + 2,
    alignItems: "center",
  },
  primaryText: {
    color: "#fff",
    fontSize: theme.size.body,
    fontWeight: "800",
  },
  secondary: { paddingVertical: theme.space.md, alignItems: "center" },
  secondaryText: {
    color: theme.primaryDark,
    fontSize: theme.size.body,
    fontWeight: "700",
  },
});
