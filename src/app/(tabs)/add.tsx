import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../constants/theme";

export default function Add() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Log spending</Text>
      <Text style={styles.sub}>How do you want to add it?</Text>

      <Pressable style={styles.option}>
        <Ionicons name="create-outline" size={26} color={theme.primary} />
        <View style={styles.optionText}>
          <Text style={styles.optionTitle}>Type it manually</Text>
          <Text style={styles.optionSub}>Quick entry form</Text>
        </View>
      </Pressable>

      <Pressable style={styles.option}>
        <Ionicons name="camera-outline" size={26} color={theme.primary} />
        <View style={styles.optionText}>
          <Text style={styles.optionTitle}>Snap a receipt</Text>
          <Text style={styles.optionSub}>AI reads merchant + amount</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg, padding: 24, gap: 14 },
  title: { fontSize: 22, fontWeight: "700", color: theme.text, marginTop: 12 },
  sub: { fontSize: 15, color: theme.muted, marginBottom: 8 },
  option: {
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  optionText: { flex: 1 },
  optionTitle: { fontSize: 16, fontWeight: "600", color: theme.text },
  optionSub: { fontSize: 13, color: theme.muted, marginTop: 2 },
});
