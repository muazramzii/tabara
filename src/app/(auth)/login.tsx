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
import { useAuth } from "../../lib/auth-context";
import { supabase } from "../../lib/supabase";

const capy = require("../../assets/capy-chill.png");

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
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      router.replace("/(tabs)");
    } catch (e: any) {
      Alert.alert("Login failed", e.message ?? "Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Image source={capy} style={styles.capy} resizeMode="contain" />
        <Text style={styles.logo}>Tabara</Text>
        <Text style={styles.tagline}>Chill about your money. 🦫</Text>

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
            placeholder="Password"
            placeholderTextColor={theme.muted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <Pressable style={[styles.button, loading && styles.buttonDisabled]} onPress={handleLogin} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? "..." : "Log in"}</Text>
          </Pressable>
        </View>

        <Link href="/(auth)/signup" style={styles.link}>
          No account yet? <Text style={styles.linkBold}>Sign up</Text>
        </Link>

        <Pressable onPress={enterGuest} style={styles.devSkip}>
          <Text style={styles.devSkipText}>Skip to app (dev) →</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

import { View } from "react-native";
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { flexGrow: 1, justifyContent: "center", padding: 24 },
  capy: { width: 110, height: 110, alignSelf: "center" },
  logo: { fontSize: 40, fontWeight: "800", color: theme.primary, textAlign: "center", marginTop: 6 },
  tagline: { fontSize: 15, color: theme.muted, textAlign: "center", marginBottom: 26 },
  card: { backgroundColor: theme.card, borderRadius: theme.radius.lg, padding: 18, borderWidth: 1, borderColor: theme.border, ...theme.shadow },
  input: { backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius.md, padding: 14, fontSize: 16, color: theme.text, marginBottom: 12 },
  button: { backgroundColor: theme.primary, borderRadius: theme.radius.md, padding: 16, alignItems: "center", marginTop: 4 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  link: { color: theme.muted, textAlign: "center", marginTop: 22, fontSize: 15 },
  linkBold: { color: theme.accent, fontWeight: "700" },
  devSkip: { marginTop: 24, alignItems: "center" },
  devSkipText: { color: theme.muted, fontSize: 13 },
});