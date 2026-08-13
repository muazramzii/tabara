import { router } from "expo-router";
import { useState } from "react";
import {
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

const capy = require("../assets/capy-party.png");

export default function Onboarding() {
  const { user } = useAuth();
  const [income, setIncome] = useState("");
  const [goal, setGoal] = useState("");
  const [saving, setSaving] = useState(false);

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
      } catch (e: any) {
        Alert.alert("Couldn't save", e.message ?? "Try again.");
        setSaving(false);
        return;
      }
    }
    router.replace("/(tabs)");
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Image source={capy} style={styles.capy} resizeMode="contain" />
        <Text style={styles.title}>Let's set you up</Text>
        <Text style={styles.subtitle}>Just two quick things.</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Monthly income (RM)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 2500"
            placeholderTextColor={theme.muted}
            keyboardType="numeric"
            value={income}
            onChangeText={setIncome}
          />
          <Text style={[styles.label, { marginTop: 14 }]}>Monthly savings goal (RM)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 500"
            placeholderTextColor={theme.muted}
            keyboardType="numeric"
            value={goal}
            onChangeText={setGoal}
          />
          <Pressable style={[styles.button, saving && { opacity: 0.6 }]} onPress={finish} disabled={saving}>
            <Text style={styles.buttonText}>{saving ? "Saving..." : "Finish setup"}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { flexGrow: 1, justifyContent: "center", padding: 24 },
  capy: { width: 100, height: 100, alignSelf: "center" },
  title: { fontSize: 26, fontWeight: "800", color: theme.text, textAlign: "center", marginTop: 6 },
  subtitle: { fontSize: 15, color: theme.muted, textAlign: "center", marginBottom: 26 },
  card: { backgroundColor: theme.card, borderRadius: theme.radius.lg, padding: 18, borderWidth: 1, borderColor: theme.border, ...theme.shadow },
  label: { fontSize: 13, color: theme.muted, fontWeight: "600", marginBottom: 6 },
  input: { backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius.md, padding: 14, fontSize: 16, color: theme.text },
  button: { backgroundColor: theme.primary, borderRadius: theme.radius.md, padding: 16, alignItems: "center", marginTop: 18 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});