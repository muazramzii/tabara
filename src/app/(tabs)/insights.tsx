import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { CATEGORIES } from "../../constants/categories";
import { theme } from "../../constants/theme";
import { useFinance } from "../../lib/finance-context";

const fmt = (n: number) => `RM ${n.toFixed(2)}`;
const isThisMonth = (d: Date) => {
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
};
const cat = (id: string) => CATEGORIES.find((c) => c.id === id);
const WANTS = "#D98A3D";

// Bright, punchy colour per category (Beruang-style)
const CAT_COLORS: Record<string, string> = {
  food: "#FF5C8A",
  groceries: "#36C26E",
  transport: "#3E97F0",
  tng: "#9B6DFF",
  shopping: "#FFC02E",
  bills: "#FF8A3D",
  entertainment: "#22C3C9",
  health: "#FF5C5C",
  education: "#5C6BC0",
  zakat: "#3FBF8F",
  savings: "#E0A93B",
  other: "#9AA0A6",
};
const colorFor = (id: string) => CAT_COLORS[id] ?? "#9AA0A6";

const SIZE = 210;
const STROKE = 26;
const R = (SIZE - STROKE) / 2;
const CX = SIZE / 2;
const CY = SIZE / 2;
const C = 2 * Math.PI * R;

export default function Insights() {
  const { transactions, profile, loading } = useFinance();
  const budgets = profile?.budgets ?? {};

  const expenses = transactions.filter((t) => t.type === "expense" && isThisMonth(t.date));
  const total = expenses.reduce((s, t) => s + t.amount, 0);

  const map = new Map<string, number>();
  expenses.forEach((t) => map.set(t.category, (map.get(t.category) ?? 0) + t.amount));
  const byCategory = [...map.entries()]
    .map(([id, amount]) => ({ id, amount }))
    .sort((a, b) => b.amount - a.amount);

  const needs = expenses.filter((t) => cat(t.category)?.type === "needs").reduce((s, t) => s + t.amount, 0);
  const wants = total - needs;
  const needsPct = total ? Math.round((needs / total) * 100) : 0;
  const wantsPct = total ? 100 - needsPct : 0;

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  // Donut segments
  let prev = 0;
  const segments = byCategory.map((row) => {
    const arc = (row.amount / total) * C;
    const seg = { id: row.id, arc, offset: -prev };
    prev += arc;
    return seg;
  });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable style={styles.budgetBtn} onPress={() => router.push("/budgets")}>
        <Ionicons name="options-outline" size={18} color={theme.primary} />
        <Text style={styles.budgetBtnText}>Manage category budgets</Text>
        <Ionicons name="chevron-forward" size={18} color={theme.muted} />
      </Pressable>

      {total === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="pie-chart-outline" size={48} color={theme.muted} />
          <Text style={styles.emptyTitle}>No spending yet</Text>
          <Text style={styles.muted}>Log some expenses to see your breakdown.</Text>
        </View>
      ) : (
        <>
          {/* Donut card */}
          <View style={styles.card}>
            <View style={styles.donutWrap}>
              <Svg width={SIZE} height={SIZE}>
                <Circle cx={CX} cy={CY} r={R} stroke={theme.border} strokeWidth={STROKE} fill="none" />
                {segments.map((s) => (
                  <Circle
                    key={s.id}
                    cx={CX}
                    cy={CY}
                    r={R}
                    stroke={colorFor(s.id)}
                    strokeWidth={STROKE}
                    fill="none"
                    strokeDasharray={`${s.arc} ${C - s.arc}`}
                    strokeDashoffset={s.offset}
                    strokeLinecap="butt"
                    transform={`rotate(-90 ${CX} ${CY})`}
                  />
                ))}
              </Svg>
              <View style={styles.donutCenter}>
                <Text style={styles.donutLabel}>spent this month</Text>
                <Text style={styles.donutTotal}>{fmt(total)}</Text>
              </View>
            </View>

            <Pressable style={styles.askPill} onPress={() => router.push("/(tabs)/kapy")}>
              <Text style={styles.askPillText}>🦫  Ask Kapy about this</Text>
            </Pressable>
          </View>

          {/* Colored circular icon badges */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.badges} contentContainerStyle={{ gap: 16, paddingHorizontal: 4 }}>
            {byCategory.map((row) => {
              const c = cat(row.id);
              return (
                <View key={row.id} style={styles.badge}>
                  <View style={[styles.badgeCircle, { backgroundColor: colorFor(row.id) }]}>
                    <Ionicons name={(c?.icon ?? "pricetag-outline") as any} size={22} color="#fff" />
                  </View>
                  <Text style={styles.badgeLabel} numberOfLines={1}>{c?.label ?? row.id}</Text>
                  <Text style={[styles.badgeAmt, { color: colorFor(row.id) }]}>−{fmt(row.amount)}</Text>
                </View>
              );
            })}
          </ScrollView>

          {/* Needs vs Wants */}
          <Text style={styles.section}>Needs vs Wants</Text>
          <View style={styles.nvwBar}>
            <View style={{ width: `${needsPct}%`, backgroundColor: theme.accent }} />
            <View style={{ width: `${wantsPct}%`, backgroundColor: WANTS }} />
          </View>
          <View style={styles.nvwLegend}>
            <Text style={styles.legendItem}>
              <Text style={{ color: theme.accent }}>●</Text> Needs {needsPct}% · {fmt(needs)}
            </Text>
            <Text style={styles.legendItem}>
              <Text style={{ color: WANTS }}>●</Text> Wants {wantsPct}% · {fmt(wants)}
            </Text>
          </View>

          {/* Budgets */}
          <Text style={styles.section}>Budgets</Text>
          {byCategory.map((row) => {
            const c = cat(row.id);
            const limit = budgets[row.id] ?? 0;
            const over = limit > 0 && row.amount > limit;
            const pct = limit > 0 ? Math.min((row.amount / limit) * 100, 100) : Math.round((row.amount / total) * 100);
            return (
              <View key={row.id} style={styles.catRow}>
                <View style={styles.catHeader}>
                  <View style={[styles.dot, { backgroundColor: colorFor(row.id) }]} />
                  <Text style={styles.catLabel}>{c?.label ?? row.id}</Text>
                  <Text style={[styles.catAmount, over && { color: theme.danger }]}>
                    {fmt(row.amount)}
                    {limit > 0 ? ` / ${fmt(limit)}` : ""}
                  </Text>
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${pct}%`, backgroundColor: over ? theme.danger : colorFor(row.id) }]} />
                </View>
              </View>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 20, gap: 10 },
  center: { flex: 1, backgroundColor: theme.bg, alignItems: "center", justifyContent: "center", padding: 32, gap: 8 },
  empty: { alignItems: "center", justifyContent: "center", padding: 32, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: theme.text },
  muted: { fontSize: 14, color: theme.muted, textAlign: "center" },
  budgetBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: theme.card, borderRadius: theme.radius.md, padding: 14,
    borderWidth: 1, borderColor: theme.border,
  },
  budgetBtnText: { flex: 1, fontSize: 15, fontWeight: "600", color: theme.text },
  card: {
    backgroundColor: theme.card, borderRadius: theme.radius.lg, padding: 18,
    alignItems: "center", borderWidth: 1, borderColor: theme.border, ...theme.shadow,
  },
  donutWrap: { width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" },
  donutCenter: { position: "absolute", alignItems: "center", justifyContent: "center" },
  donutLabel: { fontSize: 12, color: theme.muted },
  donutTotal: { fontSize: 26, fontWeight: "800", color: theme.text, marginTop: 2 },
  askPill: {
    marginTop: 14, backgroundColor: theme.bg, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 9, borderWidth: 1, borderColor: theme.border,
  },
  askPillText: { fontSize: 13, fontWeight: "600", color: theme.text },
  badges: { marginTop: 4 },
  badge: { alignItems: "center", width: 76 },
  badgeCircle: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", ...theme.shadow },
  badgeLabel: { fontSize: 11, color: theme.text, marginTop: 6, textAlign: "center" },
  badgeAmt: { fontSize: 12, fontWeight: "700", marginTop: 1 },
  section: { fontSize: 16, fontWeight: "700", color: theme.text, marginTop: 18, marginBottom: 8 },
  nvwBar: { flexDirection: "row", height: 18, borderRadius: 9, overflow: "hidden", backgroundColor: theme.border },
  nvwLegend: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  legendItem: { fontSize: 13, color: theme.text },
  catRow: { marginBottom: 14 },
  catHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  catLabel: { flex: 1, fontSize: 14, fontWeight: "500", color: theme.text },
  catAmount: { fontSize: 14, fontWeight: "600", color: theme.text },
  track: { height: 10, borderRadius: 5, backgroundColor: theme.border, overflow: "hidden", marginTop: 6 },
  fill: { height: 10, borderRadius: 5 },
});