/**
 * Calendar days are stored as local `YYYY-MM-DD` keys so billing dates follow the user's
 * wall-clock day, not UTC.
 */

export type DateKey = string;

export function toDateKey(date: Date): DateKey {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(): DateKey {
  return toDateKey(new Date());
}

export function addDays(key: DateKey, days: number): DateKey {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

/**
 * `months` after `key`, on the same day of the month, or the month's last day when it's shorter:
 * a month after Jan 31 is Feb 28 (or 29).
 */
export function addMonthsClamped(key: DateKey, months: number): DateKey {
  const [y, m, d] = key.split('-').map(Number);
  const first = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return toDateKey(new Date(first.getFullYear(), first.getMonth(), Math.min(d, lastDay)));
}

/** Whole calendar days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: DateKey, to: DateKey): number {
  const ms = fromDateKey(to).getTime() - fromDateKey(from).getTime();
  return Math.round(ms / 86_400_000);
}

export function formatDateKey(key: DateKey): string {
  return fromDateKey(key).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** "Oct 12", or "Oct 12, 2025" outside the current year. */
export function formatShortDate(key: DateKey, today: DateKey = todayKey()): string {
  return fromDateKey(key).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(key.slice(0, 4) !== today.slice(0, 4) && { year: 'numeric' }),
  });
}

/** A future day said the way you would: "today", "tomorrow", "in 5 days", else the date. */
export function formatUpcomingDay(key: DateKey, today: DateKey = todayKey()): string {
  const days = daysBetween(today, key);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days > 1 && days < 14) return `in ${days} days`;
  return `on ${formatShortDate(key, today)}`;
}
