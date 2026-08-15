import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "../components/ui/controls";
import { EmptyState } from "../components/ui/states";
import { theme } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import { useFinance } from "../lib/finance-context";
import { buildAlerts, type Alert } from "../lib/insights";

const TONE = {
  good: { color: theme.income, bg: theme.income + "1A" },
  warn: { color: theme.warning, bg: theme.warning + "1A" },
  info: { color: theme.info, bg: theme.info + "1A" },
};

function AlertRow({ alert }: { alert: Alert }) {
  const tone = TONE[alert.tone];
  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: tone.bg }]}>
        <Ionicons name={alert.icon} size={20} color={tone.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{alert.title}</Text>
        <Text style={styles.message}>{alert.message}</Text>
      </View>
      <View style={[styles.pip, { backgroundColor: tone.color }]} />
    </View>
  );
}

export default function Notifications() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { transactions, profile } = useFinance();

  // Nothing to derive alerts from until the session has loaded.
  const alerts = user ? buildAlerts(transactions, profile) : [];

  return (
    <View style={[styles.screen, { paddingTop: insets.top + theme.space.sm }]}>
      <ScreenHeader title="Notifications" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {alerts.length === 0 ? (
          <EmptyState
            capy="party"
            title="All clear"
            message={
              user
                ? "Nothing needs your attention right now. Kapy will nudge you if you drift off budget."
                : "Sign up with a real account to get budget alerts."
            }
          />
        ) : (
          <>
            <Text style={styles.hint}>
              These update by themselves as your spending changes.
            </Text>
            {alerts.map((a) => (
              <AlertRow key={a.id} alert={a} />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: {
    paddingHorizontal: theme.screenPadding,
    paddingBottom: theme.space.xxl,
    gap: theme.space.sm,
  },
  hint: {
    fontSize: theme.size.caption,
    color: theme.muted,
    textAlign: "center",
    marginBottom: theme.space.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.md,
    backgroundColor: theme.card,
    borderRadius: theme.radius.md,
    padding: theme.space.base,
    borderWidth: 1,
    borderColor: theme.border,
    ...theme.shadowSm,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: theme.size.body, fontWeight: "800", color: theme.text },
  message: {
    fontSize: theme.size.label,
    color: theme.muted,
    marginTop: 2,
    lineHeight: 18,
  },
  pip: { width: 8, height: 8, borderRadius: 4 },
});
