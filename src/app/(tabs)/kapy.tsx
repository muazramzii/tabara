import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { CATEGORIES } from "../../constants/categories";
import { theme } from "../../constants/theme";
import { askKapy, type KapyMessage } from "../../lib/ai";
import { useFinance } from "../../lib/finance-context";

const capyAvatar = require("../../assets/capy-chill.png");

const QUICK_REPLIES = [
  "How am I doing this month?",
  "Any saving tips?",
  "Where's my money going?",
  "Can I afford to eat out?",
];

export default function Kapy() {
  const { derived, transactions } = useFinance();
  const [messages, setMessages] = useState<KapyMessage[]>([
    {
      role: "model",
      text: "Hey, I'm Kapy 🦫 your money buddy. Ask me anything, or tap a quick question below 👇",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

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
      .map(([id, amt]) => `${CATEGORIES.find((c) => c.id === id)?.label ?? id}: RM ${amt.toFixed(2)}`)
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

  const sendMessage = async (text: string) => {
    const t = text.trim();
    if (!t || loading) return;
    const next: KapyMessage[] = [...messages, { role: "user", text: t }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const reply = await askKapy(next, buildSummary());
      setMessages((m) => [...m, { role: "model", text: reply }]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "model", text: "⚠️ " + (e?.message ?? String(e)) }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.messages}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((m, i) => (
          <View key={i} style={[styles.row, m.role === "user" ? styles.rowRight : styles.rowLeft]}>
            {m.role === "model" && <Image source={capyAvatar} style={styles.avatar} />}
            <View style={[styles.bubble, m.role === "user" ? styles.userBubble : styles.kapyBubble]}>
              <Text style={[styles.bubbleText, m.role === "user" && { color: "#fff" }]}>{m.text}</Text>
            </View>
          </View>
        ))}
        {loading && (
          <View style={[styles.row, styles.rowLeft]}>
            <Image source={capyAvatar} style={styles.avatar} />
            <View style={[styles.bubble, styles.kapyBubble]}>
              <ActivityIndicator color={theme.accent} />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Quick replies */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chips}
      >
        {QUICK_REPLIES.map((q) => (
          <Pressable key={q} style={styles.chip} onPress={() => sendMessage(q)} disabled={loading}>
            <Text style={styles.chipText}>{q}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="Ask Kapy…"
          placeholderTextColor={theme.muted}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => sendMessage(input)}
          returnKeyType="send"
        />
        <Pressable
          style={[styles.sendBtn, loading && { opacity: 0.5 }]}
          onPress={() => sendMessage(input)}
          disabled={loading}
        >
          <Ionicons name="arrow-up" size={20} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  messages: { padding: 16, gap: 4 },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginBottom: 10 },
  rowLeft: { justifyContent: "flex-start" },
  rowRight: { justifyContent: "flex-end" },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  bubble: { maxWidth: "78%", padding: 12, borderRadius: 18 },
  kapyBubble: { backgroundColor: theme.accentSoft, borderBottomLeftRadius: 5 },
  userBubble: { backgroundColor: theme.primaryDark, borderBottomRightRadius: 5 },
  bubbleText: { fontSize: 15, color: theme.text, lineHeight: 21 },
  chipsScroll: { maxHeight: 48, flexGrow: 0 },
  chips: { paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  chip: {
    backgroundColor: theme.card,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: theme.border,
  },
  chipText: { fontSize: 13, fontWeight: "600", color: theme.primaryDark },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.card,
  },
  input: {
    flex: 1,
    backgroundColor: theme.bg,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: theme.text,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});