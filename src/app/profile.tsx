import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import {
    getUserProfile,
    listenTransactions,
    saveUserProfile,
    type Transaction,
    type UserProfile,
} from "../lib/db";

const fmt = (n: number) => `RM ${n.toFixed(2)}`;
const isThisMonth = (d: Date) => {
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
};
const capy = require("../assets/capy-chill.png");

export default function Profile() {
  const insets = useSafeAreaInsets();
  const { user, guest, logout } = useAuth();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [income, setIncome] = useState("");
  const [goal, setGoal] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    getUserProfile(user.id).then((p) => {
      setProfile(p);
      if (p) {
        setIncome(String(p.income ?? ""));
        setGoal(String(p.savingsGoal ?? ""));
      }
    });
    const unsub = listenTransactions(user.id, setTransactions);
    return unsub;
  }, [user]);

  const spent = transactions
    .filter((t) => t.type === "expense" && isThisMonth(t.date))
    .reduce((s, t) => s + t.amount, 0);
  const inc = profile?.income ?? 0;
  const sg = profile?.savingsGoal ?? 0;
  const savingsRate = inc > 0 ? Math.round((sg / inc) * 100) : 0;

  const name = user?.email ? user.email.split("@")[0] : "Guest";
  const handle = user?.email ? "@" + user.email.split("@")[0] : "@guest";

  const save = async () => {
    if (!user) {
      Alert.alert("Guest mode", "Sign up to save your setup.");
      return;
    }
    const i = parseFloat(income) || 0;
    const g = parseFloat(goal) || 0;
    if (g > i) {
      Alert.alert("Hmm 🦫", "Savings goal can't be more than your income.");
      return;
    }
    setSaving(true);
    try {
      await saveUserProfile(user.id, { income: i, savingsGoal: g });
      setProfile((p) => ({ ...(p ?? {}), income: i, savingsGoal: g } as UserProfile));
      Alert.alert("Saved 🦫", "Your money setup is updated.");
    } catch (e: any) {
      Alert.alert("Couldn't save", e.message ?? "Try again.");
    } finally {
      setSaving(false);
    }
  };

  const confirmLogout = () => {
    Alert.alert("Log out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: logout },
    ]);
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </Pressable>
        <Text style={styles.title}>Profile</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.avatarWrap}>
            <Image source={capy} style={styles.avatar} />
          </View>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.handle}>{handle}</Text>
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>STUDENT</Text>
            </View>
            {!guest && (
              <View style={[styles.badge, { backgroundColor: theme.gold }]}>
                <Text style={[styles.badgeText, { color: "#5A4A1E" }]}>MEMBER</Text>
              </View>
            )}
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{savingsRate}%</Text>
            <Text style={styles.statLabel}>Savings Rate</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{fmt(inc)}</Text>
            <Text style={styles.statLabel}>Income</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{fmt(spent)}</Text>
            <Text style={styles.statLabel}>Spent (mo)</Text>
          </View>
        </View>

        {/* Editable setup */}
        <Text style={styles.section}>Money setup</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Monthly income (RM)</Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={income}
            onChangeText={setIncome}
            placeholder="0"
            placeholderTextColor={theme.muted}
          />
          <Text style={[styles.label, { marginTop: 12 }]}>Savings goal (RM / month)</Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={goal}
            onChangeText={setGoal}
            placeholder="0"
            placeholderTextColor={theme.muted}
          />
          <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
            <Text style={styles.saveText}>{saving ? "Saving..." : "Save setup"}</Text>
          </Pressable>
        </View>

        {/* Account */}
        <Text style={styles.section}>Account</Text>
        <View style={styles.card}>
          <View style={styles.accRow}>
            <Text style={styles.accLabel}>Email</Text>
            <Text style={styles.accValue}>{user?.email ?? "Guest (not signed in)"}</Text>
          </View>
        </View>

        <Pressable style={styles.logout} onPress={confirmLogout}>
          <Ionicons name="log-out-outline" size={20} color={theme.danger} />
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  title: { fontSize: 18, fontWeight: "700", color: theme.text },
  content: { padding: 16, gap: 10, paddingBottom: 32 },
  hero: {
    backgroundColor: theme.primaryDark,
    borderRadius: theme.radius.lg,
    padding: 22,
    alignItems: "center",
    ...theme.shadow,
  },
  avatarWrap: { width: 84, height: 84, borderRadius: 22, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", padding: 6 },
  avatar: { width: "100%", height: "100%", resizeMode: "contain" },
  name: { fontSize: 22, fontWeight: "800", color: "#fff", marginTop: 12 },
  handle: { fontSize: 13, color: "#E6DECF", marginTop: 2 },
  badgeRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  badge: { backgroundColor: theme.accentSoft, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 },
  badgeText: { fontSize: 11, fontWeight: "800", color: theme.primaryDark, letterSpacing: 0.5 },
  statRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  statCard: { flex: 1, backgroundColor: theme.card, borderRadius: theme.radius.md, padding: 14, alignItems: "center", borderWidth: 1, borderColor: theme.border },
  statValue: { fontSize: 16, fontWeight: "800", color: theme.text },
  statLabel: { fontSize: 11, color: theme.muted, marginTop: 4, textAlign: "center" },
  section: { fontSize: 16, fontWeight: "700", color: theme.text, marginTop: 14, marginBottom: 4 },
  card: { backgroundColor: theme.card, borderRadius: theme.radius.md, padding: 16, borderWidth: 1, borderColor: theme.border },
  label: { fontSize: 13, color: theme.muted, fontWeight: "600" },
  input: { backgroundColor: theme.bg, borderRadius: 10, padding: 12, fontSize: 18, fontWeight: "700", color: theme.text, marginTop: 6, borderWidth: 1, borderColor: theme.border },
  saveBtn: { backgroundColor: theme.primary, borderRadius: 12, padding: 14, alignItems: "center", marginTop: 16 },
  saveText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  accRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  accLabel: { fontSize: 14, color: theme.muted },
  accValue: { fontSize: 14, fontWeight: "600", color: theme.text, flexShrink: 1, textAlign: "right" },
  logout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 20, padding: 14 },
  logoutText: { fontSize: 15, fontWeight: "700", color: theme.danger },
});