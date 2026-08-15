import { Ionicons } from "@expo/vector-icons";
import { Image, StyleSheet, Text, View } from "react-native";
import { theme } from "../../constants/theme";
import type { Achievement, DayActivity, Streak } from "../../lib/insights";
import { PopIn } from "./motion";

// Kapy reacts to the streak instead of sitting there as decoration: cheering
// while it runs, concerned when today is still empty, relaxed before you've
// started. The mascot noticing is what makes missing a day feel like something.
const CAPY = {
  party: require("../../assets/capy-party.png"),
  careful: require("../../assets/capy-careful.png"),
  chill: require("../../assets/capy-chill.png"),
};

/** One day cell in the week strip. */
function DayDot({ day, tone }: { day: DayActivity; tone: string }) {
  // Four states, each visually distinct: done, today-still-open, missed,
  // and not-yet. A missed day and an upcoming day must not look the same —
  // one is a gap in the record, the other carries no judgement at all.
  const done = day.logged;
  const open = day.isToday && !day.logged;

  return (
    <View style={styles.dayCell}>
      <View
        style={[
          styles.dot,
          done && { backgroundColor: theme.accent, borderColor: theme.accent },
          open && { borderColor: tone, borderWidth: 2, borderStyle: "dashed" },
          !done && !open && day.isFuture && styles.dotFuture,
        ]}
      >
        {done && <Ionicons name="checkmark" size={15} color={theme.onDark} />}
      </View>

      <Text
        style={[
          styles.dayLabel,
          // Bolder face rather than fontWeight — see the note on dayLabel.
          day.isToday && { fontFamily: theme.font.displayBold, color: theme.text },
          day.isFuture && { color: theme.border },
        ]}
      >
        {day.label}
      </Text>
    </View>
  );
}

/**
 * Logging streak. Three states, because the nudge is the whole point:
 * none (invite), running (reward), at risk (urgency).
 *
 * The week strip below turns the streak from a bare number into a pattern you
 * can read at a glance — which days you actually logged, and whether today is
 * still open. `week` is optional so either caller can render the compact card.
 */
export function StreakCard({
  streak,
  week,
}: {
  streak: Streak;
  week?: DayActivity[];
}) {
  const { current, best, atRisk, loggedToday } = streak;

  // Caramel rather than peach for a running streak: peach is too pale to
  // carry a 28px number on a white card.
  const tone = atRisk ? theme.warning : current > 0 ? theme.primary : theme.muted;

  const subtitle =
    current === 0
      ? "Log anything today to get going"
      : atRisk
        ? "Log something today to keep it alive"
        : loggedToday
          ? `Best run: ${best} day${best === 1 ? "" : "s"}`
          : `Best run: ${best} days`;

  return (
    <View style={[styles.streak, atRisk && styles.streakRisk]}>
      <View style={styles.streakTop}>
        {/* Flame and Kapy read as one unit — the capybara overlaps the disc
            slightly so they group visually instead of looking like two
            unrelated icons that happen to sit near each other. */}
        <View style={styles.badgeGroup}>
          {/* Solid fill with a white glyph — a tinted circle on a tinted card
              disappeared into it. */}
          <View style={[styles.flame, { backgroundColor: tone }]}>
            <Ionicons
              name={current > 0 ? "flame" : "flame-outline"}
              size={23}
              color={theme.onDark}
            />
          </View>

          <Image
            source={
              atRisk ? CAPY.careful : current > 0 ? CAPY.party : CAPY.chill
            }
            style={styles.capy}
            resizeMode="contain"
            // Decorative — the streak is already stated in text above.
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </View>

        <View style={styles.textCol}>
          <Text style={styles.eyebrow}>STREAK</Text>
          <View style={styles.countRow}>
            <Text style={[styles.streakNumber, { color: tone }]}>{current}</Text>
            <Text style={styles.unit}>
              {current === 1 ? "DAY" : "DAYS"}
            </Text>
          </View>
        </View>
      </View>

      {week && (
        <>
          <View style={styles.divider} />
          <View style={styles.week}>
            {week.map((d) => (
              <DayDot key={d.label} day={d} tone={tone} />
            ))}
          </View>
        </>
      )}

      <Text style={[styles.streakSub, atRisk && styles.streakSubUrgent]}>
        {subtitle}
      </Text>
    </View>
  );
}

/** One badge tile. Locked ones stay visible so there's something to aim at. */
function Badge({ item, delay }: { item: Achievement; delay: number }) {
  return (
    <PopIn delay={delay} style={styles.badgeWrap}>
      <View style={[styles.badge, item.unlocked && styles.badgeUnlocked]}>
        <View
          style={[
            styles.badgeIcon,
            { backgroundColor: item.unlocked ? theme.gold + "26" : theme.cardAlt },
          ]}
        >
          <Ionicons
            name={item.icon}
            size={20}
            color={item.unlocked ? theme.gold : theme.muted}
          />
        </View>

        <Text
          // Locked titles were theme.muted at 3.2:1 — under the readable
          // minimum. Locked should read as "not yet", not "barely there".
          style={[styles.badgeTitle, !item.unlocked && { color: theme.primaryDark }]}
          numberOfLines={1}
        >
          {item.title}
        </Text>

        {item.unlocked ? (
          <Text style={styles.badgeDone}>Unlocked</Text>
        ) : (
          <>
            <View style={styles.badgeTrack}>
              <View style={[styles.badgeFill, { width: `${item.progress}%` }]} />
            </View>
            {/* Targets of 1 are yes/no, not a count — "0 / 1" reads as broken. */}
            {item.target > 1 && (
              <Text style={styles.badgeProgress}>
                {item.current} / {item.target}
              </Text>
            )}
          </>
        )}
      </View>
    </PopIn>
  );
}

export function AchievementGrid({ items }: { items: Achievement[] }) {
  const unlocked = items.filter((i) => i.unlocked).length;

  return (
    <View>
      <Text style={styles.count}>
        {unlocked} of {items.length} unlocked
      </Text>
      <View style={styles.grid}>
        {items.map((item, i) => (
          <Badge key={item.id} item={item} delay={i * 45} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  streak: {
    // Card stays white in every state. Tinting it was what killed the
    // contrast — the icon, number and text all sat on their own colour.
    backgroundColor: theme.card,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.space.base,
    paddingHorizontal: theme.space.base,
    borderWidth: 1,
    borderColor: theme.border,
    ...theme.shadowSm,
  },
  // At risk is signalled by the border alone, so everything inside keeps its
  // contrast against white.
  streakRisk: { borderColor: theme.warning, borderWidth: 1.5 },
  streakTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  badgeGroup: { flexDirection: "row", alignItems: "center" },
  textCol: { flex: 1, marginLeft: theme.space.sm },
  flame: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  // Fredoka throughout the streak block — the same rounded face the
  // celebration burst uses, so the number that flies at you is the number
  // that lives on the card. Note there is no fontWeight alongside these:
  // Android picks the face by family name, and passing both can make it fall
  // back to a synthesised system font instead.
  eyebrow: {
    fontFamily: theme.font.displayBold,
    fontSize: 15,
    // Was theme.muted, which measures 3.2:1 on white — under the 4.5:1
    // minimum for text this size. Near-black takes it to 12:1.
    color: theme.text,
    letterSpacing: 2.2,
    lineHeight: 20,
  },
  countRow: { flexDirection: "row", alignItems: "baseline", gap: 7 },
  unit: {
    fontFamily: theme.font.display,
    fontSize: 16,
    // Mid-tone taupe at 6.5:1 — readable, but still clearly secondary to the
    // number. Leaving it pale grey next to a near-black label looked broken.
    color: theme.primaryDark,
    letterSpacing: 1.2,
    lineHeight: 20,
  },
  streakSub: {
    fontSize: theme.size.caption,
    color: theme.primaryDark,
    fontWeight: "600",
    marginTop: theme.space.sm,
    lineHeight: 17,
  },
  // The nudge is the point of this state — it shouldn't be the faintest text.
  streakSubUrgent: { color: theme.text, fontWeight: "600" },
  streakNumber: {
    fontFamily: theme.font.displayBold,
    fontSize: 42,
    letterSpacing: -0.5,
    // Explicit lineHeight: a display face at this size clips its own
    // descenders on Android when left to the default.
    lineHeight: 48,
  },

  capy: {
    width: 66,
    height: 66,
    // Negative left margin tucks Kapy against the flame disc so the pair
    // reads as one badge. The vertical pull drops it onto the same optical
    // baseline as the disc rather than the taller image box it lives in.
    marginLeft: -8,
    marginBottom: -8,
  },

  divider: {
    height: 1,
    backgroundColor: theme.border,
    marginVertical: theme.space.md,
  },
  week: { flexDirection: "row", justifyContent: "space-between" },
  dayCell: { alignItems: "center", gap: 6, flex: 1 },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: theme.border,
    backgroundColor: theme.card,
  },
  // Upcoming days recede — nothing has been missed yet.
  dotFuture: { borderColor: theme.border, opacity: 0.45 },
  dayLabel: {
    fontFamily: theme.font.display,
    fontSize: 12,
    color: theme.primaryDark,
    letterSpacing: 0.4,
    lineHeight: 16,
  },

  count: {
    fontSize: theme.size.caption,
    color: theme.muted,
    fontWeight: "700",
    marginBottom: theme.space.md,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: theme.space.sm },
  badgeWrap: { width: "31.5%" },
  badge: {
    backgroundColor: theme.card,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.border,
    // Sized for the taller of the two states — a locked badge carries a
    // progress bar and a "3 / 7" line that an unlocked one doesn't. Without
    // this floor, a row mixing locked and unlocked tiles comes out ragged.
    minHeight: 132,
  },
  badgeUnlocked: { borderColor: theme.gold + "80", backgroundColor: theme.gold + "0D" },
  badgeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.space.sm,
  },
  badgeTitle: {
    fontSize: theme.size.caption,
    fontWeight: "800",
    color: theme.text,
    textAlign: "center",
  },
  badgeDone: {
    fontSize: 9,
    fontWeight: "800",
    color: theme.gold,
    marginTop: 5,
    letterSpacing: 0.4,
  },
  badgeTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.border,
    width: "100%",
    marginTop: 8,
    overflow: "hidden",
  },
  // Caramel, not muted grey. Muted measured 2.43:1 against the track — below
  // the 3:1 minimum for a graphical element, which made a badge at 90% look
  // identical to one at 0%.
  badgeFill: { height: 5, borderRadius: 3, backgroundColor: theme.primary },
  badgeProgress: {
    fontSize: 10,
    fontWeight: "800",
    color: theme.primaryDark,
    marginTop: 4,
    letterSpacing: 0.2,
  },
});
