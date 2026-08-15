import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BalanceCard, Card, ProgressBar, ProgressRow, SectionHeader } from "../../components/ui/cards";
import { QuickActions } from "../../components/ui/controls";
import { StreakCard } from "../../components/ui/gamification";
import { FadeInView, PopIn } from "../../components/ui/motion";
import { EmptyState, ErrorState, TransactionSkeleton } from "../../components/ui/states";
import { TransactionItem } from "../../components/ui/transaction-item";
import { theme } from "../../constants/theme";
import { useAuth } from "../../lib/auth-context";
import { useFinance } from "../../lib/finance-context";
import { buildAlerts, streak, weekActivity } from "../../lib/insights";
import { cat, fmt, isThisMonth, monthLabel } from "../../lib/format";

const CAPY = {
  chill: require("../../assets/capy-chill.png"),
  careful: require("../../assets/capy-careful.png"),
  sad: require("../../assets/capy-sad.png"),
  party: require("../../assets/capy-party.png"),
};

function moodKey(
  spent: number,
  budget: number,
  saved: number,
  goal: number
): keyof typeof CAPY {
  // Hitting the savings goal is the one moment worth celebrating, and it's
  // what capy-party.png was drawn for — until now nothing ever showed it.
  if (goal > 0 && saved >= goal) return "party";
  if (budget <= 0) return "chill";
  const ratio = spent / budget;
  if (ratio <= 0.7) return "chill";
  if (ratio <= 1) return "careful";
  return "sad";
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { derived, transactions, profile, loading, error, retry } = useFinance();
  const { mood, income, spent, saved, balance, savingsGoal } = derived;
  const recent = transactions.slice(0, 4);
  const celebrating = savingsGoal > 0 && saved >= savingsGoal;
  const capy = CAPY[moodKey(spent, derived.budget, saved, savingsGoal)];

  // 50 / 30 / 20 breakdown. Savings is excluded from needs/wants because it
  // has its own row — otherwise a savings transfer would be counted twice.
  const expensesMonth = transactions.filter(
    (t) => t.type === "expense" && t.category !== "savings" && isThisMonth(t.date)
  );
  const needsSpent = expensesMonth
    .filter((t) => cat(t.category)?.type === "needs")
    .reduce((s, t) => s + t.amount, 0);
  const wantsSpent = expensesMonth
    .filter((t) => cat(t.category)?.type === "wants")
    .reduce((s, t) => s + t.amount, 0);
  const needsTarget = income * 0.5;
  const wantsTarget = income * 0.3;
  const savingsTarget = savingsGoal > 0 ? savingsGoal : income * 0.2;

  const savingsPct = savingsTarget > 0 ? Math.min((saved / savingsTarget) * 100, 100) : 0;
  const toSave = Math.max(savingsTarget - saved, 0);

  // Greeting uses the real account — never a hardcoded name. The name chosen
  // at signup wins; the email prefix is only a fallback for accounts created
  // before usernames existed.
  const displayName =
    profile?.username?.trim() ||
    (user?.user_metadata?.username as string | undefined)?.trim() ||
    (user?.email ? user.email.split("@")[0] : "there");
  // Alerts are live conditions, not a stored feed — the badge shows how many
  // are currently true.
  const alertCount = buildAlerts(transactions, profile).length;
  const logStreak = streak(transactions);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.space.md }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting} numberOfLines={1}>
            Hello, {displayName}! 👋
          </Text>
          <Text style={styles.subGreeting}>Welcome back to Tabara</Text>
        </View>

        <Pressable
          onPress={() => router.push("/notifications")}
          hitSlop={8}
          style={styles.bell}
          accessibilityLabel="Notifications"
        >
          <Ionicons name="notifications-outline" size={20} color={theme.primaryDark} />
          {alertCount > 0 && <View style={styles.dot} />}
        </Pressable>

        <Pressable onPress={() => router.push("/profile")} hitSlop={8} accessibilityLabel="Profile">
          <Image source={CAPY.chill} style={styles.avatar} />
        </Pressable>
      </View>

      <FadeInView delay={40}>
        <BalanceCard
          label={`${monthLabel()} balance`}
          balance={balance}
          income={income}
          expense={spent}
        />
      </FadeInView>

      {/* The habit hook — placed high because that's what makes it work. */}
      <FadeInView delay={70}>
        <StreakCard streak={logStreak} week={weekActivity(transactions)} />
      </FadeInView>

      <FadeInView delay={130}>
        <QuickActions
          actions={[
            { icon: "add", label: "Add", onPress: () => router.push("/(tabs)/add") },
            { icon: "options-outline", label: "Budgets", onPress: () => router.push("/budgets") },
            { icon: "chatbubble-ellipses-outline", label: "Ask Kapy", onPress: () => router.push("/(tabs)/kapy") },
          ]}
        />
      </FadeInView>

      {/* Kapy's mood — Tabara's personality, and the app's whole reason to
          feel different from a bank app. Given room to actually be seen. */}
      <FadeInView delay={160}>
        <Card style={[styles.capyCard, celebrating && styles.capyCardParty]}>
          <PopIn delay={260}>
            <Image source={capy} style={styles.capyImg} resizeMode="contain" />
          </PopIn>
          <View style={{ flex: 1 }}>
            <Text style={styles.capyMood}>
              {celebrating ? "Savings goal smashed! 🎉" : mood.title}
            </Text>
            <Text style={styles.capySub}>
              {celebrating
                ? `You've set aside ${fmt(saved)} this month. Kapy is proud of you.`
                : mood.subtitle}
            </Text>
          </View>
        </Card>
      </FadeInView>

      {/* Savings + Budget, side by side */}
      <FadeInView delay={220} style={styles.pairRow}>
        <Card style={styles.pairCard}>
          <Text style={styles.pairTitle}>Total Savings</Text>
          <Text style={styles.pairValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {fmt(saved)}
          </Text>

          {savingsTarget > 0 ? (
            <>
              <View style={{ marginTop: theme.space.md }}>
                <ProgressBar pct={savingsPct} color={theme.accent} />
              </View>
              <Text style={styles.pairHint} numberOfLines={1}>
                {toSave > 0 ? `To save: ${fmt(toSave)}` : "Goal reached 🎉"}
              </Text>
            </>
          ) : (
            <Text style={styles.pairHint}>Set a savings goal in Profile</Text>
          )}

          <Pressable onPress={() => router.push("/(tabs)/insights")} hitSlop={6}>
            <Text style={styles.pairLink}>Check progress →</Text>
          </Pressable>
        </Card>

        <Card style={styles.pairCard}>
          <Text style={styles.pairTitle}>Budget Breakdown</Text>
          {income > 0 ? (
            <View style={{ marginTop: theme.space.md }}>
              <ProgressRow
                label="Needs (50%)"
                spent={needsSpent}
                target={needsTarget}
                color={theme.info}
              />
              <ProgressRow
                label="Wants (30%)"
                spent={wantsSpent}
                target={wantsTarget}
                color={theme.peach}
              />
              <ProgressRow
                label="Savings (20%)"
                spent={saved}
                target={savingsTarget}
                color={theme.accent}
                goodIsHigh
              />
            </View>
          ) : (
            <Text style={styles.pairHint}>Add your income to see the 50/30/20 split</Text>
          )}
        </Card>
      </FadeInView>

      {/* Recent */}
      <SectionHeader
        title="Recent Transactions"
        actionLabel={transactions.length > 4 ? "See all" : undefined}
        onAction={transactions.length > 4 ? () => router.push("/(tabs)/history") : undefined}
      />

      {loading ? (
        <TransactionSkeleton rows={3} />
      ) : error ? (
        <ErrorState
          message="We couldn't load your transactions. Check your connection."
          onRetry={retry}
        />
      ) : recent.length === 0 ? (
        <EmptyState
          capy="chill"
          title="No transactions yet"
          message="Start tracking your spending to understand your financial habits."
          actionLabel="Add transaction"
          onAction={() => router.push("/(tabs)/add")}
        />
      ) : (
        <View style={{ gap: theme.space.sm }}>
          {recent.map((t) => (
            <TransactionItem key={t.id} txn={t} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: {
    paddingHorizontal: theme.screenPadding,
    paddingBottom: theme.space.xxl,
    gap: theme.space.base,
  },

  headerRow: { flexDirection: "row", alignItems: "center", gap: theme.space.md },
  greeting: { fontSize: theme.size.title, fontWeight: "800", color: theme.text },
  subGreeting: { fontSize: theme.size.label, color: theme.muted, marginTop: 1 },
  bell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  dot: {
    position: "absolute",
    top: 9,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.danger,
    borderWidth: 1.5,
    borderColor: theme.card,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
  },

  capyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.base,
    paddingVertical: theme.space.base,
  },
  capyCardParty: { backgroundColor: theme.accentSoft, borderColor: theme.accent },
  capyImg: { width: 84, height: 84 },
  capyMood: { fontSize: theme.size.section, fontWeight: "800", color: theme.text },
  capySub: { fontSize: theme.size.label, color: theme.muted, marginTop: 3, lineHeight: 19 },

  pairRow: { flexDirection: "row", gap: theme.space.md },
  pairCard: { flex: 1, padding: theme.space.base },
  pairTitle: { fontSize: theme.size.label, fontWeight: "800", color: theme.text },
  pairValue: {
    fontSize: theme.size.display - 4,
    fontWeight: "800",
    color: theme.text,
    marginTop: theme.space.xs,
  },
  pairHint: { fontSize: theme.size.caption, color: theme.muted, marginTop: theme.space.sm },
  pairLink: {
    fontSize: theme.size.caption,
    fontWeight: "800",
    color: theme.primary,
    marginTop: theme.space.md,
  },
});
