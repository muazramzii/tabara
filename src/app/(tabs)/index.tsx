import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth-context";
import { theme } from "../../constants/theme";

export default function Home() {
  const { user, guest, logout } = useAuth();
  const who = user?.email ?? (guest ? "guest" : "");

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.greeting}>Hi there 👋</Text>
        <Pressable onPress={logout} hitSlop={8}>
          <Ionicons name="log-out-outline" size={24} color={theme.muted} />
        </Pressable>
      </View>
      {!!who && <Text style={styles.who}>Signed in as {who}</Text>}

      <View style={styles.capyCard}>
        <Text style={styles.capyEmoji}>🦫</Text>
        <View>
          <Text style={styles.capyMood}>Kapy is feeling chill</Text>
          <Text style={styles.capySub}>Keep it up — you're on track</Text>
        </View>
      </View>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Spent this month</Text>
        <Text style={styles.balanceValue}>RM 0.00</Text>
        <Text style={styles.balanceSub}>of RM 0.00 budget</Text>
      </View>

      <Text style={styles.placeholder}>
        Recent transactions, budgets and goals will appear here.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 20, gap: 16 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  greeting: { fontSize: 22, fontWeight: "700", color: theme.text },
  who: { fontSize: 13, color: theme.muted, marginTop: -8 },
  capyCard: {
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  capyEmoji: { fontSize: 44 },
  capyMood: { fontSize: 16, fontWeight: "600", color: theme.text },
  capySub: { fontSize: 13, color: theme.muted, marginTop: 2 },
  balanceCard: { backgroundColor: theme.primary, borderRadius: 16, padding: 20 },
  balanceLabel: { color: "#F3E9DD", fontSize: 14 },
  balanceValue: { color: "#fff", fontSize: 34, fontWeight: "700", marginTop: 4 },
  balanceSub: { color: "#F3E9DD", fontSize: 13, marginTop: 2 },
  placeholder: { color: theme.muted, fontSize: 14, textAlign: "center", marginTop: 8 },
});
