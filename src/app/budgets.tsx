import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProgressBar } from "../components/ui/cards";
import { ScreenHeader } from "../components/ui/controls";
import { CATEGORIES } from "../constants/categories";
import { colorForCategory, theme } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import { saveBudgets } from "../lib/db";
import { useFinance } from "../lib/finance-context";
import { fmt, isThisMonth } from "../lib/format";

export default function Budgets() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  // Shares the app-wide subscription rather than opening its own.
  const { transactions, profile, refreshProfile } = useFinance();

  const [local, setLocal] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Seed the inputs from the saved budgets once the profile arrives.
  useEffect(() => {
    if (!profile) return;
    const o: Record<string, string> = {};
    Object.entries(profile.budgets ?? {}).forEach(([id, val]) => {
      o[id] = String(val);
    });
    setLocal(o);
  }, [profile]);

  const spentByCat: Record<string, number> = {};
  transactions.forEach((t) => {
    if (t.type === "expense" && isThisMonth(t.date)) {
      spentByCat[t.category] = (spentByCat[t.category] ?? 0) + t.amount;
    }
  });

  // ── unchanged: save ──────────────────────────────────────
  const save = async () => {
    if (!user) {
      Alert.alert("Not signed in", "Log in again to save budgets.");
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
      // Refresh through the shared provider so Insights sees the new limits.
      await refreshProfile();
      router.back();
    } catch (e: any) {
      Alert.alert("Couldn't save", e.message ?? "Try again.");
    } finally {
      setSaving(false);
    }
  };

  const setCount = Object.values(local).filter((v) => (parseFloat(v) || 0) > 0).length;

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top + theme.space.sm }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScreenHeader title="Monthly budgets" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.banner}>
          <Ionicons name="information-circle-outline" size={18} color={theme.primaryDark} />
          <Text style={styles.bannerText}>
            Set a monthly limit per category. Leave blank for no limit.
            {setCount > 0 ? `  ${setCount} set.` : ""}
          </Text>
        </View>

        {CATEGORIES.map((c) => {
          const spent = spentByCat[c.id] ?? 0;
          const limit = parseFloat(local[c.id]) || 0;
          const pct = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
          const over = limit > 0 && spent > limit;
          const tint = colorForCategory(c.id);

          return (
            <View key={c.id} style={[styles.row, limit > 0 && { borderColor: tint + "66" }]}>
              <View style={styles.rowTop}>
                <View style={[styles.catIcon, { backgroundColor: tint + "22" }]}>
                  <Ionicons name={c.icon as any} size={18} color={tint} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.catLabel} numberOfLines={1}>
                    {c.label}
                  </Text>
                  <Text style={styles.catType}>
                    {c.type === "savings" ? "Savings" : c.type === "needs" ? "Needs" : "Wants"}
                  </Text>
                </View>

                <View style={[styles.inputWrap, limit > 0 && { borderColor: tint }]}>
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
                <View style={{ marginTop: theme.space.md }}>
                  <ProgressBar pct={pct} color={over ? theme.danger : tint} height={8} />
                  <Text style={[styles.spentText, over && { color: theme.danger }]}>
                    {fmt(spent)} {over ? "· over budget!" : `of ${fmt(limit)}`}
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.space.md }]}>
        <Pressable
          style={({ pressed }) => [styles.save, (saving || pressed) && { opacity: 0.7 }]}
          onPress={save}
          disabled={saving}
        >
          <Text style={styles.saveText}>{saving ? "Saving..." : "Save budgets"}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: {
    paddingHorizontal: theme.screenPadding,
    paddingBottom: theme.space.xl,
    gap: theme.space.sm,
  },

  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.sm,
    backgroundColor: theme.accentSoft,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    marginBottom: theme.space.xs,
  },
  bannerText: { flex: 1, fontSize: theme.size.label, color: theme.primaryDark, lineHeight: 18 },

  row: {
    backgroundColor: theme.card,
    borderRadius: theme.radius.md,
    padding: theme.space.base,
    borderWidth: 1,
    borderColor: theme.border,
    ...theme.shadowSm,
  },
  rowTop: { flexDirection: "row", alignItems: "center", gap: theme.space.md },
  catIcon: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  catLabel: { fontSize: theme.size.body, fontWeight: "700", color: theme.text },
  catType: { fontSize: theme.size.caption, color: theme.muted, marginTop: 1 },

  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.bg,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.space.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  rm: { fontSize: theme.size.caption, color: theme.muted, fontWeight: "700" },
  input: {
    width: 62,
    paddingVertical: theme.space.sm + 2,
    fontSize: theme.size.body,
    fontWeight: "700",
    color: theme.text,
    textAlign: "right",
  },

  spentText: { fontSize: theme.size.caption, color: theme.muted, marginTop: 6 },

  footer: {
    paddingHorizontal: theme.screenPadding,
    paddingTop: theme.space.md,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.card,
  },
  save: {
    backgroundColor: theme.primaryDark,
    borderRadius: theme.radius.md,
    padding: theme.space.base + 2,
    alignItems: "center",
  },
  saveText: { color: "#fff", fontSize: theme.size.body, fontWeight: "800" },
});
