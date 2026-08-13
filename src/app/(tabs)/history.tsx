import { Ionicons } from "@expo/vector-icons";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CATEGORIES } from "../../constants/categories";
import { theme } from "../../constants/theme";
import { useAuth } from "../../lib/auth-context";
import { deleteTransaction } from "../../lib/db";
import { useFinance } from "../../lib/finance-context";

const fmt = (n: number) => `RM ${n.toFixed(2)}`;
const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
const cat = (id: string) => CATEGORIES.find((c) => c.id === id);

export default function History() {
  const { user } = useAuth();
  const { transactions, loading } = useFinance();

  const onPress = (t: any) => {
    const c = cat(t.category);
    Alert.alert(
      c?.label ?? t.category,
      `${t.type === "income" ? "+" : "−"}${fmt(t.amount)}${t.note ? `\n${t.note}` : ""}`,
      [
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (!user) return;
            try {
              await deleteTransaction(user.id, t.id);
            } catch {
              Alert.alert("Couldn't delete", "Try again.");
            }
          },
        },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  if (transactions.length === 0) {
    return (
      <View style={styles.center}>
        <Ionicons name="receipt-outline" size={48} color={theme.muted} />
        <Text style={styles.emptyTitle}>No transactions yet</Text>
        <Text style={styles.muted}>Tap the Add tab to log your first one.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.hint}>Tap a transaction to delete it</Text>
      {transactions.map((t) => {
        const c = cat(t.category);
        return (
          <Pressable key={t.id} style={styles.row} onPress={() => onPress(t)}>
            <View style={styles.icon}>
              <Ionicons name={(c?.icon ?? "pricetag-outline") as any} size={20} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{c?.label ?? t.category}</Text>
              <Text style={styles.date}>
                {fmtDate(t.date)}
                {t.note ? ` · ${t.note}` : ""}
              </Text>
            </View>
            <Text style={[styles.amount, { color: t.type === "income" ? theme.accent : theme.text }]}>
              {t.type === "income" ? "+" : "−"}
              {fmt(t.amount)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, gap: 10 },
  hint: { fontSize: 12, color: theme.muted, textAlign: "center", marginBottom: 2 },
  center: { flex: 1, backgroundColor: theme.bg, alignItems: "center", justifyContent: "center", padding: 32, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: theme.text },
  muted: { fontSize: 14, color: theme.muted, textAlign: "center" },
  row: {
    backgroundColor: theme.card,
    borderRadius: theme.radius.md,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  icon: { width: 38, height: 38, borderRadius: 10, backgroundColor: theme.bg, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 15, fontWeight: "600", color: theme.text },
  date: { fontSize: 12, color: theme.muted, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: "700" },
});