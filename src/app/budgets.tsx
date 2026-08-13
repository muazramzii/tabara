import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CATEGORIES } from "../constants/categories";
import { theme } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import {
    getUserProfile,
    listenTransactions,
    saveBudgets,
    type Transaction,
    type UserProfile,
} from "../lib/db";

const fmt = (n: number) => `RM ${n.toFixed(2)}`;
const isThisMonth = (d: Date) => {
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
};

export default function Budgets() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Load profile + transactions directly (this screen is outside the tabs provider)
  useEffect(() => {
    if (!user) return;
    getUserProfile(user.id).then((p) => {
      setProfile(p);
      const o: Record<string, string> = {};
      const b = p?.budgets ?? {};
      Object.entries(b).forEach(([id, val]) => {
        o[id] = String(val);
      });
      setLocal(o);
    });
    const unsub = listenTransactions(user.id, setTransactions);
    return unsub;
  }, [user]);

  const spentByCat: Record<string, number> = {};
  transactions.forEach((t) => {
    if (t.type === "expense" && isThisMonth(t.date)) {
      spentByCat[t.category] = (spentByCat[t.category] ?? 0) + t.amount;
    }
  });

  const save = async () => {
    if (!user) {
      Alert.alert("Guest mode", "Sign up to save budgets.");
      return;
    }
    const obj: Record<string, number> = {};
    Object.entries(local).forEach(([id, val]) => {
      const n = parseFloat(val);
      if (n > 0) obj[id] = n;
    });
    setSaving(true);
    try {
      await saveBudgets(user.id, obj);
      router.back();
    } catch (e: any) {
      Alert.alert("Couldn't save", e.message ?? "Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </Pressable>
        <Text style={styles.title}>Monthly budgets</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hint}>Set a monthly limit per category. Leave blank for no limit.</Text>
        {CATEGORIES.map((c) => {
          const spent = spentByCat[c.id] ?? 0;
          const limit = parseFloat(local[c.id]) || 0;
          const pct = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
          const over = limit > 0 && spent > limit;
          return (
            <View key={c.id} style={styles.row}>
              <View style={styles.rowTop}>
                <View style={styles.catInfo}>
                  <Ionicons name={c.icon as any} size={18} color={theme.primary} />
                  <Text style={styles.catLabel}>{c.label}</Text>
                </View>
                <View style={styles.inputWrap}>
                  <Text style={styles.rm}>RM</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0"
                    placeholderTextColor={theme.muted}
                    keyboardType="decimal-pad"
                    value={local[c.id] ?? ""}
                    onChangeText={(v) => setLocal((s) => ({ ...s, [c.id]: v }))}
                  />
                </View>
              </View>
              {limit > 0 && (
                <View style={{ marginTop: 8 }}>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${pct}%`, backgroundColor: over ? theme.danger : theme.accent }]} />
                  </View>
                  <Text style={[styles.spentText, over && { color: theme.danger }]}>
                    {fmt(spent)} {over ? "· over budget!" : `of ${fmt(limit)}`}
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable style={[styles.save, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
          <Text style={styles.saveText}>{saving ? "Saving..." : "Save budgets"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  title: { fontSize: 18, fontWeight: "700", color: theme.text },
  content: { padding: 16, gap: 12 },
  hint: { fontSize: 13, color: theme.muted, marginBottom: 4 },
  row: { backgroundColor: theme.card, borderRadius: theme.radius.md, padding: 14, borderWidth: 1, borderColor: theme.border },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  catInfo: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  catLabel: { fontSize: 15, fontWeight: "600", color: theme.text },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: theme.bg, borderRadius: 10, paddingHorizontal: 10, borderWidth: 1, borderColor: theme.border },
  rm: { fontSize: 13, color: theme.muted },
  input: { width: 70, paddingVertical: 8, fontSize: 15, color: theme.text, textAlign: "right" },
  track: { height: 8, borderRadius: 4, backgroundColor: theme.border, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
  spentText: { fontSize: 12, color: theme.muted, marginTop: 5 },
  footer: { padding: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: theme.card },
  save: { backgroundColor: theme.primary, borderRadius: 12, padding: 16, alignItems: "center" },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});