import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../constants/theme";

export default function Insights() {
  return (
    <View style={styles.screen}>
      <Ionicons name="bar-chart-outline" size={48} color={theme.muted} />
      <Text style={styles.title}>Insights</Text>
      <Text style={styles.sub}>
        Spending by category, monthly trends, and your needs vs wants split will
        be charted here.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  title: { fontSize: 20, fontWeight: "600", color: theme.text },
  sub: { fontSize: 14, color: theme.muted, textAlign: "center", lineHeight: 20 },
});
