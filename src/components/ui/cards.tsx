import { Ionicons } from "@expo/vector-icons";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { theme } from "../../constants/theme";
import { fmt } from "../../lib/format";
import { CountUp, useEntrance } from "./motion";

/** Plain white surface. The base every other card sits on. */
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  // StyleProp so callers can pass conditional styles like
  // [base, isActive && highlight] without a cast.
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Section heading with an optional right-hand action. */
export function SectionHeader({
  title,
  subtitle,
  actionLabel,
  onAction,
  // Set when the header sits *inside* a Card — drops the leading margin that
  // only makes sense when it's floating above one.
  inCard = false,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  inCard?: boolean;
}) {
  return (
    <View style={[styles.sectionRow, inCard && styles.sectionRowInCard]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.sectionSub}>{subtitle}</Text>}
      </View>
      {!!actionLabel && !!onAction && (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * The hero balance card — the brown block at the top of Home.
 * All three figures are passed in; this component never computes money.
 */
export function BalanceCard({
  label,
  balance,
  income,
  expense,
}: {
  label: string;
  balance: number;
  income: number;
  expense: number;
}) {
  return (
    <View style={styles.hero}>
      <Text style={styles.heroLabel}>{label}</Text>
      <CountUp
        value={balance}
        format={fmt}
        style={styles.heroValue}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      />

      <View style={styles.heroSplit}>
        <View style={styles.heroItem}>
          <Ionicons name="arrow-down-circle" size={18} color={theme.incomeSoft} />
          <View style={{ flex: 1 }}>
            <Text style={styles.heroItemLabel}>Income</Text>
            <Text style={styles.heroItemValue} numberOfLines={1}>
              {fmt(income)}
            </Text>
          </View>
        </View>

        <View style={styles.heroDivider} />

        <View style={styles.heroItem}>
          <Ionicons name="arrow-up-circle" size={18} color={theme.expenseSoft} />
          <View style={{ flex: 1 }}>
            <Text style={styles.heroItemLabel}>Expense</Text>
            <Text style={styles.heroItemValue} numberOfLines={1}>
              {fmt(expense)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/** Compact metric tile — three across on Profile. */
export function StatCard({
  icon,
  value,
  label,
  tint = theme.accent,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  tint?: string;
}) {
  return (
    <View style={styles.stat}>
      <View style={[styles.statIcon, { backgroundColor: tint + "22" }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Progress track that fills on mount rather than appearing at full width.
 * `pct` is already clamped by the caller.
 */
export function ProgressBar({
  pct,
  color = theme.accent,
  height = 9,
  animate = true,
}: {
  pct: number;
  color?: string;
  height?: number;
  animate?: boolean;
}) {
  const target = Math.max(0, Math.min(pct, 100));
  const entrance = useEntrance(750, 120);

  const width = animate
    ? entrance.interpolate({
        inputRange: [0, 1],
        outputRange: ["0%", `${target}%`],
      })
    : (`${target}%` as const);

  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      <Animated.View
        style={{
          width,
          height,
          borderRadius: height / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/** Labelled progress row: "Needs (50%)   RM 337 / 614" over a bar. */
export function ProgressRow({
  label,
  spent,
  target,
  color,
  goodIsHigh = false,
}: {
  label: string;
  spent: number;
  target: number;
  color: string;
  goodIsHigh?: boolean;
}) {
  const pct = target > 0 ? Math.min((spent / target) * 100, 100) : 0;
  const over = !goodIsHigh && target > 0 && spent > target;

  return (
    <View style={{ marginBottom: theme.space.md }}>
      {/* Stacked rather than side by side: inside a half-width card the label
          and the two amounts can't share a line, and space-between silently
          lets them overflow instead of wrapping. */}
      <Text style={styles.progressLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[styles.progressAmt, over && { color: theme.danger }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {fmt(spent)}
        <Text style={styles.progressTarget}> / {fmt(target)}</Text>
      </Text>
      <ProgressBar pct={pct} color={over ? theme.danger : color} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.card,
    borderRadius: theme.radius.lg,
    padding: theme.space.lg,
    borderWidth: 1,
    borderColor: theme.border,
    ...theme.shadowSm,
  },

  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: theme.space.sm,
    marginBottom: theme.space.sm,
  },
  sectionRowInCard: { marginTop: 0, marginBottom: theme.space.base },
  sectionTitle: { fontSize: theme.size.section, fontWeight: "800", color: theme.text },
  sectionSub: { fontSize: theme.size.label, color: theme.muted, marginTop: 1 },
  sectionAction: { fontSize: theme.size.label, fontWeight: "700", color: theme.primary },

  hero: {
    backgroundColor: theme.primaryDark,
    borderRadius: theme.radius.xl,
    padding: theme.space.xl,
    ...theme.shadow,
  },
  heroLabel: { color: theme.onDarkMuted, fontSize: theme.size.label, fontWeight: "600" },
  heroValue: {
    color: theme.onDark,
    fontSize: theme.size.hero,
    fontWeight: "800",
    // Tight tracking makes the biggest number on screen read as the headline
    // rather than as more body text.
    letterSpacing: -1,
    marginTop: theme.space.xs,
  },
  heroSplit: { flexDirection: "row", alignItems: "center", marginTop: theme.space.lg },
  heroItem: { flexDirection: "row", alignItems: "center", gap: theme.space.sm, flex: 1 },
  heroDivider: {
    width: 1,
    height: 32,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginHorizontal: theme.space.sm,
  },
  heroItemLabel: { color: theme.onDarkMuted, fontSize: theme.size.caption },
  heroItemValue: { color: theme.onDark, fontSize: theme.size.body, fontWeight: "700", marginTop: 1 },

  stat: {
    flex: 1,
    backgroundColor: theme.card,
    borderRadius: theme.radius.md,
    paddingVertical: theme.space.base,
    paddingHorizontal: theme.space.sm,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.border,
    ...theme.shadowSm,
  },
  statIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.space.sm,
  },
  statValue: { fontSize: theme.size.section, fontWeight: "800", color: theme.text },
  statLabel: {
    fontSize: theme.size.caption,
    color: theme.muted,
    marginTop: 2,
    textAlign: "center",
  },

  track: { backgroundColor: theme.border, overflow: "hidden", width: "100%" },
  progressLabel: { fontSize: theme.size.caption, fontWeight: "700", color: theme.text },
  progressAmt: {
    fontSize: theme.size.caption,
    fontWeight: "800",
    color: theme.text,
    marginTop: 1,
    marginBottom: 5,
  },
  progressTarget: { fontWeight: "400", color: theme.muted },
});
