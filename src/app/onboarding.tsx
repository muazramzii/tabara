import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { theme } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import { saveUserProfile } from "../lib/db";
import { useFinance } from "../lib/finance-context";

const capy = require("../assets/capy-party.png");

export default function Onboarding() {
  const { user } = useAuth();
  const { profile, loading, refreshProfile } = useFinance();
  const [income, setIncome] = useState("");
  const [goal, setGoal] = useState("");
  const [saving, setSaving] = useState(false);

  // Anyone who has already set an income has been through this screen before,
  // so send them straight to the app. Social sign-in routes every login here,
  // including people who set up months ago, and without this they were asked
  // to re-enter their income every single time they logged in.
  //
  // Waits for loading to finish first. The profile arrives after the session,
  // so deciding early would bounce an existing user through the form anyway.
  const alreadySetUp = (profile?.income ?? 0) > 0;

  useEffect(() => {
    if (loading || saving) return;
    if (alreadySetUp) router.replace("/(tabs)");
  }, [loading, saving, alreadySetUp]);

  // Hold the screen blank rather than flashing the form at someone who is
  // about to be redirected out of it.
  if (loading || alreadySetUp) {
    return (
      <View style={[styles.screen, styles.centred]}>
        <ActivityIndicator color={theme.primary} size="large" />
      </View>
    );
  }

  // ── unchanged: save + validation ─────────────────────────
  const finish = async () => {
    const incomeNum = parseFloat(income) || 0;
    const goalNum = parseFloat(goal) || 0;
    if (goalNum > incomeNum) {
      Alert.alert("Hmm 🦫", "Savings goal can't be more than your income.");
      return;
    }
    if (user) {
      setSaving(true);
      try {
        await saveUserProfile(user.id, { income: incomeNum, savingsGoal: goalNum });
        // Pull the new figures into the shared provider before leaving.
        // Without this the context still holds the pre-onboarding profile,
        // so Home opens showing an income of zero for the person who just
        // finished typing their income in.
        await refreshProfile();
      } catch (e: any) {
        Alert.alert("Couldn't save", e.message ?? "Try again.");
        setSaving(false);
        return;
      }
    }
    router.replace("/(tabs)");
  };

  // Live preview of what the numbers mean, so the 50/30/20 rule isn't a
  // surprise on the Home screen afterwards.
  const inc = parseFloat(income) || 0;
  const g = parseFloat(goal) || 0;
  const spendable = Math.max(inc - g, 0);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Image source={capy} style={styles.capy} resizeMode="contain" />
        <Text style={styles.title}>Let&apos;s set you up</Text>
        <Text style={styles.subtitle}>Just two quick things.</Text>

        <View style={styles.card}>
          <Text style={styles.label}>MONTHLY INCOME (RM)</Text>
          <View style={styles.inputWrap}>
            <Text style={styles.rm}>RM</Text>
            <TextInput
              style={styles.input}
              placeholder="2500"
              placeholderTextColor={theme.muted}
              keyboardType="numeric"
              value={income}
              onChangeText={setIncome}
            />
          </View>

          <Text style={[styles.label, { marginTop: theme.space.lg }]}>
            MONTHLY SAVINGS GOAL (RM)
          </Text>
          <View style={styles.inputWrap}>
            <Text style={styles.rm}>RM</Text>
            <TextInput
              style={styles.input}
              placeholder="500"
              placeholderTextColor={theme.muted}
              keyboardType="numeric"
              value={goal}
              onChangeText={setGoal}
            />
          </View>

          {inc > 0 && (
            <View style={styles.preview}>
              <Ionicons name="wallet-outline" size={17} color={theme.primaryDark} />
              <Text style={styles.previewText}>
                That leaves{" "}
                <Text style={styles.previewStrong}>RM {spendable.toFixed(2)}</Text> to spend
                each month.
              </Text>
            </View>
          )}

          <Pressable
            style={({ pressed }) => [styles.button, (saving || pressed) && { opacity: 0.7 }]}
            onPress={finish}
            disabled={saving}
          >
            <Text style={styles.buttonText}>{saving ? "Saving..." : "Finish setup"}</Text>
          </Pressable>
        </View>

        <Text style={styles.footnote}>You can change these any time in Profile.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centred: { alignItems: "center", justifyContent: "center" },
  screen: { flex: 1, backgroundColor: theme.bg },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: theme.space.xl,
  },
  capy: { width: 104, height: 104, alignSelf: "center" },
  title: {
    fontSize: theme.size.display,
    fontWeight: "800",
    color: theme.text,
    textAlign: "center",
    marginTop: theme.space.sm,
  },
  subtitle: {
    fontSize: theme.size.body,
    color: theme.muted,
    textAlign: "center",
    marginBottom: theme.space.xl,
  },
  card: {
    backgroundColor: theme.card,
    borderRadius: theme.radius.lg,
    padding: theme.space.lg,
    borderWidth: 1,
    borderColor: theme.border,
    ...theme.shadow,
  },
  label: {
    fontSize: theme.size.caption,
    color: theme.muted,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginBottom: theme.space.sm,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.sm,
    backgroundColor: theme.bg,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.base,
  },
  rm: { fontSize: theme.size.body, fontWeight: "700", color: theme.muted },
  input: {
    flex: 1,
    paddingVertical: theme.space.base,
    fontSize: theme.size.section + 3,
    fontWeight: "800",
    color: theme.text,
  },
  preview: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.sm,
    backgroundColor: theme.accentSoft,
    borderRadius: theme.radius.sm,
    padding: theme.space.md,
    marginTop: theme.space.base,
  },
  previewText: { flex: 1, fontSize: theme.size.label, color: theme.primaryDark, lineHeight: 18 },
  previewStrong: { fontWeight: "800" },
  button: {
    backgroundColor: theme.primaryDark,
    borderRadius: theme.radius.md,
    padding: theme.space.base + 2,
    alignItems: "center",
    marginTop: theme.space.lg,
  },
  buttonText: { color: "#fff", fontSize: theme.size.body, fontWeight: "800" },
  footnote: {
    fontSize: theme.size.caption,
    color: theme.muted,
    textAlign: "center",
    marginTop: theme.space.base,
  },
});
