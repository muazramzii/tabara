import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { Card, ProgressBar, SectionHeader } from "../../components/ui/cards";
import { ChipScroller } from "../../components/ui/controls";
import { CountUp, PopIn } from "../../components/ui/motion";
import { EmptyState, Skeleton } from "../../components/ui/states";
import { colorForCategory, theme } from "../../constants/theme";
import { useFinance } from "../../lib/finance-context";
import {
  byCategory,
  cat,
  fmt,
  isSameMonth,
  monthShort,
  recentMonths,
} from "../../lib/format";

// Proportions taken from the reference: a slimmer ring than a chunky donut,
// with a little air between segments so neighbouring colours stay distinct.
const SIZE = 214;
const STROKE = 20;
const GAP = 5; // px of circumference left blank between segments
const R = (SIZE - STROKE) / 2;
const CX = SIZE / 2;
const CY = SIZE / 2;
const C = 2 * Math.PI * R;

export default function Insights() {
  const insets = useSafeAreaInsets();
  const { transactions, profile, loading } = useFinance();
  const budgets = profile?.budgets ?? {};

  // Month selector. Purely a view filter over data already loaded — no extra
  // query, no schema change.
  const months = useMemo(() => recentMonths(5), []);
  const [monthIdx, setMonthIdx] = useState(months.length - 1);
  const selectedMonth = months[monthIdx];

  // Savings transfers are excluded so "total spending" means the same thing
  // here as it does on Home — money consumed, not money set aside.
  const expenses = transactions.filter(
    (t) =>
      t.type === "expense" &&
      t.category !== "savings" &&
      isSameMonth(t.date, selectedMonth)
  );
  const total = expenses.reduce((s, t) => s + t.amount, 0);
  const rows = byCategory(expenses);

  const needs = expenses
    .filter((t) => cat(t.category)?.type === "needs")
    .reduce((s, t) => s + t.amount, 0);
  const wants = total - needs;
  const needsPct = total ? Math.round((needs / total) * 100) : 0;
  const wantsPct = total ? 100 - needsPct : 0;

  // Donut segments. With more than one category each arc is shortened slightly
  // so a hairline of track shows between them; a single category keeps the
  // full ring, since a gap in a lone segment would just look like a mistake.
  const gap = rows.length > 1 ? GAP : 0;
  let prev = 0;
  const segments = rows.map((row) => {
    const full = total > 0 ? (row.amount / total) * C : 0;
    const seg = { id: row.id, arc: Math.max(full - gap, 1), offset: -prev };
    prev += full;
    return seg;
  });

  return (
    <View style={[styles.screen, { paddingTop: insets.top + theme.space.md }]}>
      <Text style={styles.screenTitle}>Expenses</Text>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <ChipScroller
          options={months.map((m, i) => ({ key: String(i), label: monthShort(m) }))}
          activeKey={String(monthIdx)}
          onSelect={(k) => setMonthIdx(Number(k))}
        />

        {loading ? (
          <View style={{ alignItems: "center", gap: theme.space.base, marginTop: theme.space.lg }}>
            <Skeleton height={SIZE} width={SIZE} radius={SIZE / 2} />
            <Skeleton height={14} width="50%" />
          </View>
        ) : total === 0 ? (
          <EmptyState
            capy="chill"
            title="No spending this month"
            message="Log an expense and your breakdown will appear here."
            actionLabel="Add transaction"
            onAction={() => router.push("/(tabs)/add")}
          />
        ) : (
          <>
            {/* Donut */}
            <Card style={styles.donutCard}>
              <PopIn from={0.85}>
              <View style={styles.donutWrap}>
                <Svg width={SIZE} height={SIZE}>
                  <Circle
                    cx={CX}
                    cy={CY}
                    r={R}
                    stroke={theme.cardAlt}
                    strokeWidth={STROKE}
                    fill="none"
                  />
                  {segments.map((s) => (
                    <Circle
                      key={s.id}
                      cx={CX}
                      cy={CY}
                      r={R}
                      stroke={colorForCategory(s.id)}
                      strokeWidth={STROKE}
                      fill="none"
                      strokeDasharray={`${s.arc} ${C - s.arc}`}
                      strokeDashoffset={s.offset}
                      strokeLinecap="round"
                      transform={`rotate(-90 ${CX} ${CY})`}
                    />
                  ))}
                </Svg>
                <View style={styles.donutCenter}>
                  <Text style={styles.donutLabel}>TOTAL SPENDING</Text>
                  <CountUp
                    value={total}
                    format={fmt}
                    style={styles.donutTotal}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                  />
                  <Text style={styles.donutSub}>{monthShort(selectedMonth)}</Text>
                </View>
              </View>
              </PopIn>

              <Pressable style={styles.askPill} onPress={() => router.push("/(tabs)/kapy")}>
                <Text style={styles.askPillText}>🦫  Ask Kapy about this</Text>
              </Pressable>
            </Card>

            {/* Category badges — the donut's legend, so it gets a container
                and a heading like every other section on this screen. */}
            <Card style={styles.badgeCard}>
              <SectionHeader
                title="Where it went"
                subtitle={`${rows.length} categor${rows.length === 1 ? "y" : "ies"} this month`}
                inCard
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.badges}
              >
                {rows.map((row) => {
                const c = cat(row.id);
                const tint = colorForCategory(row.id);
                return (
                  <View key={row.id} style={styles.badge}>
                    <View style={[styles.badgeCircle, { backgroundColor: tint }]}>
                      <Ionicons
                        name={(c?.icon ?? "pricetag-outline") as any}
                        size={20}
                        color="#fff"
                      />
                    </View>
                    <Text style={styles.badgeLabel} numberOfLines={1}>
                      {c?.label ?? row.id}
                    </Text>
                    <Text style={[styles.badgeAmt, { color: tint }]} numberOfLines={1}>
                      −{fmt(row.amount)}
                    </Text>
                  </View>
                );
              })}
              </ScrollView>
            </Card>

            {/* Needs vs Wants */}
            <Card style={{ padding: theme.space.base }}>
              <SectionHeader title="Needs vs Wants" inCard />
              <View style={styles.nvwBar}>
                <View style={{ width: `${needsPct}%`, backgroundColor: theme.accent }} />
                <View style={{ width: `${wantsPct}%`, backgroundColor: theme.peach }} />
              </View>
              <View style={styles.nvwLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.dot, { backgroundColor: theme.accent }]} />
                  <Text style={styles.legendText}>
                    Needs {needsPct}% · {fmt(needs)}
                  </Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.dot, { backgroundColor: theme.peach }]} />
                  <Text style={styles.legendText}>
                    Wants {wantsPct}% · {fmt(wants)}
                  </Text>
                </View>
              </View>
            </Card>

            {/* Per-category budgets */}
            <Card style={{ padding: theme.space.base }}>
              <SectionHeader
                title="Budgets"
                subtitle="Spending against each category limit"
                actionLabel="Manage"
                onAction={() => router.push("/budgets")}
                inCard
              />
              {rows.map((row, i) => {
                const c = cat(row.id);
                const tint = colorForCategory(row.id);
                const limit = budgets[row.id] ?? 0;
                const over = limit > 0 && row.amount > limit;
                const pct =
                  limit > 0
                    ? Math.min((row.amount / limit) * 100, 100)
                    : total > 0
                      ? (row.amount / total) * 100
                      : 0;
                return (
                  <View key={row.id} style={{ marginBottom: i === rows.length - 1 ? 0 : theme.space.base }}>
                    <View style={styles.catHeader}>
                      <View style={[styles.dot, { backgroundColor: tint }]} />
                      <Text style={styles.catLabel} numberOfLines={1}>
                        {c?.label ?? row.id}
                      </Text>
                      <Text style={[styles.catAmount, over && { color: theme.danger }]}>
                        {fmt(row.amount)}
                        {limit > 0 ? ` / ${fmt(limit)}` : ""}
                      </Text>
                    </View>
                    <ProgressBar pct={pct} color={over ? theme.danger : tint} height={8} />
                  </View>
                );
              })}
            </Card>
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
  content: {
    paddingHorizontal: theme.screenPadding,
    paddingBottom: theme.space.xxl,
    gap: theme.space.md,
  },

  donutCard: { alignItems: "center", paddingVertical: theme.space.xl },
  donutWrap: { width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" },
  donutCenter: { position: "absolute", alignItems: "center", paddingHorizontal: 34 },
  // Label above the figure, as in the reference — the number stays the thing
  // your eye lands on.
  donutLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: theme.muted,
    letterSpacing: 1,
    marginBottom: 2,
  },
  donutTotal: {
    fontSize: theme.size.display,
    fontWeight: "800",
    color: theme.text,
    letterSpacing: -0.8,
  },
  donutSub: {
    fontSize: theme.size.caption,
    fontWeight: "700",
    color: theme.muted,
    marginTop: 2,
  },
  askPill: {
    marginTop: theme.space.base,
    backgroundColor: theme.accentSoft,
    borderRadius: 20,
    paddingHorizontal: theme.space.base,
    paddingVertical: theme.space.sm + 1,
  },
  askPillText: { fontSize: theme.size.label, fontWeight: "700", color: theme.primaryDark },

  // flexGrow + centre so one or two categories sit in the middle instead of
  // being stranded against the left edge.
  badgeCard: { paddingHorizontal: theme.space.base, paddingVertical: theme.space.base },
  badges: {
    gap: theme.space.base,
    paddingVertical: 2,
    flexGrow: 1,
    justifyContent: "center",
  },
  badge: { alignItems: "center", width: 76 },
  badgeCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadowSm,
  },
  badgeLabel: {
    fontSize: theme.size.caption,
    color: theme.text,
    marginTop: 6,
    textAlign: "center",
  },
  badgeAmt: { fontSize: theme.size.caption, fontWeight: "800", marginTop: 1 },

  nvwBar: {
    flexDirection: "row",
    height: 16,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: theme.cardAlt,
  },
  nvwLegend: { marginTop: theme.space.md, gap: theme.space.sm },
  legendItem: { flexDirection: "row", alignItems: "center", gap: theme.space.sm },
  legendText: { fontSize: theme.size.label, color: theme.text },
  dot: { width: 10, height: 10, borderRadius: 5 },

  catHeader: { flexDirection: "row", alignItems: "center", gap: theme.space.sm, marginBottom: 6 },
  catLabel: { flex: 1, fontSize: theme.size.label, fontWeight: "700", color: theme.text },
  catAmount: { fontSize: theme.size.label, fontWeight: "800", color: theme.text },
});
