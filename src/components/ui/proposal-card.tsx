import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../../constants/theme";
import { describeSaved, type ProposalCard } from "../../lib/kapy-chat";
import { cat } from "../../lib/format";

// The confirmation card Kapy shows before anything is saved.
//
// It shows exactly what the server prepared — amount, category, date, note — and
// nothing is written until the person taps Confirm. After saving, the card shows
// the row the DATABASE returned, not Kapy's own wording, so "Saved" always means
// it is in History. A correction is made by telling Kapy; the old card is then
// marked "replaced" so only one can be confirmed.

type Props = {
  card: ProposalCard;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ProposalCardView({ card, onConfirm, onCancel }: Props) {
  const { data, state } = card;
  const income = data.type === "income";
  const accent = income ? theme.income : theme.expense;
  const icon = (cat(data.category)?.icon ?? "ellipsis-horizontal-outline") as keyof typeof Ionicons.glyphMap;
  const settled = state === "saved" || state === "already_saved";
  const inactive = state === "cancelled" || state === "replaced";

  return (
    <View
      style={[styles.card, inactive && styles.inactive]}
      accessibilityRole="summary"
      accessibilityLabel={`${income ? "Income" : "Expense"} of ${data.formatted}, ${data.categoryLabel}, ${data.dateLabel}`}
    >
      <View style={styles.head}>
        <Ionicons name={settled ? "checkmark-circle" : "receipt-outline"} size={18} color={settled ? theme.income : theme.primary} />
        <Text style={styles.title}>
          {settled ? (state === "already_saved" ? "Already saved" : "Saved") : inactive ? "Not saved" : "Confirm transaction"}
        </Text>
        <View style={[styles.pill, { backgroundColor: accent + "1A" }]}>
          <Text style={[styles.pillText, { color: accent }]}>{income ? "Income" : "Expense"}</Text>
        </View>
      </View>

      <Text style={[styles.amount, { color: inactive ? theme.muted : accent }]}>
        {income ? "+" : "−"}
        {data.formatted}
      </Text>

      <View style={styles.rows}>
        <View style={styles.row}>
          <Ionicons name={icon} size={16} color={theme.muted} />
          <Text style={styles.rowText}>{data.categoryLabel}</Text>
        </View>
        <View style={styles.row}>
          <Ionicons name="calendar-outline" size={16} color={theme.muted} />
          <Text style={styles.rowText}>{data.dateLabel}</Text>
        </View>
        {!!data.note && (
          <View style={styles.row}>
            <Ionicons name="document-text-outline" size={16} color={theme.muted} />
            <Text style={styles.rowText} numberOfLines={2}>
              {data.note}
            </Text>
          </View>
        )}
      </View>

      {settled && card.saved && <Text style={styles.status}>{describeSaved(card.saved)}</Text>}
      {state === "cancelled" && <Text style={styles.status}>Cancelled. Nothing was saved.</Text>}
      {state === "replaced" && <Text style={styles.status}>Replaced by a newer version below.</Text>}
      {state === "failed" && <Text style={[styles.status, { color: theme.danger }]}>{card.error ?? "Couldn't save that. Nothing was saved."}</Text>}

      {state === "saving" && (
        <View style={styles.saving}>
          <ActivityIndicator size="small" color={theme.accent} />
          <Text style={styles.status}>Saving…</Text>
        </View>
      )}

      {(state === "pending" || state === "failed") && (
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && { opacity: 0.6 }]}
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel. Do not save this transaction"
          >
            <Text style={styles.btnGhostText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && { opacity: 0.8 }]}
            onPress={onConfirm}
            accessibilityRole="button"
            accessibilityLabel={state === "failed" ? "Try saving again" : "Confirm and save this transaction"}
          >
            <Text style={styles.btnPrimaryText}>{state === "failed" ? "Try again" : "Confirm"}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginLeft: 38, // lines up with Kapy's bubble: avatar (30) + gap (8)
    maxWidth: "86%",
    backgroundColor: theme.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    padding: theme.space.base,
    gap: theme.space.sm,
    ...theme.shadowSm,
  },
  inactive: { opacity: 0.7 },
  head: { flexDirection: "row", alignItems: "center", gap: theme.space.sm },
  title: { flex: 1, fontSize: theme.size.label, fontWeight: "800", color: theme.text },
  pill: { paddingHorizontal: theme.space.sm, paddingVertical: 2, borderRadius: 10 },
  pillText: { fontSize: theme.size.caption, fontWeight: "800" },
  amount: { fontSize: theme.size.display, fontWeight: "800" },
  rows: { gap: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: theme.space.sm },
  rowText: { flex: 1, fontSize: theme.size.label, color: theme.text },
  status: { fontSize: theme.size.label, color: theme.muted },
  saving: { flexDirection: "row", alignItems: "center", gap: theme.space.sm },
  actions: { flexDirection: "row", gap: theme.space.md, marginTop: theme.space.xs },
  btn: { flex: 1, minHeight: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  btnPrimary: { backgroundColor: theme.primary },
  btnPrimaryText: { color: theme.onDark, fontSize: theme.size.body, fontWeight: "800" },
  btnGhost: { backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border },
  btnGhostText: { color: theme.primaryDark, fontSize: theme.size.body, fontWeight: "700" },
});
