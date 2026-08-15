import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../../constants/theme";
import { PopIn } from "./motion";

// The capybara is the most distinctive thing about Tabara, so an empty screen
// is exactly where it belongs — that's a new user's very first impression.
const CAPY = {
  chill: require("../../assets/capy-chill.png"),
  careful: require("../../assets/capy-careful.png"),
  sad: require("../../assets/capy-sad.png"),
  party: require("../../assets/capy-party.png"),
};

export type CapyMood = keyof typeof CAPY;

/**
 * Empty state. Shows the capybara by default; pass `icon` instead when an
 * illustration would be too much — a search with no matches, say.
 */
export function EmptyState({
  capy = "chill",
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  capy?: CapyMood;
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.center}>
      {icon ? (
        <View style={styles.emptyIcon}>
          <Ionicons name={icon} size={30} color={theme.muted} />
        </View>
      ) : (
        <PopIn>
          <Image source={CAPY[capy]} style={styles.capy} resizeMode="contain" />
        </PopIn>
      )}
      <Text style={styles.emptyTitle}>{title}</Text>
      {!!message && <Text style={styles.muted}>{message}</Text>}
      {!!actionLabel && !!onAction && (
        <Pressable
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.75 }]}
          onPress={onAction}
        >
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * Friendly error state with a retry. Keeps whatever retry logic the caller
 * already has — this only renders it.
 */
export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.center}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.danger + "18" }]}>
        <Ionicons name="cloud-offline-outline" size={30} color={theme.danger} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {!!message && <Text style={styles.muted}>{message}</Text>}
      {!!onRetry && (
        <Pressable style={styles.button} onPress={onRetry}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * A single shimmering placeholder block. Uses Animated (built into RN) rather
 * than pulling in a skeleton library.
 */
export function Skeleton({
  height = 16,
  width = "100%",
  radius = theme.radius.sm,
  style,
}: {
  height?: number;
  width?: number | `${number}%`;
  radius?: number;
  style?: any;
}) {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        { height, width, borderRadius: radius, backgroundColor: theme.border, opacity: pulse },
        style,
      ]}
    />
  );
}

/** Skeleton stand-in for a list of transaction rows. */
export function TransactionSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <View style={{ gap: theme.space.sm }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.skelRow}>
          <Skeleton height={42} width={42} radius={theme.radius.sm} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton height={13} width="55%" />
            <Skeleton height={11} width="35%" />
          </View>
          <Skeleton height={14} width={64} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    paddingHorizontal: theme.space.xl,
    gap: theme.space.sm,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.cardAlt,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.space.xs,
  },
  // Deliberately modest. The illustration is a friendly touch on an empty
  // screen, not the subject of it — the message and the action matter more.
  capy: { width: 96, height: 96, marginBottom: theme.space.sm },
  emptyTitle: { fontSize: theme.size.section, fontWeight: "700", color: theme.text },
  muted: {
    fontSize: theme.size.body,
    color: theme.muted,
    textAlign: "center",
    lineHeight: 21,
  },
  button: {
    marginTop: theme.space.md,
    backgroundColor: theme.primary,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.xl,
    paddingVertical: theme.space.md,
  },
  buttonText: { color: "#fff", fontSize: theme.size.body, fontWeight: "700" },
  skelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.md,
    backgroundColor: theme.card,
    borderRadius: theme.radius.md,
    padding: theme.space.base,
    borderWidth: 1,
    borderColor: theme.border,
  },
});
