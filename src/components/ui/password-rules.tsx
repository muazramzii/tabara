import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { theme } from "../../constants/theme";
import { RULES, strength } from "../../lib/password";

/**
 * Live checklist of the password rules.
 *
 * Shown while typing rather than as an error after submitting: a user who
 * learns the rules only by failing has to guess which one they broke. Each
 * row states its requirement in full, so nothing has to be inferred.
 */
export function PasswordRules({ value }: { value: string }) {
  const pct = strength(value);

  // Red until it's usable, amber close to it, green when every rule passes.
  const barColor =
    pct === 1 ? theme.income : pct >= 0.6 ? theme.warning : theme.danger;

  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        <View
          style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: barColor }]}
        />
      </View>

      {RULES.map((rule) => {
        const met = rule.test(value);
        return (
          <View key={rule.id} style={styles.row}>
            <Ionicons
              name={met ? "checkmark-circle" : "ellipse-outline"}
              size={15}
              color={met ? theme.income : theme.muted}
            />
            <Text style={[styles.label, met && styles.labelMet]}>{rule.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: theme.space.md, gap: 5 },
  track: {
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.border,
    overflow: "hidden",
    marginBottom: theme.space.sm,
  },
  fill: { height: 5, borderRadius: 3 },
  row: { flexDirection: "row", alignItems: "center", gap: theme.space.sm },
  label: { fontSize: theme.size.caption, color: theme.muted, lineHeight: 18 },
  // Met rules darken rather than vanish — a list that shrinks as you type
  // makes the remaining rules jump around under the cursor.
  labelMet: { color: theme.primaryDark, fontWeight: "600" },
});
