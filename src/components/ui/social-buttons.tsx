import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../../constants/theme";
import { signInWithProvider, type OAuthProvider } from "../../lib/oauth";

/**
 * "Or continue with" divider plus the social buttons, shared by login and
 * signup — the two screens do exactly the same thing here, and OAuth makes no
 * distinction between signing up and signing in.
 */
export function SocialAuth() {
  const [busy, setBusy] = useState<OAuthProvider | null>(null);

  const handle = async (provider: OAuthProvider) => {
    setBusy(provider);
    const result = await signInWithProvider(provider);
    setBusy(null);

    if (result.ok) {
      // Everyone goes to onboarding; it redirects straight out again for
      // anyone who already has an income set. This comment used to claim that
      // was already true when it was not, and returning users were asked to
      // re-enter their income on every social login as a result.
      router.replace("/onboarding");
      return;
    }
    // Backing out of the browser isn't an error worth interrupting anyone for.
    if (result.cancelled) return;
    Alert.alert("Couldn't sign in", result.message ?? "Try again.");
  };

  return (
    <View>
      <View style={styles.dividerRow}>
        <View style={styles.rule} />
        <Text style={styles.dividerText}>Or</Text>
        <View style={styles.rule} />
      </View>

      <View style={styles.row}>
        <SocialButton
          label="Google"
          icon="logo-google"
          color="#DB4437"
          loading={busy === "google"}
          disabled={busy !== null}
          onPress={() => handle("google")}
        />
        <SocialButton
          label="Facebook"
          icon="logo-facebook"
          color="#1877F2"
          loading={busy === "facebook"}
          disabled={busy !== null}
          onPress={() => handle("facebook")}
        />
      </View>
    </View>
  );
}

function SocialButton({
  label,
  icon,
  color,
  loading,
  disabled,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        pressed && { opacity: 0.7 },
        // Only the button being used dims — dimming both would suggest the
        // whole screen is stuck rather than one request being in flight.
        disabled && !loading && { opacity: 0.45 },
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      {loading ? (
        <ActivityIndicator size="small" color={theme.primaryDark} />
      ) : (
        <Ionicons name={icon} size={18} color={color} />
      )}
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.md,
    marginTop: theme.space.xl,
    marginBottom: theme.space.base,
  },
  rule: { flex: 1, height: 1, backgroundColor: theme.border },
  dividerText: {
    fontSize: theme.size.caption,
    color: theme.muted,
    fontWeight: "700",
  },
  row: { flexDirection: "row", gap: theme.space.md },
  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.space.sm,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.md,
    paddingVertical: theme.space.md + 2,
    ...theme.shadowSm,
  },
  buttonText: {
    fontSize: theme.size.body,
    fontWeight: "700",
    color: theme.text,
  },
});
