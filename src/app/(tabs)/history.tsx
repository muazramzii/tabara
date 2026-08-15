import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SearchBar, Segmented } from "../../components/ui/controls";
import { EmptyState, ErrorState, TransactionSkeleton } from "../../components/ui/states";
import { TransactionItem } from "../../components/ui/transaction-item";
import { theme } from "../../constants/theme";
import { useAuth } from "../../lib/auth-context";
import { deleteTransaction, type Transaction } from "../../lib/db";
import { useFinance } from "../../lib/finance-context";
import { cat, fmt, groupByDay } from "../../lib/format";

const FILTERS = [
  { key: "latest", label: "Latest" },
  { key: "needs", label: "Needs" },
  { key: "wants", label: "Wants" },
];

export default function History() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { transactions, loading, error, retry } = useFinance();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("latest");

  // ── unchanged delete logic ───────────────────────────────
  const onPress = (t: Transaction) => {
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

  // Search + filter are view-only derivations over the list already in memory.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions.filter((t) => {
      if (filter === "needs" && cat(t.category)?.type !== "needs") return false;
      if (filter === "wants" && cat(t.category)?.type !== "wants") return false;
      if (!q) return true;
      const label = cat(t.category)?.label ?? t.category;
      return (
        label.toLowerCase().includes(q) ||
        (t.note ?? "").toLowerCase().includes(q) ||
        String(t.amount).includes(q)
      );
    });
  }, [transactions, query, filter]);

  const groups = useMemo(() => groupByDay(visible), [visible]);
  const isFiltered = query.trim().length > 0 || filter !== "latest";

  return (
    <View style={[styles.screen, { paddingTop: insets.top + theme.space.md }]}>
      <Text style={styles.screenTitle}>History</Text>

      <View style={styles.controls}>
        <SearchBar value={query} onChangeText={setQuery} />
        <Segmented options={FILTERS} activeKey={filter} onSelect={setFilter} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <TransactionSkeleton rows={5} />
        ) : error ? (
          <ErrorState
            message="We couldn't load your transactions. Check your connection."
            onRetry={retry}
          />
        ) : transactions.length === 0 ? (
          <EmptyState
            capy="chill"
            title="No transactions yet"
            message="Start tracking your spending to understand your financial habits."
            actionLabel="Add transaction"
            onAction={() => router.push("/(tabs)/add")}
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon="search-outline"
            title="Nothing matches"
            message={
              isFiltered
                ? "Try a different search or filter."
                : "No transactions to show."
            }
          />
        ) : (
          <>
            <Text style={styles.hint}>Tap a transaction to delete it</Text>
            {groups.map((g) => (
              <View key={g.label} style={{ gap: theme.space.sm }}>
                <Text style={styles.dayLabel}>{g.label}</Text>
                {g.items.map((t) => (
                  <TransactionItem key={t.id} txn={t} onPress={onPress} />
                ))}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  screenTitle: {
    fontSize: theme.size.title,
    fontWeight: "800",
    color: theme.text,
    paddingHorizontal: theme.screenPadding,
    paddingBottom: theme.space.md,
  },
  controls: {
    paddingHorizontal: theme.screenPadding,
    gap: theme.space.md,
    paddingBottom: theme.space.base,
  },
  content: {
    paddingHorizontal: theme.screenPadding,
    paddingBottom: theme.space.xxl,
    gap: theme.space.base,
  },
  hint: {
    fontSize: theme.size.caption,
    color: theme.muted,
    textAlign: "center",
  },
  dayLabel: {
    fontSize: theme.size.label,
    fontWeight: "800",
    color: theme.muted,
    marginTop: theme.space.xs,
  },
});
