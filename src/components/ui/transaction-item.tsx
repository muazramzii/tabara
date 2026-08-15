import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colorForCategory, theme } from "../../constants/theme";
import type { Transaction } from "../../lib/db";
import { cat, fmtDateShort, fmtSigned } from "../../lib/format";

// One transaction row. This JSX was duplicated verbatim in Home and History;
// both render this instead.
//
// Layout: tinted icon tile, title, "Category · 14 Aug" beneath, signed amount
// on the right.
export function TransactionItem({
  txn,
  onPress,
}: {
  txn: Transaction;
  onPress?: (t: Transaction) => void;
}) {
  const c = cat(txn.category);
  const tint = colorForCategory(txn.category);
  const label = c?.label ?? txn.category;

  // The note is the more specific thing when it exists ("Makan Heritage"), so
  // it becomes the title and the category drops to the subtitle.
  const title = txn.note?.trim() || label;
  const subtitle = txn.note?.trim()
    ? `${label} · ${fmtDateShort(txn.date)}`
    : fmtDateShort(txn.date);

  const content = (
    <>
      <View style={[styles.icon, { backgroundColor: tint + "22" }]}>
        <Ionicons name={(c?.icon ?? "pricetag-outline") as any} size={20} color={tint} />
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>

      <Text
        style={[styles.amount, { color: txn.type === "income" ? theme.income : theme.text }]}
        numberOfLines={1}
      >
        {fmtSigned(txn.amount, txn.type)}
      </Text>
    </>
  );

  // Pressable accepts a function for `style`; View does not — passing one to a
  // View silently drops every style, which is what flattened this row into
  // bare text on Home. So the two cases are kept separate.
  if (!onPress) {
    return <View style={styles.row}>{content}</View>;
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={() => onPress(txn)}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${fmtSigned(txn.amount, txn.type)}`}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: theme.card,
    borderRadius: theme.radius.md,
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space.base,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.md,
    borderWidth: 1,
    borderColor: theme.border,
    ...theme.shadowSm,
  },
  pressed: { opacity: 0.65 },
  icon: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1 },
  title: { fontSize: theme.size.body, fontWeight: "700", color: theme.text },
  subtitle: { fontSize: theme.size.caption, color: theme.muted, marginTop: 2 },
  amount: { fontSize: theme.size.body, fontWeight: "800" },
});
