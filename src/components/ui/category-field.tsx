import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Category } from "../../constants/categories";
import { colorForCategory, theme } from "../../constants/theme";

// A picker rather than a grid of twelve tiles. Same field styling and same
// bottom sheet as DateField, so the two selectors on the Add screen behave
// identically instead of each inventing their own interaction.

const typeLabel = (t: Category["type"]) =>
  t === "savings" ? "Savings" : t === "income" ? "Income" : t === "needs" ? "Needs" : "Wants";

export function CategoryField({
  value,
  onChange,
  categories,
  label = "CATEGORY",
}: {
  value: string;
  onChange: (id: string) => void;
  categories: Category[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = categories.find((c) => c.id === value) ?? categories[0];
  const tint = colorForCategory(selected.id);

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <>
      <Text style={styles.label}>{label}</Text>

      <Pressable
        style={({ pressed }) => [styles.field, pressed && { opacity: 0.7 }]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Category: ${selected.label}`}
      >
        <View style={[styles.fieldIcon, { backgroundColor: tint + "22" }]}>
          <Ionicons name={selected.icon as any} size={17} color={tint} />
        </View>
        <Text style={styles.fieldText} numberOfLines={1}>
          {selected.label}
        </Text>
        <Ionicons name="chevron-down" size={16} color={theme.muted} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          {/* Swallow taps inside the sheet so it doesn't close. */}
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.grabber} />
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Choose a category</Text>
              <Text style={styles.sheetCount}>{categories.length} options</Text>
            </View>

            <ScrollView
              style={styles.list}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: theme.space.sm }}
            >
              {categories.map((c) => {
                const active = c.id === value;
                const colour = colorForCategory(c.id);
                return (
                  <Pressable
                    key={c.id}
                    style={({ pressed }) => [
                      styles.row,
                      active && styles.rowActive,
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={() => pick(c.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: colour + "22" }]}>
                      <Ionicons name={c.icon as any} size={18} color={colour} />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowLabel} numberOfLines={1}>
                        {c.label}
                      </Text>
                      <Text style={styles.rowType}>{typeLabel(c.type)}</Text>
                    </View>

                    {active ? (
                      <Ionicons name="checkmark-circle" size={22} color={colour} />
                    ) : (
                      <View style={styles.radio} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>

            <Pressable
              style={({ pressed }) => [styles.close, pressed && { opacity: 0.75 }]}
              onPress={() => setOpen(false)}
            >
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: theme.size.caption,
    fontWeight: "800",
    color: theme.muted,
    letterSpacing: 0.8,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.md,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
  },
  fieldIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldText: { flex: 1, fontSize: theme.size.body, fontWeight: "700", color: theme.text },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(61,53,43,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: theme.card,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    paddingTop: theme.space.base,
    paddingHorizontal: theme.space.lg,
    paddingBottom: theme.space.xl,
    maxHeight: "78%",
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.border,
    alignSelf: "center",
    marginBottom: theme.space.base,
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: theme.space.md,
  },
  sheetTitle: { fontSize: theme.size.section, fontWeight: "800", color: theme.text },
  sheetCount: { fontSize: theme.size.caption, color: theme.muted, fontWeight: "700" },
  list: { flexGrow: 0 },

  // Each option gets its own bordered surface. Bare rows on white read as a
  // list of labels; a bordered card reads as something you can tap.
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.md,
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radius.md,
    marginBottom: theme.space.sm,
    backgroundColor: theme.bg,
    borderWidth: 1,
    borderColor: theme.border,
  },
  rowActive: { backgroundColor: theme.card, borderWidth: 2 },

  // Empty circle on unselected rows, so the selectable slot is visible before
  // you pick rather than appearing only once something is chosen.
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: theme.border,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { fontSize: theme.size.body, fontWeight: "700", color: theme.text },
  rowType: { fontSize: theme.size.caption, color: theme.muted, marginTop: 1 },

  close: {
    marginTop: theme.space.md,
    paddingVertical: theme.space.base,
    alignItems: "center",
    backgroundColor: theme.bg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  closeText: { fontSize: theme.size.body, fontWeight: "800", color: theme.text },
});
