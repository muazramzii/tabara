import { View, Text, StyleSheet } from "react-native";
import { theme } from "../../constants/theme";

export default function Kapy() {
  return (
    <View style={styles.screen}>
      <Text style={styles.emoji}>🦫</Text>
      <Text style={styles.title}>Ask Kapy</Text>
      <Text style={styles.sub}>
        Your AI money buddy. Ask things like "Can I afford makan out this week?"
        and Kapy answers using your own spending data.
      </Text>
      <Text style={styles.note}>Chat goes through a Cloud Function — keys stay server-side.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  emoji: { fontSize: 56 },
  title: { fontSize: 20, fontWeight: "600", color: theme.text },
  sub: { fontSize: 14, color: theme.muted, textAlign: "center", lineHeight: 20 },
  note: { fontSize: 12, color: theme.muted, textAlign: "center", marginTop: 8, fontStyle: "italic" },
});
