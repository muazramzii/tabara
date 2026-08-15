import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { ProgressBar } from "../../components/ui/cards";
import { RichText } from "../../components/ui/rich-text";
import { CATEGORIES } from "../../constants/categories";
import { theme } from "../../constants/theme";
import { askKapy, scanReceipt, type KapyMessage } from "../../lib/ai";
import { useFinance } from "../../lib/finance-context";
import { cat, fmt, isThisMonth } from "../../lib/format";

const capyAvatar = require("../../assets/capy-chill.png");

const QUICK_REPLIES = [
  "How am I doing this month?",
  "Any saving tips?",
  "Where's my money going?",
  "Can I afford to eat out?",
];

/**
 * Live spending summary, rendered from the finance context rather than parsed
 * out of Kapy's reply. Same shape as the reference design's card, but it is
 * always the real number.
 */
function SpendingReview() {
  const { derived, transactions } = useFinance();
  const { income, spent, saved, budget, savingsGoal } = derived;

  const expensesMonth = transactions.filter(
    (t) => t.type === "expense" && t.category !== "savings" && isThisMonth(t.date)
  );
  const needs = expensesMonth
    .filter((t) => cat(t.category)?.type === "needs")
    .reduce((s, t) => s + t.amount, 0);
  const wants = expensesMonth
    .filter((t) => cat(t.category)?.type === "wants")
    .reduce((s, t) => s + t.amount, 0);
  const used = budget > 0 ? Math.round((spent / budget) * 100) : 0;

  if (income <= 0) return null;

  return (
    <View style={styles.review}>
      <View style={styles.reviewHead}>
        <View style={styles.reviewRing}>
          <Text style={styles.reviewPct}>{used}%</Text>
          <Text style={styles.reviewPctLabel}>USED</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.reviewTitle}>Spending Review</Text>
          <Text style={styles.reviewSub}>Budget utilisation this month</Text>
        </View>
      </View>

      <ProgressBar
        pct={used}
        color={used > 100 ? theme.danger : used > 80 ? theme.warning : theme.accent}
        height={7}
      />

      <View style={styles.reviewRows}>
        {[
          { icon: "cart-outline" as const, label: "Needs", value: needs },
          { icon: "heart-outline" as const, label: "Wants", value: wants },
          { icon: "wallet-outline" as const, label: "Savings", value: saved },
        ].map((r) => (
          <View key={r.label} style={styles.reviewRow}>
            <Ionicons name={r.icon} size={16} color={theme.muted} />
            <Text style={styles.reviewLabel}>{r.label}</Text>
            <Text style={styles.reviewValue}>{fmt(r.value)}</Text>
          </View>
        ))}
      </View>

      {savingsGoal > 0 && (
        <Text style={styles.reviewFoot}>Savings goal: {fmt(savingsGoal)}</Text>
      )}
    </View>
  );
}

// A chat message may carry a photo the user attached. The extra field is
// local to this screen — the Edge Function only ever reads role and text.
type ChatMessage = KapyMessage & { image?: string };

export default function Kapy() {
  const insets = useSafeAreaInsets();
  const { derived, transactions } = useFinance();
  const [scanning, setScanning] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "model",
      text: "Hey, I'm Kapy 🦫 your money buddy. Ask me anything, or tap a quick question below 👇",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // ── unchanged: summary sent to the Edge Function ─────────
  const buildSummary = () => {
    const now = new Date();
    const map = new Map<string, number>();
    transactions.forEach((t) => {
      if (
        t.type === "expense" &&
        t.date.getMonth() === now.getMonth() &&
        t.date.getFullYear() === now.getFullYear()
      ) {
        map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
      }
    });
    const top = [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(
        ([id, amt]) =>
          `${CATEGORIES.find((c) => c.id === id)?.label ?? id}: RM ${amt.toFixed(2)}`
      )
      .join(", ");
    return [
      `Monthly income: RM ${derived.income}`,
      `Savings goal: RM ${derived.savingsGoal}`,
      `Spendable budget this month: RM ${derived.budget}`,
      `Spent so far: RM ${derived.spent.toFixed(2)}`,
      `Remaining: RM ${derived.remaining.toFixed(2)}`,
      top ? `Top spending: ${top}` : "No spending logged yet this month.",
    ].join("\n");
  };

  // ── unchanged: send logic ────────────────────────────────
  const sendMessage = async (text: string) => {
    const t = text.trim();
    if (!t || loading) return;
    const next: ChatMessage[] = [...messages, { role: "user", text: t }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const reply = await askKapy(next, buildSummary());
      setMessages((m) => [...m, { role: "model", text: reply }]);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { role: "model", text: "⚠️ " + (e?.message ?? String(e)) },
      ]);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Attach a receipt photo. Runs it through the same scan-receipt Edge
   * Function the Add screen uses, then tells Kapy what was found so it can
   * record it with its add_transaction tool.
   */
  const attachReceipt = async (source: "camera" | "library") => {
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

    // Show the photo straight away so the chat feels responsive.
    const withPhoto: ChatMessage[] = [
      ...messages,
      { role: "user", text: "", image: asset.uri },
    ];
    setMessages(withPhoto);
    setScanning(true);

    try {
      const r = await scanReceipt(asset.base64, asset.mimeType ?? "image/jpeg");

      const label = cat(r.category)?.label ?? r.category;
      // Pass the receipt's own date along in YYYY-MM-DD so Kapy files it on
      // the day it happened. Without this every scan lands as today, which is
      // wrong the moment you photograph a receipt from earlier in the week.
      // Plain YYYY-MM-DD, which is exactly what add_transaction's date
      // parameter expects — no prose for the model to reinterpret.
      const isoDate = r.date
        ? `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, "0")}-${String(
            r.date.getDate()
          ).padStart(2, "0")}`
        : "";
      // The merchant name is text read off a photograph, so it is kept inside
      // a labelled block rather than woven into the sentence asking Kapy to
      // record something. Interpolated mid-sentence, a crafted receipt reads
      // as part of the request; fenced off, it reads as a value. The server
      // strips the delimiters from it, so the block can't be closed early.
      const text = r.amount
        ? `I just scanned a receipt. Please record it for me.\n` +
          `<<RECEIPT>>\n` +
          `amount: RM ${r.amount.toFixed(2)}\n` +
          `category: ${label}\n` +
          (isoDate ? `date: ${isoDate}\n` : "") +
          (r.merchant ? `merchant: ${r.merchant}\n` : "") +
          `<</RECEIPT>>`
        : "I scanned a receipt but the total wasn't readable. What should I do?";

      const next: ChatMessage[] = [...withPhoto, { role: "user", text }];
      setMessages(next);
      setScanning(false);
      setLoading(true);

      // Photo-only bubbles carry no text, so drop them before sending.
      const reply = await askKapy(
        next.filter((m) => m.text.trim().length > 0),
        buildSummary()
      );
      setMessages((m) => [...m, { role: "model", text: reply }]);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { role: "model", text: "⚠️ " + (e?.message ?? String(e)) },
      ]);
    } finally {
      setScanning(false);
      setLoading(false);
    }
  };

  const onAttachPress = () => {
    Alert.alert("Attach a receipt", "Choose a source", [
      { text: "Take photo", onPress: () => attachReceipt("camera") },
      { text: "Choose from gallery", onPress: () => attachReceipt("library") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const busy = loading || scanning;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + theme.space.sm }]}>
        <Image source={capyAvatar} style={styles.headerAvatar} />
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Financial Assistant</Text>
          <View style={styles.statusRow}>
            <View style={styles.online} />
            <Text style={styles.headerSub}>Kapy · sees your real spending</Text>
          </View>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.messages}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <SpendingReview />

        {messages.map((m, i) => (
          <View
            key={i}
            style={[styles.row, m.role === "user" ? styles.rowRight : styles.rowLeft]}
          >
            {m.role === "model" && <Image source={capyAvatar} style={styles.avatar} />}
            <View
              style={[
                styles.bubble,
                m.role === "user" ? styles.userBubble : styles.kapyBubble,
                !!m.image && styles.photoBubble,
              ]}
            >
              {!!m.image && (
                <Image
                  source={{ uri: m.image }}
                  style={styles.photo}
                  resizeMode="cover"
                  accessibilityLabel="Attached receipt"
                />
              )}
              {!!m.text.trim() && (
              <RichText
                text={m.text}
                style={
                  m.role === "user"
                    ? { ...styles.bubbleText, ...styles.userText }
                    : styles.bubbleText
                }
                bulletColor={m.role === "user" ? theme.onDarkMuted : theme.primary}
              />
              )}
            </View>
          </View>
        ))}

        {loading && (
          <View style={[styles.row, styles.rowLeft]}>
            <Image source={capyAvatar} style={styles.avatar} />
            <View style={[styles.bubble, styles.kapyBubble, styles.typing]}>
              <ActivityIndicator size="small" color={theme.accent} />
              <Text style={styles.typingText}>Kapy is thinking…</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Quick chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chips}
        keyboardShouldPersistTaps="handled"
      >
        {QUICK_REPLIES.map((q) => (
          <Pressable
            key={q}
            style={({ pressed }) => [styles.chip, pressed && { opacity: 0.6 }]}
            onPress={() => sendMessage(q)}
            disabled={loading}
          >
            <Text style={styles.chipText}>{q}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.inputBar}>
        <Pressable
          style={({ pressed }) => [styles.attachBtn, (busy || pressed) && { opacity: 0.5 }]}
          onPress={onAttachPress}
          disabled={busy}
          accessibilityLabel="Attach a receipt photo"
        >
          {scanning ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : (
            <Ionicons name="attach" size={22} color={theme.primary} />
          )}
        </Pressable>

        <TextInput
          style={styles.input}
          placeholder="Type your message..."
          placeholderTextColor={theme.muted}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => sendMessage(input)}
          returnKeyType="send"
          multiline
        />

        <Pressable
          style={[styles.sendBtn, (busy || !input.trim()) && { opacity: 0.4 }]}
          onPress={() => sendMessage(input)}
          disabled={busy || !input.trim()}
          accessibilityLabel="Send message"
        >
          <Ionicons name="arrow-up" size={20} color={theme.onDark} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.md,
    paddingHorizontal: theme.screenPadding,
    paddingBottom: theme.space.md,
    backgroundColor: theme.card,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.accentSoft },
  headerTitle: { fontSize: theme.size.section, fontWeight: "800", color: theme.text },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 1 },
  online: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.income },
  headerSub: { fontSize: theme.size.caption, color: theme.muted },

  messages: {
    padding: theme.space.base,
    paddingBottom: theme.space.lg,
    gap: theme.space.sm,
  },

  review: {
    backgroundColor: theme.card,
    borderRadius: theme.radius.lg,
    padding: theme.space.base,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: theme.space.sm,
    ...theme.shadowSm,
  },
  reviewHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.md,
    marginBottom: theme.space.md,
  },
  reviewRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewPct: { fontSize: theme.size.label, fontWeight: "800", color: theme.text },
  reviewPctLabel: { fontSize: 8, fontWeight: "800", color: theme.muted, letterSpacing: 0.5 },
  reviewTitle: { fontSize: theme.size.body, fontWeight: "800", color: theme.text },
  reviewSub: { fontSize: theme.size.caption, color: theme.muted, marginTop: 1 },
  reviewRows: { marginTop: theme.space.md, gap: theme.space.sm },
  reviewRow: { flexDirection: "row", alignItems: "center", gap: theme.space.sm },
  reviewLabel: { flex: 1, fontSize: theme.size.label, color: theme.text },
  reviewValue: { fontSize: theme.size.label, fontWeight: "800", color: theme.text },
  reviewFoot: {
    fontSize: theme.size.caption,
    color: theme.muted,
    marginTop: theme.space.md,
  },

  row: { flexDirection: "row", alignItems: "flex-end", gap: theme.space.sm },
  rowLeft: { justifyContent: "flex-start" },
  rowRight: { justifyContent: "flex-end" },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.accentSoft },
  bubble: { maxWidth: "78%", paddingHorizontal: 14, paddingVertical: 11, borderRadius: 18 },
  kapyBubble: {
    backgroundColor: theme.accentSoft,
    borderBottomLeftRadius: 6,
  },
  userBubble: { backgroundColor: theme.primaryDark, borderBottomRightRadius: 6 },
  bubbleText: { fontSize: theme.size.body, color: theme.text, lineHeight: 21 },
  photoBubble: { padding: 4 },
  photo: { width: 190, height: 240, borderRadius: 14 },
  userText: { color: "#fff" },
  typing: { flexDirection: "row", alignItems: "center", gap: theme.space.sm },
  typingText: { fontSize: theme.size.label, color: theme.muted },

  chipsScroll: { maxHeight: 50, flexGrow: 0 },
  chips: { paddingHorizontal: theme.space.md, paddingBottom: theme.space.sm, gap: theme.space.sm },
  chip: {
    backgroundColor: theme.card,
    borderRadius: 18,
    paddingHorizontal: theme.space.base,
    paddingVertical: theme.space.sm + 1,
    borderWidth: 1,
    borderColor: theme.border,
  },
  chipText: { fontSize: theme.size.label, fontWeight: "700", color: theme.primaryDark },

  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: theme.space.md,
    padding: theme.space.md,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.card,
  },
  input: {
    flex: 1,
    maxHeight: 110,
    backgroundColor: theme.bg,
    borderRadius: 22,
    paddingHorizontal: theme.space.base,
    paddingTop: theme.space.md,
    paddingBottom: theme.space.md,
    fontSize: theme.size.body,
    color: theme.text,
    borderWidth: 1,
    borderColor: theme.border,
  },
  attachBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.bg,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
