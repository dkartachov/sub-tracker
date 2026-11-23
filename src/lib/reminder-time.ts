/** The time of day renewal reminders arrive, picked in Settings. 9:00 until changed. */
import { storedSetting } from './stored-setting';

export type TimeOfDay = { hour: number; minute: number };

export const DEFAULT_REMINDER_TIME: TimeOfDay = { hour: 9, minute: 0 };

/** "09:00" from a time, the way it's stored. */
export function timeKey({ hour, minute }: TimeOfDay) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** A time from "HH:MM", or null if it isn't one. */
export function parseTimeKey(key: string): TimeOfDay | null {
  const match = /^(\d{2}):(\d{2})$/.exec(key);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? { hour, minute } : null;
}

/** "9:00 AM" or "09:00", in the device's format. */
export function formatTimeOfDay({ hour, minute }: TimeOfDay) {
  return new Date(2026, 0, 1, hour, minute).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const setting = storedSetting('reminderTime', DEFAULT_REMINDER_TIME, parseTimeKey, timeKey);

export const getReminderTime = setting.get;
export const setReminderTime = setting.set;
export const useReminderTime = setting.use;
