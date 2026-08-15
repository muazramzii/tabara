import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card, ProgressBar, SectionHeader, StatCard } from "../components/ui/cards";
import { ScreenHeader } from "../components/ui/controls";
import { theme } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import {
  deleteAccount,
  saveUsername,
  saveUserProfile,
  type UserProfile,
} from "../lib/db";
import { useFinance } from "../lib/finance-context";
import { fmt, isThisMonth } from "../lib/format";
import { USERNAME_MAX, validateUsername } from "../lib/password";
import { supabase } from "../lib/supabase";
import { achievements, progression, streak, weekActivity } from "../lib/insights";
import { AchievementGrid, StreakCard } from "../components/ui/gamification";

const capy = require("../assets/capy-chill.png");

export default function Profile() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  // Shares the app-wide subscription instead of opening its own. Before the
  // provider moved to the root this screen had to load everything itself.
  const { transactions, profile, refreshProfile } = useFinance();

  const [income, setIncome] = useState("");
  const [goal, setGoal] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deletingBusy, setDeletingBusy] = useState(false);

  // Seed the inputs once the profile arrives.
  useEffect(() => {
    if (!profile) return;
    setIncome(String(profile.income ?? ""));
    setGoal(String(profile.savingsGoal ?? ""));
  }, [profile]);

  const spent = transactions
    .filter((t) => t.type === "expense" && t.category !== "savings" && isThisMonth(t.date))
    .reduce((s, t) => s + t.amount, 0);
  const inc = profile?.income ?? 0;
  const sg = profile?.savingsGoal ?? 0;
  const savingsRate = inc > 0 ? Math.round((sg / inc) * 100) : 0;

  // Same precedence as the home greeting: the name they chose, then the one
  // carried in the account metadata, then the email prefix for accounts made
  // before usernames existed.
  const name =
    profile?.username?.trim() ||
    (user?.user_metadata?.username as string | undefined)?.trim() ||
    (user?.email ? user.email.split("@")[0] : "there");
  // The handle stays tied to the email — it identifies the account, so it
  // shouldn't change just because the display name did.
  const handle = user?.email ? "@" + user.email.split("@")[0] : "";

  const saveName = async () => {
    if (!user) {
      Alert.alert("Not signed in", "Log in again to change your name.");
      return;
    }
    const error = validateUsername(nameDraft);
    if (error) {
      Alert.alert("Check your name", error);
      return;
    }
    const next = nameDraft.trim();

    setSavingName(true);
    try {
      // Written to both places the name is read from. The profile row is the
      // source of truth; the account metadata is what the app falls back to
      // before the profile has loaded, so letting them drift would make the
      // old name flash on screen at launch.
      await saveUsername(user.id, next);
      await supabase.auth.updateUser({ data: { username: next } });
      await refreshProfile();
      setEditingName(false);
    } catch (e: any) {
      Alert.alert("Couldn't save your name", e.message ?? "Try again.");
    } finally {
      setSavingName(false);
    }
  };

  // All three are pure functions of real usage — see lib/insights.ts.
  const prog = progression(transactions, profile);
  const logStreak = streak(transactions);
  const badges = achievements(transactions, profile);

  // ── unchanged: save ──────────────────────────────────────
  const save = async () => {
    if (!user) {
      Alert.alert("Not signed in", "Log in again to save your setup.");
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
      // Re-read through the shared provider so every screen updates at once.
      await refreshProfile();
      Alert.alert("Saved 🦫", "Your money setup is updated.");
    } catch (e: any) {
      Alert.alert("Couldn't save", e.message ?? "Try again.");
    } finally {
      setSaving(false);
    }
  };

  // Typing the word is deliberate friction. A tap-to-confirm dialog is far too
  // easy to clear by reflex, and this is the one action in the app that cannot
  // be undone — the transactions, the streak and the account all go together.
  const CONFIRM_WORD = "DELETE";

  const handleDelete = async () => {
    if (confirmText.trim().toUpperCase() !== CONFIRM_WORD) return;

    setDeletingBusy(true);
    try {
      await deleteAccount();
      setDeleting(false);
      // Clear the local session too. The server one is already gone, so
      // without this the app would sit holding a token for a user that no
      // longer exists.
      await logout();
      router.replace("/(auth)/welcome");
    } catch (e: any) {
      Alert.alert("Couldn't delete your account", e.message ?? "Try again.");
    } finally {
      setDeletingBusy(false);
    }
  };

  const confirmLogout = () => {
    Alert.alert("Log out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: logout },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top + theme.space.sm }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScreenHeader title="Profile" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.avatarWrap}>
            <Image source={capy} style={styles.avatar} />
          </View>
          {/* The whole row is the target, not just the pencil — a 16px icon
              is an awkward thing to hit on a phone. */}
          <Pressable
            style={styles.nameRow}
            onPress={() => {
              setNameDraft(profile?.username?.trim() ?? "");
              setEditingName(true);
            }}
            hitSlop={8}
          >
            <Text style={styles.name}>{name}</Text>
            <Ionicons name="pencil" size={15} color={theme.primaryDark} />
          </Pressable>
          <Text style={styles.handle}>{handle}</Text>
          {/* Only the level badge remains. There used to be a "STUDENT" chip
              beside it, hardcoded for every account — nothing ever asked for
              an occupation or stored one, so it was decoration dressed up as
              information. Everything else on this screen is derived from real
              data; this now is too. */}
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: theme.gold }]}>
              <Text style={[styles.badgeText, { color: theme.onGold }]}>LVL {prog.level}</Text>
            </View>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statRow}>
          <StatCard
            icon="trending-up"
            value={`${savingsRate}%`}
            label="Savings Rate"
            tint={theme.income}
          />
          <StatCard icon="cash-outline" value={fmt(inc)} label="Monthly Income" tint={theme.info} />
          <StatCard
            icon="star"
            value={`Lvl ${prog.level}`}
            label="XP Level"
            tint={theme.gold}
          />
        </View>

        {/* Progression */}
        <Card style={{ padding: theme.space.base }}>
          <View style={styles.masteryHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.masteryTitle}>Financial Mastery</Text>
              <Text style={styles.masterySub}>
                {prog.maxed
                  ? "Max level reached!"
                  : `${prog.xpIntoLevel} / ${prog.xpForLevel} XP to level ${prog.level + 1}`}
              </Text>
            </View>
            <View style={styles.medal}>
              <Ionicons name="medal-outline" size={20} color={theme.gold} />
            </View>
          </View>
          <ProgressBar pct={prog.pct} color={theme.gold} height={10} />
          <Text style={styles.masteryHint}>
            Earned by logging transactions, setting budgets and tracking different categories.
          </Text>
        </Card>

        {/* Streak — the card already says "N days in a row", so a heading
            above it would just repeat itself. */}
        <StreakCard streak={logStreak} week={weekActivity(transactions)} />

        {/* Achievements */}
        <SectionHeader title="Achievements" subtitle="Earned from what you actually track" />
        <AchievementGrid items={badges} />

        {/* Money setup */}
        <Card style={{ padding: theme.space.base }}>
          <SectionHeader title="Money setup" inCard />
          <Text style={styles.label}>Monthly income (RM)</Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={income}
            onChangeText={setIncome}
            placeholder="0"
            placeholderTextColor={theme.muted}
          />
          <Text style={[styles.label, { marginTop: theme.space.md }]}>
            Savings goal (RM / month)
          </Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={goal}
            onChangeText={setGoal}
            placeholder="0"
            placeholderTextColor={theme.muted}
          />
          <Pressable
            style={({ pressed }) => [styles.saveBtn, (saving || pressed) && { opacity: 0.7 }]}
            onPress={save}
            disabled={saving}
          >
            <Text style={styles.saveText}>{saving ? "Saving..." : "Save setup"}</Text>
          </Pressable>
        </Card>

        {/* Account */}
        <Card style={{ padding: theme.space.base }}>
          <SectionHeader title="Account" inCard />
          <View style={styles.accRow}>
            <Text style={styles.accLabel}>Email</Text>
            <Text style={styles.accValue}>{user?.email ?? "—"}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.accRow}>
            <Text style={styles.accLabel}>Transactions logged</Text>
            <Text style={styles.accValue}>{transactions.length}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.accRow}>
            <Text style={styles.accLabel}>Spent this month</Text>
            <Text style={styles.accValue}>{fmt(spent)}</Text>
          </View>
        </Card>

        <Pressable style={styles.logout} onPress={confirmLogout}>
          <Ionicons name="log-out-outline" size={20} color={theme.danger} />
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>

        {user && (
          <Pressable
            style={styles.deleteLink}
            onPress={() => {
              setConfirmText("");
              setDeleting(true);
            }}
            hitSlop={8}
          >
            <Text style={styles.deleteLinkText}>Delete my account</Text>
          </Pressable>
        )}
      </ScrollView>

      <Modal
        visible={deleting}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleting(false)}
      >
        <View style={styles.modalBackdrop}>
          {/* No tap-to-dismiss backdrop here, unlike the rename sheet. On a
              destructive screen an accidental tap should not be the thing that
              decides anything — Cancel is explicit. */}
          <View style={styles.modalCard}>
            <Text style={styles.deleteTitle}>Delete your account?</Text>

            <Text style={styles.deleteBody}>
              This permanently erases your account and everything in it:
            </Text>
            <View style={styles.deleteList}>
              <Text style={styles.deleteItem}>
                • All {transactions.length} of your transactions
              </Text>
              <Text style={styles.deleteItem}>
                • Your income, savings goal and budgets
              </Text>
              <Text style={styles.deleteItem}>
                • Your streak, level and achievements
              </Text>
            </View>
            <Text style={styles.deleteWarn}>
              This cannot be undone. Kapy can&apos;t bring it back 🦫
            </Text>

            <Text style={styles.deleteLabel}>
              Type {CONFIRM_WORD} to confirm
            </Text>
            <View style={styles.modalInputWrap}>
              <TextInput
                style={styles.modalInput}
                placeholder={CONFIRM_WORD}
                placeholderTextColor={theme.muted}
                autoCapitalize="characters"
                autoCorrect={false}
                value={confirmText}
                onChangeText={setConfirmText}
              />
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalCancel,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => setDeleting(false)}
                disabled={deletingBusy}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalDelete,
                  // Stays visibly inert until the word matches, so the button
                  // itself shows whether the safeguard has been satisfied.
                  confirmText.trim().toUpperCase() !== CONFIRM_WORD && {
                    opacity: 0.4,
                  },
                  pressed && { opacity: 0.7 },
                ]}
                onPress={handleDelete}
                disabled={
                  deletingBusy || confirmText.trim().toUpperCase() !== CONFIRM_WORD
                }
              >
                <Text style={styles.modalDeleteText}>
                  {deletingBusy ? "Deleting…" : "Delete forever"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={editingName}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingName(false)}
      >
        {/* Tapping the backdrop cancels — standard on Android, and the only
            way out if the keyboard covers the buttons on a short screen. */}
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setEditingName(false)}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>What should Kapy call you?</Text>

            <View style={styles.modalInputWrap}>
              <Ionicons name="person-outline" size={18} color={theme.muted} />
              <TextInput
                style={styles.modalInput}
                placeholder="Your name"
                placeholderTextColor={theme.muted}
                autoCapitalize="words"
                autoFocus
                maxLength={USERNAME_MAX}
                value={nameDraft}
                onChangeText={setNameDraft}
                onSubmitEditing={saveName}
                returnKeyType="done"
              />
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalCancel,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => setEditingName(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalSave,
                  (savingName || pressed) && { opacity: 0.7 },
                ]}
                onPress={saveName}
                disabled={savingName}
              >
                <Text style={styles.modalSaveText}>
                  {savingName ? "Saving…" : "Save"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.sm,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(61,53,43,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: theme.space.xl,
  },
  modalCard: {
    width: "100%",
    backgroundColor: theme.card,
    borderRadius: theme.radius.lg,
    padding: theme.space.lg,
    borderWidth: 1,
    borderColor: theme.border,
  },
  modalTitle: {
    fontFamily: theme.font.display,
    fontSize: 18,
    color: theme.text,
    marginBottom: theme.space.base,
    lineHeight: 24,
  },
  modalInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.md,
    backgroundColor: theme.bg,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.base,
  },
  modalInput: {
    flex: 1,
    paddingVertical: theme.space.md,
    fontSize: theme.size.body,
    color: theme.text,
  },
  modalActions: {
    flexDirection: "row",
    gap: theme.space.md,
    marginTop: theme.space.lg,
  },
  modalBtn: {
    flex: 1,
    borderRadius: theme.radius.md,
    paddingVertical: theme.space.md + 2,
    alignItems: "center",
  },
  modalCancel: { backgroundColor: theme.cardAlt },
  modalCancelText: {
    color: theme.primaryDark,
    fontWeight: "800",
    fontSize: theme.size.body,
  },
  modalSave: { backgroundColor: theme.primaryDark },
  modalSaveText: { color: "#fff", fontWeight: "800", fontSize: theme.size.body },

  deleteLink: { alignItems: "center", marginTop: theme.space.base },
  // Understated on purpose. It must be findable — Play Store requires it — but
  // it shouldn't compete with the actions people actually came here for.
  deleteLinkText: {
    color: theme.muted,
    fontSize: theme.size.caption,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  deleteTitle: {
    fontFamily: theme.font.displayBold,
    fontSize: 20,
    color: theme.danger,
    marginBottom: theme.space.sm,
    lineHeight: 26,
  },
  deleteBody: {
    fontSize: theme.size.body,
    color: theme.text,
    lineHeight: 22,
  },
  deleteList: { marginTop: theme.space.sm, gap: 3 },
  deleteItem: {
    fontSize: theme.size.caption,
    color: theme.primaryDark,
    lineHeight: 19,
  },
  deleteWarn: {
    fontSize: theme.size.caption,
    color: theme.danger,
    fontWeight: "700",
    marginTop: theme.space.md,
    lineHeight: 19,
  },
  deleteLabel: {
    fontSize: theme.size.caption,
    fontWeight: "800",
    color: theme.muted,
    letterSpacing: 0.6,
    marginTop: theme.space.base,
    marginBottom: theme.space.sm,
  },
  modalDelete: { backgroundColor: theme.danger },
  modalDeleteText: { color: "#fff", fontWeight: "800", fontSize: theme.size.body },

  screen: { flex: 1, backgroundColor: theme.bg },
  content: {
    paddingHorizontal: theme.screenPadding,
    paddingBottom: theme.space.xxl,
    gap: theme.space.md,
  },

  hero: {
    backgroundColor: theme.primaryDark,
    borderRadius: theme.radius.xl,
    padding: theme.space.xl,
    alignItems: "center",
    ...theme.shadow,
  },
  avatarWrap: {
    width: 88,
    height: 88,
    borderRadius: theme.radius.lg,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
  },
  avatar: { width: "100%", height: "100%", resizeMode: "contain" },
  name: { fontSize: theme.size.title, fontWeight: "800", color: "#fff", marginTop: theme.space.md },
  handle: { fontSize: theme.size.label, color: theme.onDarkMuted, marginTop: 2 },
  badgeRow: { flexDirection: "row", gap: theme.space.sm, marginTop: theme.space.md },
  badge: {
    backgroundColor: theme.accentSoft,
    borderRadius: 14,
    paddingHorizontal: theme.space.md,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: theme.size.caption,
    fontWeight: "800",
    color: theme.primaryDark,
    letterSpacing: 0.5,
  },

  statRow: { flexDirection: "row", gap: theme.space.sm },

  masteryHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.md,
    marginBottom: theme.space.md,
  },
  masteryTitle: { fontSize: theme.size.body, fontWeight: "800", color: theme.text },
  masterySub: { fontSize: theme.size.caption, color: theme.muted, marginTop: 1 },
  medal: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.gold + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  masteryHint: {
    fontSize: theme.size.caption,
    color: theme.muted,
    marginTop: theme.space.sm,
    lineHeight: 16,
  },

  label: { fontSize: theme.size.label, color: theme.muted, fontWeight: "700" },
  input: {
    backgroundColor: theme.bg,
    borderRadius: theme.radius.sm,
    padding: theme.space.md,
    fontSize: theme.size.section,
    fontWeight: "700",
    color: theme.text,
    marginTop: 6,
    borderWidth: 1,
    borderColor: theme.border,
  },
  saveBtn: {
    backgroundColor: theme.primary,
    borderRadius: theme.radius.md,
    padding: theme.space.base,
    alignItems: "center",
    marginTop: theme.space.base,
  },
  saveText: { color: "#fff", fontSize: theme.size.body, fontWeight: "800" },

  accRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: theme.space.xs,
  },
  accLabel: { fontSize: theme.size.label, color: theme.muted },
  accValue: {
    fontSize: theme.size.label,
    fontWeight: "700",
    color: theme.text,
    flexShrink: 1,
    textAlign: "right",
  },
  divider: { height: 1, backgroundColor: theme.border, marginVertical: theme.space.sm },

  logout: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.space.sm,
    marginTop: theme.space.base,
    padding: theme.space.base,
  },
  logoutText: { fontSize: theme.size.body, fontWeight: "800", color: theme.danger },
});
