import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { theme } from "../../constants/theme";

// Bottom sheet for choosing the reminder time.
//
// Hand-rolled rather than using a native picker: the community
// datetimepicker is a native module, and this app already avoids it for the
// date field for the same reason. Two scroll columns are also easier to hit
// than a spinner, and behave identically on every device.

// Quarter hours only. Nobody needs to be reminded at 12:07, and offering
// sixty options per hour makes the column tedious to scroll.
const MINUTES = [0, 15, 30, 45];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

/** "9:00 pm" — matches how the reminder itself is described elsewhere. */
export function formatTime(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? "am" : "pm";
  return `${h12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function TimePicker({
  visible,
  hour,
  minute,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  hour: number;
  minute: number;
  onCancel: () => void;
  onConfirm: (hour: number, minute: number) => void;
}) {
  // Local draft so backing out leaves the saved time alone.
  const [h, setH] = useState(hour);
  const [m, setM] = useState(minute);

  // Re-seed each time the sheet opens, otherwise it reopens showing whatever
  // was last scrolled to rather than what is actually set.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setH(hour);
      setM(minute);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grabber} />
          <Text style={styles.title}>Remind me at</Text>
          <Text style={styles.preview}>{formatTime(h, m)}</Text>

          <View style={styles.columns}>
            <ScrollView
              style={styles.column}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.columnContent}
            >
              {HOURS.map((value) => (
                <Pressable
                  key={value}
                  style={[styles.option, value === h && styles.optionActive]}
                  onPress={() => setH(value)}
                >
                  <Text style={[styles.optionText, value === h && styles.optionTextActive]}>
                    {formatTime(value, 0).replace(":00", "")}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <ScrollView
              style={styles.column}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.columnContent}
            >
              {MINUTES.map((value) => (
                <Pressable
                  key={value}
                  style={[styles.option, value === m && styles.optionActive]}
                  onPress={() => setM(value)}
                >
                  <Text style={[styles.optionText, value === m && styles.optionTextActive]}>
                    :{String(value).padStart(2, "0")}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [styles.btn, styles.cancel, pressed && { opacity: 0.7 }]}
              onPress={onCancel}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.btn, styles.save, pressed && { opacity: 0.7 }]}
              onPress={() => onConfirm(h, m)}
            >
              <Text style={styles.saveText}>Save</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(61,53,43,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: theme.card,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    padding: theme.space.lg,
    paddingBottom: theme.space.xxl,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.border,
    alignSelf: "center",
    marginBottom: theme.space.base,
  },
  title: {
    fontFamily: theme.font.display,
    fontSize: 17,
    color: theme.text,
    textAlign: "center",
    lineHeight: 22,
  },
  preview: {
    fontFamily: theme.font.displayBold,
    fontSize: 34,
    color: theme.primary,
    textAlign: "center",
    lineHeight: 42,
    marginBottom: theme.space.base,
  },
  columns: { flexDirection: "row", gap: theme.space.md, height: 200 },
  column: {
    flex: 1,
    backgroundColor: theme.bg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  columnContent: { padding: theme.space.xs },
  option: {
    paddingVertical: theme.space.md,
    borderRadius: theme.radius.sm,
    alignItems: "center",
  },
  optionActive: { backgroundColor: theme.primaryDark },
  optionText: { fontSize: theme.size.body, fontWeight: "700", color: theme.text },
  optionTextActive: { color: "#fff" },
  actions: { flexDirection: "row", gap: theme.space.md, marginTop: theme.space.lg },
  btn: {
    flex: 1,
    borderRadius: theme.radius.md,
    paddingVertical: theme.space.md + 2,
    alignItems: "center",
  },
  cancel: { backgroundColor: theme.cardAlt },
  cancelText: { color: theme.primaryDark, fontWeight: "800", fontSize: theme.size.body },
  save: { backgroundColor: theme.primaryDark },
  saveText: { color: "#fff", fontWeight: "800", fontSize: theme.size.body },
});
