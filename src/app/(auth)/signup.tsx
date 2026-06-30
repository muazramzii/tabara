import { useState } from "react";
import {
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Link, router } from "expo-router";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { theme } from "../../constants/theme";

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
      await createUserWithEmailAndPassword(auth, email.trim(), password);
      router.replace("/onboarding");
    } catch (e: any) {
      Alert.alert("Sign up failed", e.message ?? "Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.title}>Create your account</Text>
      <Text style={styles.subtitle}>Your capybara is waiting. 🦫</Text>

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

      <Pressable
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSignup}
        disabled={loading}
      >
        <Text style={styles.buttonText}>{loading ? "..." : "Sign up"}</Text>
      </Pressable>

      <Link href="/(auth)/login" style={styles.link}>
        Already have an account? Log in
      </Link>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg, justifyContent: "center", padding: 24 },
  title: { fontSize: 26, fontWeight: "700", color: theme.text, textAlign: "center" },
  subtitle: { fontSize: 15, color: theme.muted, textAlign: "center", marginBottom: 32 },
  input: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: theme.text,
    marginBottom: 12,
  },
  button: {
    backgroundColor: theme.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  link: { color: theme.accent, textAlign: "center", marginTop: 20, fontSize: 15 },
});
