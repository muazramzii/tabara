import { useEffect, useRef, useState } from "react";
import { Animated, Easing, type TextStyle, type ViewStyle } from "react-native";

// Motion built on React Native's own Animated API. Reanimated is installed but
// needs a Babel plugin to work; Animated needs no config at all, so this can't
// break the build. Nothing here touches data — it's purely presentation.

/**
 * A number that counts up to its value instead of appearing.
 * A figure that animates reads as live data; a static one reads as a
 * spreadsheet cell. Counts from the previous value on updates, not from zero,
 * so adding a transaction nudges rather than restarting.
 */
export function CountUp({
  value,
  format,
  style,
  duration = 850,
  numberOfLines,
  adjustsFontSizeToFit,
  minimumFontScale,
}: {
  value: number;
  format: (n: number) => string;
  style?: TextStyle | TextStyle[];
  duration?: number;
  numberOfLines?: number;
  adjustsFontSizeToFit?: boolean;
  minimumFontScale?: number;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const from = useRef(0);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const start = from.current;
    const delta = value - start;

    if (delta === 0) {
      setShown(value);
      return;
    }

    progress.setValue(0);
    const id = progress.addListener(({ value: t }) => setShown(start + delta * t));

    Animated.timing(progress, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // we're reading the value, not driving a transform
    }).start(({ finished }) => {
      if (finished) {
        from.current = value;
        setShown(value);
      }
    });

    return () => {
      progress.removeListener(id);
      from.current = value;
    };
  }, [value, duration, progress]);

  return (
    <Animated.Text
      style={style}
      numberOfLines={numberOfLines}
      adjustsFontSizeToFit={adjustsFontSizeToFit}
      minimumFontScale={minimumFontScale}
    >
      {format(shown)}
    </Animated.Text>
  );
}

/**
 * Fades and lifts its children in. Give sibling cards increasing delays and
 * the screen assembles itself instead of snapping into place.
 */
export function FadeInView({
  children,
  delay = 0,
  distance = 14,
  duration = 380,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  distance?: number;
  duration?: number;
  style?: ViewStyle | ViewStyle[];
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [anim, delay, duration]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [distance, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Springs its children up to full size — for things that should feel like they land. */
export function PopIn({
  children,
  delay = 0,
  from = 0.8,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  from?: number;
  style?: ViewStyle | ViewStyle[];
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      delay,
      friction: 6,
      tension: 70,
      useNativeDriver: true,
    }).start();
  }, [anim, delay]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: anim,
          transform: [
            { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [from, 1] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Drives a 0→1 value once on mount. For animating non-transform props. */
export function useEntrance(duration = 700, delay = 0) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [anim, duration, delay]);
  return anim;
}
