import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import { theme } from "../constants/theme";

// Moved out of the (auth) group so a freshly-signed-up user can reach it
// (the route guard would otherwise treat (auth) screens as login-only).
export default function Onboarding() {
  const [income, setIncome] = useState("");
  const [goal, setGoal] = useState("");

  // NEXT STEP: write { income, goal } to users/{uid} in Firestore here.
  const finish = () => router.replace("/(tabs)");

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🦫</Text>
      <Text style={styles.title}>Let's set you up</Text>
      <Text style={styles.subtitle}>Just two quick things.</Text>

      <Text style={styles.label}>Monthly income (RM)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 2500"
        placeholderTextColor={theme.muted}
        keyboardType="numeric"
        value={income}
        onChangeText={setIncome}
      />

      <Text style={styles.label}>Monthly savings goal (RM)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 500"
        placeholderTextColor={theme.muted}
        keyboardType="numeric"
        value={goal}
        onChangeText={setGoal}
      />

      <Pressable style={styles.button} onPress={finish}>
        <Text style={styles.buttonText}>Finish setup</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg, justifyContent: "center", padding: 24 },
  emoji: { fontSize: 56, textAlign: "center" },
  title: { fontSize: 26, fontWeight: "700", color: theme.text, textAlign: "center", marginTop: 8 },
  subtitle: { fontSize: 15, color: theme.muted, textAlign: "center", marginBottom: 28 },
  label: { fontSize: 14, color: theme.text, marginBottom: 6, fontWeight: "500" },
  input: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: theme.text,
    marginBottom: 18,
  },
  button: {
    backgroundColor: theme.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 4,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
