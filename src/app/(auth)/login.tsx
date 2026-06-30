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
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useAuth } from "../../lib/auth-context";
import { theme } from "../../constants/theme";

export default function Login() {
  const { enterGuest } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Hold on", "Please enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.replace("/(tabs)");
    } catch (e: any) {
      Alert.alert("Login failed", e.message ?? "Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.logo}>Tabara</Text>
      <Text style={styles.tagline}>Chill about your money. 🦫</Text>

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
        placeholder="Password"
        placeholderTextColor={theme.muted}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <Pressable
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={loading}
      >
        <Text style={styles.buttonText}>{loading ? "..." : "Log in"}</Text>
      </Pressable>

      <Link href="/(auth)/signup" style={styles.link}>
        No account yet? Sign up
      </Link>

      {/* TEMP dev shortcut — enters guest mode so you can explore before
          Firebase is configured. Delete once auth is enforced. */}
      <Pressable onPress={enterGuest} style={styles.devSkip}>
        <Text style={styles.devSkipText}>Skip to app (dev) →</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg, justifyContent: "center", padding: 24 },
  logo: { fontSize: 40, fontWeight: "700", color: theme.primary, textAlign: "center" },
  tagline: { fontSize: 15, color: theme.muted, textAlign: "center", marginBottom: 32 },
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
  devSkip: { marginTop: 28, alignItems: "center" },
  devSkipText: { color: theme.muted, fontSize: 13 },
});
