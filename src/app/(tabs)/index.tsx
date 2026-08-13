import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CATEGORIES } from "../../constants/categories";
import { theme } from "../../constants/theme";
import { useFinance } from "../../lib/finance-context";

const fmt = (n: number) => `RM ${n.toFixed(2)}`;
const cat = (id: string) => CATEGORIES.find((c) => c.id === id);
const isThisMonth = (d: Date) => {
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
};
const monthName = new Date().toLocaleDateString("en-MY", { month: "long" });

const CAPY = {
  chill: require("../../assets/capy-chill.png"),
  careful: require("../../assets/capy-careful.png"),
  sad: require("../../assets/capy-sad.png"),
  party: require("../../assets/capy-party.png"),
};

function moodKey(spent: number, budget: number): keyof typeof CAPY {
  if (budget <= 0) return "chill";
  const ratio = spent / budget;
  if (ratio <= 0.7) return "chill";
  if (ratio <= 1) return "careful";
  return "sad";
}

function BreakdownRow({
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
  const barColor = over ? theme.danger : color;
  return (
    <View style={styles.bdRow}>
      <View style={styles.bdHeader}>
        <Text style={styles.bdLabel}>{label}</Text>
        <Text style={[styles.bdAmt, over && { color: theme.danger }]}>
          {fmt(spent)} <Text style={styles.bdTarget}>/ {fmt(target)}</Text>
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

export default function Home() {
  const { derived, transactions, loading } = useFinance();
  const { mood, income, spent, savingsGoal } = derived;
  const recent = transactions.slice(0, 4);
  const capy = CAPY[moodKey(spent, derived.budget)];

  const balance = income - spent;

  // 50 / 30 / 20 breakdown
  const expensesMonth = transactions.filter((t) => t.type === "expense" && isThisMonth(t.date));
  const needsSpent = expensesMonth.filter((t) => cat(t.category)?.type === "needs").reduce((s, t) => s + t.amount, 0);
  const wantsSpent = expensesMonth.filter((t) => cat(t.category)?.type === "wants").reduce((s, t) => s + t.amount, 0);
  const needsTarget = income * 0.5;
  const wantsTarget = income * 0.3;
  const savingsTarget = savingsGoal > 0 ? savingsGoal : income * 0.2;
  const saved = Math.max(balance, 0);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.greeting}>Hi there 👋</Text>
          <Text style={styles.subGreeting}>Welcome back to Tabara</Text>
        </View>
        <Pressable onPress={() => router.push("/profile")} hitSlop={8}>
          <Image source={CAPY.chill} style={styles.avatar} />
        </Pressable>
      </View>

      {/* Balance card */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>{monthName} balance</Text>
        <Text style={styles.balanceValue}>{fmt(balance)}</Text>
        <View style={styles.balanceSplit}>
          <View style={styles.splitItem}>
            <Ionicons name="arrow-up-circle" size={18} color="#A8D5BA" />
            <View>
              <Text style={styles.splitLabel}>Income</Text>
              <Text style={styles.splitValue}>{fmt(income)}</Text>
            </View>
          </View>
          <View style={styles.splitDivider} />
          <View style={styles.splitItem}>
            <Ionicons name="arrow-down-circle" size={18} color="#E9A8A8" />
            <View>
              <Text style={styles.splitLabel}>Expense</Text>
              <Text style={styles.splitValue}>{fmt(spent)}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Mood capy */}
      <View style={styles.capyCard}>
        <Image source={capy} style={styles.capyImg} resizeMode="contain" />
        <View style={{ flex: 1 }}>
          <Text style={styles.capyMood}>{mood.title}</Text>
          <Text style={styles.capySub}>{mood.subtitle}</Text>
        </View>
      </View>

      {/* Budget breakdown */}
      {income > 0 && (
        <View style={styles.bdCard}>
          <Text style={styles.bdTitle}>Budget breakdown</Text>
          <Text style={styles.bdSub}>50 / 30 / 20 rule</Text>
          <BreakdownRow label="Needs (50%)" spent={needsSpent} target={needsTarget} color={theme.primary} />
          <BreakdownRow label="Wants (30%)" spent={wantsSpent} target={wantsTarget} color={theme.peach} />
          <BreakdownRow label="Savings (20%)" spent={saved} target={savingsTarget} color={theme.accent} goodIsHigh />
        </View>
      )}

      {/* Recent */}
      <Text style={styles.sectionTitle}>Recent</Text>
      {loading ? (
        <Text style={styles.placeholder}>Loading…</Text>
      ) : recent.length === 0 ? (
        <Text style={styles.placeholder}>No transactions yet. Tap Add to log your first one.</Text>
      ) : (
        recent.map((t) => {
          const c = cat(t.category);
          return (
            <View key={t.id} style={styles.txnRow}>
              <View style={styles.txnIcon}>
                <Ionicons name={(c?.icon ?? "pricetag-outline") as any} size={20} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.txnLabel}>{c?.label ?? t.category}</Text>
                {!!t.note && <Text style={styles.txnNote}>{t.note}</Text>}
              </View>
              <Text style={[styles.txnAmount, { color: t.type === "income" ? theme.accent : theme.text }]}>
                {t.type === "income" ? "+" : "−"}
                {fmt(t.amount)}
              </Text>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 20, gap: 14 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  greeting: { fontSize: 22, fontWeight: "800", color: theme.text },
  subGreeting: { fontSize: 13, color: theme.muted, marginTop: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: theme.border },

  balanceCard: { backgroundColor: theme.primaryDark, borderRadius: theme.radius.lg, padding: 20, ...theme.shadow },
  balanceLabel: { color: "#E6DECF", fontSize: 14 },
  balanceValue: { color: "#fff", fontSize: 36, fontWeight: "800", marginTop: 4 },
  balanceSplit: { flexDirection: "row", alignItems: "center", marginTop: 16 },
  splitItem: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  splitDivider: { width: 1, height: 32, backgroundColor: "rgba(255,255,255,0.2)" },
  splitLabel: { color: "#E6DECF", fontSize: 12 },
  splitValue: { color: "#fff", fontSize: 15, fontWeight: "700", marginTop: 1 },

  capyCard: {
    backgroundColor: theme.card,
    borderRadius: theme.radius.lg,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderColor: theme.border,
    ...theme.shadow,
  },
  capyImg: { width: 64, height: 64 },
  capyMood: { fontSize: 16, fontWeight: "700", color: theme.text },
  capySub: { fontSize: 13, color: theme.muted, marginTop: 2 },

  bdCard: { backgroundColor: theme.card, borderRadius: theme.radius.lg, padding: 18, borderWidth: 1, borderColor: theme.border, ...theme.shadow },
  bdTitle: { fontSize: 16, fontWeight: "700", color: theme.text },
  bdSub: { fontSize: 12, color: theme.muted, marginTop: 1, marginBottom: 14 },
  bdRow: { marginBottom: 14 },
  bdHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  bdLabel: { fontSize: 14, fontWeight: "600", color: theme.text },
  bdAmt: { fontSize: 13, fontWeight: "700", color: theme.text },
  bdTarget: { fontSize: 13, fontWeight: "400", color: theme.muted },
  track: { height: 9, borderRadius: 5, backgroundColor: theme.border, overflow: "hidden" },
  fill: { height: 9, borderRadius: 5 },

  sectionTitle: { fontSize: 16, fontWeight: "700", color: theme.text, marginTop: 6 },
  placeholder: { color: theme.muted, fontSize: 14, paddingVertical: 8 },
  txnRow: {
    backgroundColor: theme.card,
    borderRadius: theme.radius.md,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  txnIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: theme.bg, alignItems: "center", justifyContent: "center" },
  txnLabel: { fontSize: 15, fontWeight: "600", color: theme.text },
  txnNote: { fontSize: 12, color: theme.muted, marginTop: 1 },
  txnAmount: { fontSize: 15, fontWeight: "700" },
});