import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
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
import { CategoryField } from "../../components/ui/category-field";
import { Segmented } from "../../components/ui/controls";
import { DateField } from "../../components/ui/date-field";
import { categoriesFor } from "../../constants/categories";
import { theme } from "../../constants/theme";
import { scanReceipt } from "../../lib/ai";
import { useAuth } from "../../lib/auth-context";
import { addTransaction, type TxnType } from "../../lib/db";
import { cat } from "../../lib/format";

export default function Add() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [type, setType] = useState<TxnType>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("food");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date());
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);

  // Expenses and income need different category lists — filing a salary under
  // "Food & Drink" skewed the donut and the needs/wants split.
  const categories = categoriesFor(type);

  const changeType = (next: TxnType) => {
    setType(next);
    // The current pick won't exist in the other list, so land on its first entry.
    const list = categoriesFor(next);
    if (!list.some((c) => c.id === category)) setCategory(list[0].id);
  };

  // ── unchanged: save ──────────────────────────────────────
  const save = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      Alert.alert("Hold on", "Enter a valid amount.");
      return;
    }
    if (!user) {
      Alert.alert("Not signed in", "Log in again to save transactions.");
      return;
    }
    setSaving(true);
    try {
      await addTransaction(user.id, {
        amount: amt,
        type,
        category,
        note: note.trim(),
        date,
      });
      setAmount("");
      setNote("");
      router.navigate("/(tabs)");
    } catch (e: any) {
      Alert.alert("Couldn't save", e.message ?? "Try again.");
    } finally {
      setSaving(false);
    }
  };

  // ── unchanged: receipt scanning ──────────────────────────
  const pickAndScan = async (source: "camera" | "library") => {
    const perm =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow access to use this.");
      return;
    }
    const opts = {
      base64: true,
      quality: 0.5,
      mediaTypes: ["images"] as ImagePicker.MediaType[],
    };

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);

    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset.base64) {
      Alert.alert("Oops", "Couldn't read that image.");
      return;
    }

    setScanning(true);
    try {
      const r = await scanReceipt(asset.base64, asset.mimeType ?? "image/jpeg");
      changeType("expense");
      if (r.amount) setAmount(String(r.amount));
      if (r.category) setCategory(r.category);
      if (r.merchant) setNote(r.merchant);
      // Only override the date when the receipt actually had a legible one.
      // Otherwise today stands, which is what the field already shows.
      if (r.date) setDate(r.date);

      // Say what was and wasn't read, rather than a blanket "Scanned!" — the
      // user can only check what they know to look at.
      const notes: string[] = [];
      if (!r.amount) notes.push("couldn't read the total");
      if (!r.date) notes.push("couldn't read a date, so it's filed as today");
      // Below ~0.6 the model is telling us the image was hard to read.
      const shaky = r.confidence !== null && r.confidence < 0.6;

      if (notes.length > 0 || shaky) {
        Alert.alert(
          "Scanned — please double-check 🦫",
          notes.length > 0
            ? `Kapy ${notes.join(", and ")}. Check everything below before saving.`
            : "That photo was hard to read. Check the details below before saving."
        );
      } else {
        Alert.alert("Scanned! 🦫", "Check the details below, then tap Save.");
      }
    } catch (e: any) {
      Alert.alert("Scan failed", e.message ?? "Try again.");
    } finally {
      setScanning(false);
    }
  };

  const onScanPress = () => {
    Alert.alert("Add receipt", "Choose a source", [
      { text: "Take photo", onPress: () => pickAndScan("camera") },
      { text: "Choose from gallery", onPress: () => pickAndScan("library") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const selected = cat(category);
  const isIncome = type === "income";
  // Money in is green, money out is clay. The amount surface carries that
  // meaning instead of being decoratively tinted.
  const accent = isIncome ? theme.income : theme.expense;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + theme.space.md }]}>
        <Text style={styles.screenTitle}>{isIncome ? "Log income" : "Log spending"}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Segmented
          options={[
            { key: "expense", label: "Expense" },
            { key: "income", label: "Income" },
          ]}
          activeKey={type}
          onSelect={(k) => changeType(k as TxnType)}
        />

        {/* Amount — the one thing this screen is really for */}
        <View style={[styles.amountBox, { backgroundColor: accent + "14" }]}>
          <Text style={[styles.amountLabel, { color: accent }]}>
            {isIncome ? "AMOUNT RECEIVED" : "AMOUNT SPENT"}
          </Text>
          <View style={styles.amountRow}>
            <Text style={[styles.currency, { color: accent }]}>RM</Text>
            <TextInput
              style={styles.amountInput}
              placeholder="0.00"
              placeholderTextColor={theme.border}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
            />
          </View>
        </View>

        {/* Receipt scan — a solid card, not a dashed dropzone */}
        <Pressable
          style={({ pressed }) => [styles.scan, pressed && { opacity: 0.7 }]}
          onPress={onScanPress}
          disabled={scanning}
        >
          <View style={styles.scanIcon}>
            {scanning ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Ionicons name="scan-outline" size={19} color={theme.primary} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.scanTitle}>
              {scanning ? "Reading receipt…" : "Scan a receipt"}
            </Text>
            <Text style={styles.scanSub}>
              {scanning ? "Kapy is working it out" : "Let Kapy fill this in for you"}
            </Text>
          </View>
          {!scanning && (
            <Ionicons name="chevron-forward" size={18} color={theme.muted} />
          )}
        </Pressable>

        <View style={styles.field}>
          <Text style={styles.label}>DESCRIPTION</Text>
          <TextInput
            style={styles.input}
            placeholder={isIncome ? "e.g. August salary" : "e.g. lunch with member"}
            placeholderTextColor={theme.muted}
            value={note}
            onChangeText={setNote}
          />
        </View>

        <View style={styles.field}>
          <DateField value={date} onChange={setDate} label="WHEN" />
        </View>

        <View style={styles.field}>
          <CategoryField
            value={category}
            onChange={setCategory}
            categories={categories}
          />

          {/* Needs / Wants comes from the category, it isn't a separate choice */}
          {!isIncome && !!selected && (
            <View style={styles.hint}>
              <Ionicons
                name={
                  selected.type === "savings"
                    ? "wallet-outline"
                    : selected.type === "needs"
                      ? "shield-checkmark-outline"
                      : "heart-outline"
                }
                size={14}
                color={theme.muted}
              />
              <Text style={styles.hintText}>
                {selected.type === "savings" ? (
                  <>
                    Goes to <Text style={styles.hintStrong}>Savings</Text> — set aside,
                    not spent
                  </>
                ) : (
                  <>
                    Counts as{" "}
                    <Text style={styles.hintStrong}>
                      {selected.type === "needs" ? "Needs" : "Wants"}
                    </Text>{" "}
                    in your 50/30/20 split
                  </>
                )}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Save sits on a bar of its own so it's always reachable */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.space.sm }]}>
        <Pressable
          style={({ pressed }) => [styles.save, (saving || pressed) && { opacity: 0.75 }]}
          onPress={save}
          disabled={saving}
        >
          <Text style={styles.saveText}>
            {saving ? "Saving…" : isIncome ? "Save income" : "Save transaction"}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  header: { paddingHorizontal: theme.screenPadding, paddingBottom: theme.space.base },
  screenTitle: { fontSize: theme.size.title, fontWeight: "800", color: theme.text },
  content: {
    paddingHorizontal: theme.screenPadding,
    paddingBottom: theme.space.xl,
    gap: theme.space.base,
  },

  amountBox: {
    borderRadius: theme.radius.lg,
    paddingVertical: theme.space.xl,
    paddingHorizontal: theme.space.lg,
    alignItems: "center",
  },
  amountLabel: {
    fontSize: theme.size.caption,
    fontWeight: "800",
    letterSpacing: 1.1,
    opacity: 0.8,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    marginTop: theme.space.sm,
  },
  currency: { fontSize: theme.size.title, fontWeight: "800" },
  amountInput: {
    fontSize: 42,
    fontWeight: "800",
    color: theme.text,
    letterSpacing: -1.5,
    minWidth: 120,
    padding: 0,
    textAlign: "left",
  },

  scan: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.md,
    backgroundColor: theme.card,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    borderWidth: 1,
    borderColor: theme.border,
    ...theme.shadowSm,
  },
  scanIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.primary + "1A",
    alignItems: "center",
    justifyContent: "center",
  },
  scanTitle: { fontSize: theme.size.body, fontWeight: "700", color: theme.text },
  scanSub: { fontSize: theme.size.caption, color: theme.muted, marginTop: 1 },

  // Every label on this screen now uses one style. It previously mixed
  // sentence case and uppercase micro-labels, which read as unfinished.
  field: { gap: theme.space.sm },
  label: {
    fontSize: theme.size.caption,
    fontWeight: "800",
    color: theme.muted,
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.base,
    paddingVertical: theme.space.base,
    fontSize: theme.size.body,
    color: theme.text,
  },

  hint: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: theme.space.xs },
  hintText: { flex: 1, fontSize: theme.size.caption, color: theme.muted },
  hintStrong: { fontWeight: "800", color: theme.text },

  footer: {
    paddingHorizontal: theme.screenPadding,
    paddingTop: theme.space.md,
    backgroundColor: theme.card,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  save: {
    backgroundColor: theme.primaryDark,
    borderRadius: theme.radius.md,
    paddingVertical: theme.space.base + 2,
    alignItems: "center",
    ...theme.shadowSm,
  },
  saveText: { color: theme.onDark, fontSize: theme.size.body, fontWeight: "800" },
});
