import { Ionicons } from "@expo/vector-icons";
import { Link, router, useLocalSearchParams } from "expo-router";
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
import { PasswordRules } from "../../components/ui/password-rules";
import { theme } from "../../constants/theme";
import { isValidPassword } from "../../lib/password";
import { supabase } from "../../lib/supabase";

const capy = require("../../assets/capy-chill.png");

/**
 * Second half of the reset: the six-digit code from the email, plus the new
 * password.
 *
 * A code rather than a tapped link. A link has to deep-link back into the app,
 * which is unreliable in Expo Go (the scheme is exp://, not tabara://) and
 * needs the redirect URL allow-listed. A code works from any mail client on
 * any device, including the emulator.
 */
export default function ResetPassword() {
  const { email } = useLocalSearchParams<{ email?: string }>();

  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;
  const matched = confirm.length > 0 && password === confirm;

  const handleReset = async () => {
    if (!email) {
      Alert.alert("Something went wrong", "Start again from the login screen.");
      router.replace("/(auth)/forgot-password");
      return;
    }
    if (code.trim().length < 6) {
      Alert.alert("Check the code", "Enter the 6-digit code from your email.");
      return;
    }
    if (!isValidPassword(password)) {
      Alert.alert(
        "Password too weak",
        "Your new password needs to meet every requirement listed."
      );
      return;
    }
    if (password !== confirm) {
      Alert.alert("Passwords don't match", "Retype the same password in both fields.");
      return;
    }

    setLoading(true);
    try {
      // The code proves the person holds the mailbox. Verifying it returns a
      // real session, which is what authorises the password change below —
      // updateUser alone would fail without one.
      const { error: otpError } = await supabase.auth.verifyOtp({
        email: String(email),
        token: code.trim(),
        type: "recovery",
      });
      if (otpError) {
        Alert.alert(
          "That code didn't work",
          "It may have expired or been typed wrong. Request a new one."
        );
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      Alert.alert("Password updated", "You're all set — welcome back 🦫");
      router.replace("/(tabs)");
    } catch (e: any) {
      Alert.alert("Couldn't update password", e.message ?? "Try again.");
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
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>
          {email
            ? `We sent a 6-digit code to ${email}. Enter it below with your new password.`
            : "Enter the code we sent you, along with your new password."}
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>RESET CODE</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="keypad-outline" size={18} color={theme.muted} />
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="123456"
              placeholderTextColor={theme.muted}
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={setCode}
            />
          </View>

          <Text style={[styles.label, { marginTop: theme.space.base }]}>
            NEW PASSWORD
          </Text>
          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={18} color={theme.muted} />
            <TextInput
              style={styles.input}
              placeholder="Create a new password"
              placeholderTextColor={theme.muted}
              secureTextEntry={!show}
              value={password}
              onChangeText={setPassword}
              returnKeyType="next"
            />
            <Pressable onPress={() => setShow((s) => !s)} hitSlop={8}>
              <Ionicons
                name={show ? "eye-off-outline" : "eye-outline"}
                size={18}
                color={theme.muted}
              />
            </Pressable>
          </View>

          {password.length > 0 && <PasswordRules value={password} />}

          <Text style={[styles.label, { marginTop: theme.space.base }]}>
            CONFIRM NEW PASSWORD
          </Text>
          <View
            style={[
              styles.inputWrap,
              mismatch && { borderColor: theme.danger },
              matched && { borderColor: theme.income },
            ]}
          >
            <Ionicons name="lock-closed-outline" size={18} color={theme.muted} />
            <TextInput
              style={styles.input}
              placeholder="Retype your new password"
              placeholderTextColor={theme.muted}
              secureTextEntry={!show}
              value={confirm}
              onChangeText={setConfirm}
              onSubmitEditing={handleReset}
              returnKeyType="go"
            />
            {matched && (
              <Ionicons name="checkmark-circle" size={18} color={theme.income} />
            )}
          </View>

          {mismatch && (
            <Text style={styles.helper}>Passwords don&apos;t match yet</Text>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.button,
              (loading || pressed) && { opacity: 0.7 },
            ]}
            onPress={handleReset}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? "Updating…" : "Set new password"}
            </Text>
          </Pressable>
        </View>

        <Link href="/(auth)/forgot-password" style={styles.link}>
          Didn&apos;t get it? <Text style={styles.linkBold}>Send again</Text>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { flexGrow: 1, justifyContent: "center", padding: theme.space.xl },
  capy: { width: 84, height: 84, alignSelf: "center" },
  title: {
    fontSize: theme.size.display,
    fontWeight: "800",
    color: theme.text,
    textAlign: "center",
    letterSpacing: -0.4,
    marginTop: theme.space.md,
  },
  subtitle: {
    fontSize: theme.size.body,
    color: theme.primaryDark,
    textAlign: "center",
    marginTop: theme.space.xs,
    marginBottom: theme.space.lg,
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
  // Codes are read digit by digit — spacing them out makes transcription
  // errors visible before submitting.
  codeInput: { letterSpacing: 8, fontWeight: "800", fontSize: 18 },
  helper: {
    fontSize: theme.size.caption,
    color: theme.danger,
    marginTop: theme.space.sm,
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
