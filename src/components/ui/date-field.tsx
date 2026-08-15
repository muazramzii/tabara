import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../../constants/theme";

// A calendar built from plain Views. No native module, so it works in Expo Go
// with no rebuild — and nothing extra to install.
//
// Future dates are blocked: a transaction can't have happened tomorrow.

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();

function monthTitle(d: Date) {
  return d.toLocaleDateString("en-MY", { month: "long", year: "numeric" });
}

/** Label shown on the field itself: Today / Yesterday / 7 Jan 2026. */
function friendlyLabel(d: Date) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}

function Calendar({
  value,
  onPick,
}: {
  value: Date;
  onPick: (d: Date) => void;
}) {
  const [cursor, setCursor] = useState(new Date(value.getFullYear(), value.getMonth(), 1));
  const today = startOfDay(new Date());

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Leading blanks so the 1st lands under the right weekday.
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  // Don't let the user page into a month that hasn't started yet.
  const nextDisabled =
    year > today.getFullYear() ||
    (year === today.getFullYear() && month >= today.getMonth());

  return (
    <View>
      <View style={styles.calHeader}>
        <Pressable
          onPress={() => setCursor(new Date(year, month - 1, 1))}
          hitSlop={10}
          style={styles.navBtn}
          accessibilityLabel="Previous month"
        >
          <Ionicons name="chevron-back" size={20} color={theme.text} />
        </Pressable>

        <Text style={styles.calTitle}>{monthTitle(cursor)}</Text>

        <Pressable
          onPress={() => !nextDisabled && setCursor(new Date(year, month + 1, 1))}
          hitSlop={10}
          disabled={nextDisabled}
          style={[styles.navBtn, nextDisabled && { opacity: 0.3 }]}
          accessibilityLabel="Next month"
        >
          <Ionicons name="chevron-forward" size={20} color={theme.text} />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} style={styles.weekday}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day, i) => {
          if (day === null) return <View key={`b${i}`} style={styles.cell} />;

          const date = new Date(year, month, day);
          const future = startOfDay(date) > today;
          const selected = sameDay(date, value);
          const isToday = sameDay(date, today);

          return (
            <Pressable
              key={day}
              style={styles.cell}
              onPress={() => !future && onPick(date)}
              disabled={future}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: future }}
            >
              <View
                style={[
                  styles.dayCircle,
                  selected && styles.daySelected,
                  !selected && isToday && styles.dayToday,
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    future && { color: theme.border },
                    selected && { color: theme.onDark, fontWeight: "800" },
                  ]}
                >
                  {day}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function DateField({
  value,
  onChange,
  label = "DATE",
}: {
  value: Date;
  onChange: (d: Date) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  const pick = (d: Date) => {
    onChange(d);
    setOpen(false);
  };

  const quick = (daysAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    pick(d);
  };

  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={({ pressed }) => [styles.field, pressed && { opacity: 0.7 }]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Date: ${friendlyLabel(value)}`}
      >
        <Ionicons name="calendar-outline" size={18} color={theme.muted} />
        <Text style={styles.fieldText}>{friendlyLabel(value)}</Text>
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

            <View style={styles.quickRow}>
              <Pressable style={styles.quickChip} onPress={() => quick(0)}>
                <Text style={styles.quickText}>Today</Text>
              </Pressable>
              <Pressable style={styles.quickChip} onPress={() => quick(1)}>
                <Text style={styles.quickText}>Yesterday</Text>
              </Pressable>
            </View>

            <Calendar value={value} onPick={pick} />

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
    letterSpacing: 0.6,
    marginTop: theme.space.xs,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.md,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.md,
    padding: theme.space.base,
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

  quickRow: { flexDirection: "row", gap: theme.space.sm, marginBottom: theme.space.base },
  quickChip: {
    flex: 1,
    backgroundColor: theme.accentSoft,
    borderRadius: theme.radius.md,
    paddingVertical: theme.space.md,
    alignItems: "center",
  },
  quickText: { fontSize: theme.size.label, fontWeight: "800", color: theme.primaryDark },

  calHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.space.md,
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.bg,
  },
  calTitle: { fontSize: theme.size.body, fontWeight: "800", color: theme.text },

  weekRow: { flexDirection: "row", marginBottom: theme.space.xs },
  weekday: {
    width: `${100 / 7}%`,
    textAlign: "center",
    fontSize: theme.size.caption,
    fontWeight: "700",
    color: theme.muted,
  },

  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  daySelected: { backgroundColor: theme.primaryDark },
  dayToday: { borderWidth: 1.5, borderColor: theme.accent },
  dayText: { fontSize: theme.size.label, fontWeight: "600", color: theme.text },

  close: {
    marginTop: theme.space.base,
    paddingVertical: theme.space.base,
    alignItems: "center",
    backgroundColor: theme.bg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  closeText: { fontSize: theme.size.body, fontWeight: "800", color: theme.text },
});
