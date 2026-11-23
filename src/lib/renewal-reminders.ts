/**
 * Renewal reminders are local notifications, a few days before a subscription charges (or a trial
 * converts). The `subscriptions` table is the source of truth: scheduled notifications are matched
 * to it whenever it changes and whenever the app opens, so they can't get out of step.
 *
 * Each subscription gets its next few reminders scheduled, so they keep coming for a while even if
 * the app isn't opened.
 */
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getSubscriptions, type Subscription } from '@/db/subscriptions';

import { firstPaymentDate, paymentsBetween, priceOn } from './billing';
import { formatMoney, getCurrency } from './currency';
import { addDays, fromDateKey, toDateKey, type DateKey } from './dates';
import { getReminderTime, timeKey, type TimeOfDay } from './reminder-time';

const CHANNEL_ID = 'renewals';

/** How many upcoming reminders each subscription keeps scheduled. */
const REMINDERS_PER_SUBSCRIPTION = 3;

/** How far ahead to look for them, enough for a few charges of a yearly plan. */
const LOOKAHEAD_DAYS = 3 * 366 + 60;

export type PlannedReminder = {
  identifier: string;
  date: Date;
  title: string;
  body: string;
  subscriptionId: number;
};

function dayPhrase(daysBefore: number) {
  if (daysBefore === 0) return 'today';
  if (daysBefore === 1) return 'tomorrow';
  return `in ${daysBefore} days`;
}

/**
 * The reminders that should be scheduled after `now`, at `time` of day, for every subscription with
 * them on. One cancelled for a later day still gets them for the charges it has left.
 */
export function planReminders(
  subs: Subscription[],
  now: Date,
  currency = getCurrency(),
  time: TimeOfDay = getReminderTime()
): PlannedReminder[] {
  const today = toDateKey(now);
  const planned: PlannedReminder[] = [];

  for (const sub of subs) {
    const daysBefore = sub.reminderDaysBefore;
    if (daysBefore === null) continue;

    let count = 0;
    // Stops at the cancellation day, so nothing is planned once it's cancelled.
    for (const paymentDate of paymentsBetween(sub, today, addDays(today, LOOKAHEAD_DAYS))) {
      const date = fromDateKey(addDays(paymentDate, -daysBefore));
      date.setHours(time.hour, time.minute);
      if (date.getTime() <= now.getTime()) continue;

      const amount = formatMoney(priceOn(sub.prices, paymentDate), currency);
      const isTrialEnd = sub.isTrial && paymentDate === firstPaymentDate(sub);
      planned.push({
        // Holds everything the notification says, so any edit replaces it with a fresh one.
        identifier: ['renewal', sub.id, paymentDate, daysBefore, timeKey(time), amount, sub.name].join('|'),
        date,
        subscriptionId: sub.id,
        title: isTrialEnd ? `${sub.name} trial ends ${dayPhrase(daysBefore)}` : `${sub.name} renews ${dayPhrase(daysBefore)}`,
        body: isTrialEnd
          ? `You'll be charged ${amount} unless you cancel.`
          : `${amount} will be charged ${daysBefore === 0 ? 'today' : `on ${formatPaymentDay(paymentDate)}`}.`,
      });
      if (++count >= REMINDERS_PER_SUBSCRIPTION) break;
    }
  }
  return planned;
}

function formatPaymentDay(key: DateKey) {
  return fromDateKey(key).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

async function ensureChannel() {
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Renewal reminders',
    importance: AndroidImportance.HIGH,
  });
}

/** Shows the system prompt if it still can. */
export async function requestNotificationPermission() {
  // Android 13 and later don't show the prompt until a channel exists.
  await ensureChannel();
  return Notifications.requestPermissionsAsync();
}

/** Only touches what differs, never a notification that's still right. */
async function matchScheduledToSubscriptions(db: SQLiteDatabase) {
  await ensureChannel();

  const wanted = new Map(planReminders(await getSubscriptions(db), new Date()).map((r) => [r.identifier, r]));
  const scheduled = new Set(
    (await Notifications.getAllScheduledNotificationsAsync()).map((request) => request.identifier)
  );

  for (const identifier of scheduled) {
    if (!wanted.has(identifier)) await Notifications.cancelScheduledNotificationAsync(identifier);
  }
  for (const [identifier, reminder] of wanted) {
    if (scheduled.has(identifier)) continue;
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: reminder.title,
        body: reminder.body,
        sound: true,
        data: { subscriptionId: reminder.subscriptionId },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, channelId: CHANNEL_ID, date: reminder.date },
    });
  }
}

let queue: Promise<void> = Promise.resolve();

/** Makes the scheduled notifications match the table, one run at a time so runs can't interleave. */
export function syncRenewalReminders(db: SQLiteDatabase): Promise<void> {
  queue = queue.then(() => matchScheduledToSubscriptions(db)).catch(console.warn);
  return queue;
}
