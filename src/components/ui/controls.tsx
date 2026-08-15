import { Ionicons } from "@expo/vector-icons";
import { useRef } from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { theme } from "../../constants/theme";

/** Pill toggle — used for the month selector and the Latest/Needs/Wants filter. */
export function Chip({
  label,
  active,
  onPress,
  compact = false,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, compact && styles.chipCompact, active && styles.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

/** Horizontally scrolling row of pills that fits any number of options. */
export function ChipScroller({
  options,
  activeKey,
  onSelect,
}: {
  options: { key: string; label: string }[];
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollRow}
    >
      {options.map((o) => (
        <Chip
          key={o.key}
          label={o.label}
          active={o.key === activeKey}
          onPress={() => onSelect(o.key)}
          compact
        />
      ))}
    </ScrollView>
  );
}

/** Equal-width segmented control — Latest / Needs / Wants, Expense / Income. */
export function Segmented({
  options,
  activeKey,
  onSelect,
}: {
  options: { key: string; label: string }[];
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map((o) => {
        const active = o.key === activeKey;
        return (
          <Pressable
            key={o.key}
            onPress={() => onSelect(o.key)}
            style={[styles.segmentBtn, active && styles.segmentBtnActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Rounded search field with a clear button. */
export function SearchBar({
  value,
  onChangeText,
  placeholder = "Search transactions...",
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.search}>
      <Ionicons name="search" size={17} color={theme.muted} />
      <TextInput
        style={styles.searchInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.muted}
        returnKeyType="search"
        autoCorrect={false}
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChangeText("")} hitSlop={8}>
          <Ionicons name="close-circle" size={17} color={theme.muted} />
        </Pressable>
      )}
    </View>
  );
}

/**
 * One quick action. Each is its own raised tile rather than a bare circle —
 * a tile reads as a button, a floating icon reads as decoration. Springs down
 * on press so a tap is visibly acknowledged.
 */
function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const to = (value: number) =>
    Animated.spring(scale, {
      toValue: value,
      friction: 7,
      tension: 180,
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => to(0.94)}
      onPressOut={() => to(1)}
      style={styles.quickHit}
      accessibilityRole="button"
      accessibilityLabel={label}
      // Generous slop so the gap between tiles is still tappable.
      hitSlop={6}
    >
      <Animated.View style={[styles.quickTile, { transform: [{ scale }] }]}>
        <View style={styles.quickCircle}>
          <Ionicons name={icon} size={20} color={theme.onDark} />
        </View>
        <Text style={styles.quickLabel} numberOfLines={1}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

/**
 * The sage band under the balance hero.
 * Every action must point at a route that already exists.
 */
export function QuickActions({
  actions,
}: {
  actions: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }[];
}) {
  return (
    <View style={styles.quickBand}>
      {actions.map((a) => (
        <QuickAction key={a.label} icon={a.icon} label={a.label} onPress={a.onPress} />
      ))}
    </View>
  );
}

/** Back / title / optional right action, for screens outside the tab bar. */
export function ScreenHeader({
  title,
  onBack,
  rightIcon,
  onRight,
}: {
  title: string;
  onBack?: () => void;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRight?: () => void;
}) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={10} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </Pressable>
      ) : (
        <View style={{ width: 26 }} />
      )}

      <Text style={styles.headerTitle}>{title}</Text>

      {rightIcon && onRight ? (
        <Pressable onPress={onRight} hitSlop={10}>
          <Ionicons name={rightIcon} size={22} color={theme.text} />
        </Pressable>
      ) : (
        <View style={{ width: 26 }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: theme.space.base,
    paddingVertical: theme.space.sm + 1,
    borderRadius: 18,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
  },
  chipCompact: { paddingHorizontal: theme.space.base, minWidth: 58, alignItems: "center" },
  chipActive: { backgroundColor: theme.primaryDark, borderColor: theme.primaryDark },
  chipText: { fontSize: theme.size.label, fontWeight: "700", color: theme.muted },
  chipTextActive: { color: "#fff" },
  scrollRow: { gap: theme.space.sm, paddingVertical: 2 },

  segment: {
    flexDirection: "row",
    backgroundColor: theme.cardAlt,
    borderRadius: theme.radius.md,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: theme.space.sm + 2,
    borderRadius: theme.radius.sm,
    alignItems: "center",
  },
  segmentBtnActive: { backgroundColor: theme.card, ...theme.shadowSm },
  segmentText: { fontSize: theme.size.label, fontWeight: "700", color: theme.muted },
  segmentTextActive: { color: theme.text },

  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.sm,
    backgroundColor: theme.card,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.space.base,
    paddingVertical: theme.space.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  searchInput: { flex: 1, fontSize: theme.size.body, color: theme.text, padding: 0 },

  // Three tiles sitting directly on the screen background. The sage band that
  // used to sit behind them came from the reference design, where the circles
  // had no tile of their own — once each action became a card, the band was
  // just a green frame around white cards.
  quickBand: {
    flexDirection: "row",
    gap: theme.space.md,
  },
  quickHit: { flex: 1 },
  quickTile: {
    alignItems: "center",
    gap: theme.space.sm,
    // A surface behind each action is what makes it read as a button rather
    // than an icon someone drew on the background.
    backgroundColor: theme.card,
    borderRadius: theme.radius.md,
    paddingVertical: theme.space.base,
    paddingHorizontal: theme.space.xs,
    borderWidth: 1,
    borderColor: theme.border,
    ...theme.shadowSm,
  },
  quickCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.primaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: { fontSize: theme.size.caption, fontWeight: "800", color: theme.primaryDark },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.space.base,
    paddingBottom: theme.space.md,
  },
  headerTitle: { fontSize: theme.size.section, fontWeight: "800", color: theme.text },
});
