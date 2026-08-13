import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CATEGORIES } from "../../constants/categories";
import { theme } from "../../constants/theme";
import { scanReceipt } from "../../lib/ai";
import { useAuth } from "../../lib/auth-context";
import { addTransaction, type TxnType } from "../../lib/db";

export default function Add() {
  const { user } = useAuth();
  const [type, setType] = useState<TxnType>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("food");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);

  const save = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      Alert.alert("Hold on", "Enter a valid amount.");
      return;
    }
    if (!user) {
      Alert.alert("Guest mode", "Sign up with a real account to save transactions.");
      return;
    }
    setSaving(true);
    try {
      await addTransaction(user.id, { amount: amt, type, category, note: note.trim() });
      setAmount("");
      setNote("");
      router.navigate("/(tabs)");
    } catch (e: any) {
      Alert.alert("Couldn't save", e.message ?? "Try again.");
    } finally {
      setSaving(false);
    }
  };

  const pickAndScan = async (source: "camera" | "library") => {
    const perm =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow access to use this.");
      return;
    }
const opts = { base64: true, quality: 0.5, mediaTypes: ["images"] as ImagePicker.MediaType[] };
    
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
      setType("expense");
      if (r.amount) setAmount(String(r.amount));
      if (r.category) setCategory(r.category);
      if (r.merchant) setNote(r.merchant);
      Alert.alert("Scanned! 🦫", "Check the details below, then tap Save.");
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

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Log spending</Text>

      {/* Receipt scan */}
      <Pressable style={styles.scan} onPress={onScanPress} disabled={scanning}>
        {scanning ? (
          <>
            <ActivityIndicator color={theme.primary} />
            <Text style={styles.scanText}>Reading receipt…</Text>
          </>
        ) : (
          <>
            <Ionicons name="camera-outline" size={20} color={theme.primary} />
            <Text style={styles.scanText}>Snap a receipt — let Kapy fill it in</Text>
          </>
        )}
      </Pressable>

      <View style={styles.toggle}>
        {(["expense", "income"] as TxnType[]).map((t) => (
          <Pressable
            key={t}
            style={[styles.toggleBtn, type === t && styles.toggleBtnActive]}
            onPress={() => setType(t)}
          >
            <Text style={[styles.toggleText, type === t && styles.toggleTextActive]}>
              {t === "expense" ? "Expense" : "Income"}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Amount (RM)</Text>
      <TextInput
        style={styles.amountInput}
        placeholder="0.00"
        placeholderTextColor={theme.muted}
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
      />

      <Text style={styles.label}>Category</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
        {CATEGORIES.map((c) => {
          const active = category === c.id;
          return (
            <Pressable
              key={c.id}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setCategory(c.id)}
            >
              <Ionicons name={c.icon as any} size={16} color={active ? "#fff" : theme.primary} />
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={styles.label}>Note (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. lunch with member"
        placeholderTextColor={theme.muted}
        value={note}
        onChangeText={setNote}
      />

      <Pressable style={[styles.save, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
        <Text style={styles.saveText}>{saving ? "Saving..." : "Save"}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 20, gap: 12 },
  title: { fontSize: 22, fontWeight: "700", color: theme.text, marginBottom: 4 },
  scan: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.primary,
    borderStyle: "dashed",
    backgroundColor: theme.card,
  },
  scanText: { color: theme.primary, fontSize: 14, fontWeight: "600" },
  toggle: { flexDirection: "row", backgroundColor: theme.card, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: theme.border },
  toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center" },
  toggleBtnActive: { backgroundColor: theme.primary },
  toggleText: { color: theme.muted, fontWeight: "600" },
  toggleTextActive: { color: "#fff" },
  label: { fontSize: 14, color: theme.text, fontWeight: "500", marginTop: 6 },
  amountInput: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 28,
    fontWeight: "700",
    color: theme.text,
  },
  input: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: theme.text,
  },
  chips: { flexDirection: "row" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    marginRight: 8,
  },
  chipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  chipText: { color: theme.text, fontSize: 13, fontWeight: "500" },
  chipTextActive: { color: "#fff" },
  save: { backgroundColor: theme.primary, borderRadius: 12, padding: 16, alignItems: "center", marginTop: 10 },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});