import { Link, router } from "expo-router";
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
} from "react-native";
import { theme } from "../../constants/theme";
import { supabase } from "../../lib/supabase";

const capy = require("../../assets/capy-chill.png");

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!email || password.length < 6) {
      Alert.alert("Hold on", "Enter an email and a password of at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (error) throw error;

      // With email confirmation enabled there's no session yet, so we can't
      // write a profile — send them to log in after confirming.
      if (!data.session) {
        Alert.alert(
          "Almost there",
          "Check your email for a confirmation link, then log in."
        );
        router.replace("/(auth)/login");
        return;
      }

      router.replace("/onboarding");
    } catch (e: any) {
      Alert.alert("Sign up failed", e.message ?? "Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Image source={capy} style={styles.capy} resizeMode="contain" />
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>Your capybara is waiting. 🦫</Text>

        <View style={styles.card}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={theme.muted}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password (min 6 chars)"
            placeholderTextColor={theme.muted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <Pressable style={[styles.button, loading && styles.buttonDisabled]} onPress={handleSignup} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? "..." : "Sign up"}</Text>
          </Pressable>
        </View>

        <Link href="/(auth)/login" style={styles.link}>
          Already have an account? <Text style={styles.linkBold}>Log in</Text>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

import { View } from "react-native";
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { flexGrow: 1, justifyContent: "center", padding: 24 },
  capy: { width: 90, height: 90, alignSelf: "center" },
  title: { fontSize: 26, fontWeight: "800", color: theme.text, textAlign: "center", marginTop: 6 },
  subtitle: { fontSize: 15, color: theme.muted, textAlign: "center", marginBottom: 26 },
  card: { backgroundColor: theme.card, borderRadius: theme.radius.lg, padding: 18, borderWidth: 1, borderColor: theme.border, ...theme.shadow },
  input: { backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius.md, padding: 14, fontSize: 16, color: theme.text, marginBottom: 12 },
  button: { backgroundColor: theme.primary, borderRadius: theme.radius.md, padding: 16, alignItems: "center", marginTop: 4 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  link: { color: theme.muted, textAlign: "center", marginTop: 22, fontSize: 15 },
  linkBold: { color: theme.accent, fontWeight: "700" },
});