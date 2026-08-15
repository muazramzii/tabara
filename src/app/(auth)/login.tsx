import { Ionicons } from "@expo/vector-icons";
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
  View,
} from "react-native";
import { SocialAuth } from "../../components/ui/social-buttons";
import { theme } from "../../constants/theme";
import { useAuth } from "../../lib/auth-context";
import { supabase } from "../../lib/supabase";

const capy = require("../../assets/capy-chill.png");

export default function Login() {
  const { enterGuest } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // ── unchanged: auth ──────────────────────────────────────
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
        <Text style={styles.logo}>Tabara</Text>
        <Text style={styles.tagline}>Chill about your money.</Text>

        <View style={styles.card}>
          <Text style={styles.label}>EMAIL</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="mail-outline" size={18} color={theme.muted} />
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={theme.muted}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <Text style={[styles.label, { marginTop: theme.space.base }]}>PASSWORD</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={18} color={theme.muted} />
            <TextInput
              style={styles.input}
              placeholder="Your password"
              placeholderTextColor={theme.muted}
              secureTextEntry={!showPassword}
              autoComplete="password"
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={handleLogin}
              returnKeyType="go"
            />
            <Pressable onPress={() => setShowPassword((s) => !s)} hitSlop={8}>
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={18}
                color={theme.muted}
              />
            </Pressable>
          </View>

          <Link href="/(auth)/forgot-password" style={styles.forgot}>
            Forgot password?
          </Link>

          <Pressable
            style={({ pressed }) => [styles.button, (loading || pressed) && { opacity: 0.7 }]}
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? "Logging in…" : "Log in"}</Text>
          </Pressable>

          <SocialAuth />
        </View>

        <Link href="/(auth)/signup" style={styles.link}>
          No account yet? <Text style={styles.linkBold}>Sign up</Text>
        </Link>

        <Pressable onPress={enterGuest} style={styles.devSkip} hitSlop={8}>
          <Text style={styles.devSkipText}>Skip to app (dev) →</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { flexGrow: 1, justifyContent: "center", padding: theme.space.xl },
  capy: { width: 112, height: 112, alignSelf: "center" },
  logo: {
    fontFamily: theme.font.displayBold,
    fontSize: 44,
    color: theme.primary,
    textAlign: "center",
    letterSpacing: 0.4,
    marginTop: theme.space.base,
  },
  // The capybara above already says "friendly" — the emoji was saying it twice.
  tagline: {
    fontSize: theme.size.body,
    color: theme.muted,
    textAlign: "center",
    marginTop: 2,
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
    fontWeight: "800",
    color: theme.muted,
    letterSpacing: 0.6,
    marginBottom: theme.space.sm,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.md,
    backgroundColor: theme.bg,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.base,
  },
  input: {
    flex: 1,
    paddingVertical: theme.space.base,
    fontSize: theme.size.body,
    color: theme.text,
  },
  forgot: {
    color: theme.accent,
    fontWeight: "700",
    fontSize: theme.size.caption,
    textAlign: "right",
    marginTop: theme.space.md,
  },
  button: {
    backgroundColor: theme.primaryDark,
    borderRadius: theme.radius.md,
    padding: theme.space.base + 2,
    alignItems: "center",
    marginTop: theme.space.lg,
  },
  buttonText: { color: "#fff", fontSize: theme.size.body, fontWeight: "800" },
  link: {
    color: theme.muted,
    textAlign: "center",
    marginTop: theme.space.xl,
    fontSize: theme.size.body,
  },
  linkBold: { color: theme.accent, fontWeight: "800" },
  // Deliberately quiet: this is a development escape hatch, not a third way
  // to sign in, and it shouldn't compete with the real actions above it.
  devSkip: { marginTop: theme.space.xl, alignItems: "center" },
  devSkipText: {
    color: theme.muted,
    fontSize: theme.size.caption,
    opacity: 0.7,
  },
});
