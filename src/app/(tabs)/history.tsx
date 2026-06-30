import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../constants/theme";

export default function History() {
  return (
    <View style={styles.screen}>
      <Ionicons name="receipt-outline" size={48} color={theme.muted} />
      <Text style={styles.title}>Transaction history</Text>
      <Text style={styles.sub}>
        Your logged transactions will list here, searchable and filterable by
        category and date.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  title: { fontSize: 20, fontWeight: "600", color: theme.text },
  sub: { fontSize: 14, color: theme.muted, textAlign: "center", lineHeight: 20 },
});
