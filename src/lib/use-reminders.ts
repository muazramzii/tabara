import { useEffect } from "react";
import { AppState } from "react-native";
import type { Transaction } from "./db";
import { rescheduleReminders } from "./reminders";

/**
 * Keeps the queued reminders in step with reality.
 *
 * Re-queues on two events: the transaction list changing (so logging
 * something today moves tonight's nudge to tomorrow), and the app coming back
 * to the foreground (so a phone left closed for a week gets a fresh fortnight
 * queued the moment it is opened).
 *
 * rescheduleReminders is a no-op when reminders are switched off, so this can
 * run unconditionally.
 */
export function useReminders(transactions: Transaction[]) {
  useEffect(() => {
    rescheduleReminders(transactions).catch(() => {
      // A failed reschedule must never take the app down with it. The worst
      // case is a stale reminder, which is better than a crash on launch.
    });
  }, [transactions]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        rescheduleReminders(transactions).catch(() => {});
      }
    });
    return () => sub.remove();
  }, [transactions]);
}
