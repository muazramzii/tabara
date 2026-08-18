import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { Transaction } from "./db";
import { streak } from "./insights";

// Daily nudge to log spending before the streak breaks.
//
// Local notifications, not push. There is no server involved, no device token
// to store, and nothing leaves the phone — which also means this keeps working
// with no signal, and costs nothing to run.
//
// The hard part is not scheduling one reminder, it is that the person who most
// needs reminding is the one who has stopped opening the app. A reminder
// scheduled only on app open would go quiet exactly when it should not. So a
// fortnight is queued ahead, and re-queued from scratch whenever the app is
// opened or a transaction changes.

// Without a handler, a notification that arrives while the app is open is
// dropped silently. Someone sitting on the Home screen at noon would get
// nothing at all, which looks like the feature is broken.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const ENABLED_KEY = "tabara.reminders.enabled";
const CHANNEL_ID = "streak-reminders";

/** Hour of day, 24h. Noon: after breakfast and lunch, before the day is lost. */
export const REMINDER_HOUR = 12;
export const REMINDER_MINUTE = 0;

/** How many days to queue ahead, for someone who stops opening the app. */
const DAYS_AHEAD = 14;

export async function remindersEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(ENABLED_KEY)) === "1";
}

async function setEnabledFlag(on: boolean) {
  await AsyncStorage.setItem(ENABLED_KEY, on ? "1" : "0");
}

/**
 * Ask for permission and turn reminders on.
 *
 * Returns false when permission was refused, so the caller can leave the
 * switch off rather than showing it on while nothing will ever arrive.
 */
export async function enableReminders(
  transactions: Transaction[]
): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;

  if (!granted && existing.canAskAgain) {
    const asked = await Notifications.requestPermissionsAsync();
    granted = asked.granted;
  }
  if (!granted) return false;

  if (Platform.OS === "android") {
    // Android needs a channel or notifications are silently dropped.
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Streak reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 200],
      lockscreenVisibility:
        Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  await setEnabledFlag(true);
  await rescheduleReminders(transactions);
  return true;
}

export async function disableReminders() {
  await setEnabledFlag(false);
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/** The message for a given day, given what we know about the streak today. */
function messageFor(dayOffset: number, current: number, loggedToday: boolean) {
  // Only today's message may mention the streak by number. Tomorrow's state
  // depends on what happens between now and then, and a notification that
  // says "your 5-day streak ends tonight" when it does not would be a lie
  // the app told on purpose.
  if (dayOffset === 0 && current > 0 && !loggedToday) {
    return {
      title: `Your ${current}-day streak ends tonight 🔥`,
      body: "Log anything before midnight to keep it going.",
    };
  }
  if (dayOffset === 0) {
    return {
      title: "Log today's spending 🦫",
      body: "Takes about ten seconds. Kapy is waiting.",
    };
  }
  if (dayOffset === 1) {
    return {
      title: "Don't lose your streak 🔥",
      body: "A quick log keeps it alive.",
    };
  }
  return {
    title: "How's the spending today? 🦫",
    body: "Log it before you forget where it went.",
  };
}

/**
 * Clear every queued reminder and queue the next fortnight.
 *
 * Rebuilt wholesale rather than patched: working out which of fourteen
 * pending notifications is now wrong is more error-prone than starting again,
 * and cancelling is cheap.
 */
export async function rescheduleReminders(transactions: Transaction[]) {
  if (!(await remindersEnabled())) return;

  await Notifications.cancelAllScheduledNotificationsAsync();

  const { current, loggedToday } = streak(transactions);
  const now = new Date();

  for (let offset = 0; offset < DAYS_AHEAD; offset++) {
    const when = new Date(now);
    when.setDate(now.getDate() + offset);
    when.setHours(REMINDER_HOUR, REMINDER_MINUTE, 0, 0);

    // Today's slot has already gone by, or today is already logged — either
    // way there is nothing useful to say at noon today.
    if (offset === 0 && (when <= now || loggedToday)) continue;

    const { title, body } = messageFor(offset, current, loggedToday);

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: when,
      },
    });
  }
}
