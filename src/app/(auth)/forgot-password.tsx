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
import { theme } from "../../constants/theme";
import { supabase } from "../../lib/supabase";

const capy = require("../../assets/capy-careful.png");

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    const address = email.trim();
    if (!address) {
      Alert.alert("Hold on", "Enter the email address you signed up with.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(address);
      // A "user not found" error is deliberately not surfaced — see below.
      if (error && !/user|not found/i.test(error.message)) throw error;

      // Always report success, whether or not that address has an account.
      // Saying "no account with that email" would turn this screen into a way
      // for anyone to check which addresses are registered.
      router.push({
        pathname: "/(auth)/reset-password",
        params: { email: address },
      });
    } catch (e: any) {
      Alert.alert("Couldn't send the code", e.message ?? "Try again in a moment.");
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
        <Text style={styles.title}>Forgot your password?</Text>
        <Text style={styles.subtitle}>
          Enter your email and we&apos;ll send you a code to set a new one.
        </Text>

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
              onSubmitEditing={handleSend}
              returnKeyType="send"
            />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.button,
              (loading || pressed) && { opacity: 0.7 },
            ]}
            onPress={handleSend}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? "Sending…" : "Send reset code"}
            </Text>
          </Pressable>
        </View>

        <Link href="/(auth)/login" style={styles.link}>
          Remembered it? <Text style={styles.linkBold}>Log in</Text>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { flexGrow: 1, justifyContent: "center", padding: theme.space.xl },
  capy: { width: 96, height: 96, alignSelf: "center" },
  title: {
    fontSize: theme.size.display,
    fontWeight: "800",
    color: theme.text,
    textAlign: "center",
    letterSpacing: -0.4,
    marginTop: theme.space.base,
  },
  subtitle: {
    fontSize: theme.size.body,
    color: theme.primaryDark,
    textAlign: "center",
    marginTop: theme.space.xs,
    marginBottom: theme.space.xl,
    lineHeight: 21,
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
});
