import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../../constants/theme";
import { useFinance } from "../../lib/finance-context";
import { streak } from "../../lib/insights";

// Fires a short flame burst the moment a streak reaches a new high — the
// reward half of the habit loop. It lives at the root of the app rather than
// on Home, so it lands wherever you happen to be when the streak ticks up:
// after saving on the Add screen, or after Kapy records something for you.

const KEY = "tabara.streak.celebrated";
const HOLD = 1100; // ms the burst stays at full size before fading

/** One spark thrown outward from behind the flame. */
function Spark({
  angle,
  delay,
  progress,
  color,
  size,
}: {
  angle: number;
  delay: number;
  progress: Animated.Value;
  color: string;
  size: number;
}) {
  const distance = 96;
  const dx = Math.cos(angle) * distance;
  const dy = Math.sin(angle) * distance;

  return (
    <Animated.View
      style={{
        position: "absolute",
        opacity: progress.interpolate({
          inputRange: [0, 0.15, 0.6, 1],
          outputRange: [0, 1, 1, 0],
        }),
        transform: [
          {
            translateX: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0, dx],
            }),
          },
          {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0, dy],
            }),
          },
          {
            scale: progress.interpolate({
              inputRange: [0, 0.3, 1],
              outputRange: [0.2, 1, 0.4],
            }),
          },
        ],
      }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        }}
      />
    </Animated.View>
  );
}

export function StreakCelebration() {
  const { transactions } = useFinance();
  const current = streak(transactions).current;

  const [showing, setShowing] = useState(false);
  const [days, setDays] = useState(0);

  // Highest streak already celebrated. `null` means we haven't read storage
  // yet — important, because firing before that read would replay the burst
  // on every cold start.
  const celebrated = useRef<number | null>(null);

  const backdrop = useRef(new Animated.Value(0)).current;
  const flame = useRef(new Animated.Value(0)).current;
  const sparks = useRef(new Animated.Value(0)).current;
  const label = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        celebrated.current = v ? Number(v) || 0 : 0;
      })
      .catch(() => {
        celebrated.current = 0;
      });
  }, []);

  useEffect(() => {
    const seen = celebrated.current;
    if (seen === null) return; // storage not read yet
    if (current <= seen) {
      // Streak broke — allow the next milestone to celebrate again.
      if (current < seen) {
        celebrated.current = current;
        AsyncStorage.setItem(KEY, String(current)).catch(() => {});
      }
      return;
    }

    celebrated.current = current;
    AsyncStorage.setItem(KEY, String(current)).catch(() => {});

    setDays(current);
    setShowing(true);

    backdrop.setValue(0);
    flame.setValue(0);
    sparks.setValue(0);
    label.setValue(0);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(backdrop, {
          toValue: 1,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.spring(flame, {
          toValue: 1,
          friction: 5,
          tension: 90,
          useNativeDriver: true,
        }),
        Animated.timing(sparks, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(label, {
          toValue: 1,
          duration: 320,
          delay: 140,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(HOLD),
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 0, duration: 260, useNativeDriver: true }),
        Animated.timing(flame, { toValue: 0, duration: 260, useNativeDriver: true }),
        Animated.timing(label, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]),
    ]).start(({ finished }) => {
      if (finished) setShowing(false);
    });
  }, [current, backdrop, flame, sparks, label]);

  if (!showing) return null;

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(flame, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(label, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start(() => setShowing(false));
  };

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.overlay, { opacity: backdrop }]}
      pointerEvents="box-none"
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />

      <View style={styles.stage} pointerEvents="none">
        {/* Sparks sit behind the flame and fly outward */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Spark
            key={i}
            angle={(Math.PI * 2 * i) / 8 - Math.PI / 2}
            delay={0}
            progress={sparks}
            color={i % 2 === 0 ? theme.gold : theme.peach}
            size={i % 3 === 0 ? 12 : 8}
          />
        ))}

        {/* Two stacked flames give the layered look without needing a gradient */}
        <Animated.View
          style={{
            transform: [
              {
                scale: flame.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.3, 1],
                }),
              },
              {
                rotate: flame.interpolate({
                  inputRange: [0, 0.6, 1],
                  outputRange: ["-12deg", "6deg", "0deg"],
                }),
              },
            ],
          }}
        >
          <Ionicons name="flame" size={150} color={theme.peach} />
          <View style={styles.innerFlame}>
            <Ionicons name="flame" size={82} color={theme.gold} />
          </View>
        </Animated.View>
      </View>

      <Animated.View
        style={[
          styles.labelWrap,
          {
            opacity: label,
            transform: [
              {
                translateY: label.interpolate({
                  inputRange: [0, 1],
                  outputRange: [16, 0],
                }),
              },
            ],
          },
        ]}
        pointerEvents="none"
      >
        <Text style={styles.days}>{days}</Text>
        <Text style={styles.title}>DAY STREAK</Text>
        <Text style={styles.sub}>
          {days >= 30
            ? "A whole month. Kapy is genuinely impressed 🦫"
            : days >= 7
              ? "A full week of tracking. Keep it rolling!"
              : "Nice one — come back tomorrow to keep it alive."}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: "rgba(61,53,43,0.82)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  stage: { alignItems: "center", justifyContent: "center", height: 190 },
  innerFlame: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 14,
    alignItems: "center",
  },
  labelWrap: { alignItems: "center", paddingHorizontal: theme.space.xxl },
  days: {
    fontFamily: theme.font.displayBold,
    fontSize: 76,
    color: theme.onDark,
    lineHeight: 84,
    letterSpacing: 1,
  },
  title: {
    fontFamily: theme.font.displayBold,
    fontSize: 20,
    color: theme.gold,
    letterSpacing: 3,
    marginTop: -6,
  },
  sub: {
    fontSize: theme.size.body,
    color: theme.onDarkMuted,
    textAlign: "center",
    marginTop: theme.space.md,
    lineHeight: 22,
  },
});
