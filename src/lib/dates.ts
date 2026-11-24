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

/**
 * "Nov 16 – 23", "Nov 28 – Dec 5", with years as `formatShortDate` gives them, or a single day
 * when `from` and `to` are the same.
 */
export function formatShortDateRange(from: DateKey, to: DateKey, today: DateKey = todayKey()): string {
  if (from === to) return formatShortDate(from, today);
  const format = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    ...((from.slice(0, 4) !== today.slice(0, 4) || to.slice(0, 4) !== today.slice(0, 4)) && { year: 'numeric' }),
  });
  // Hermes has no formatRange, so within a month the last day is written with the first day's
  // number in front of its own, wherever the locale puts the day: "Nov 16 – 23", "16 – 23 Nov".
  if (from.slice(0, 7) === to.slice(0, 7) && typeof format.formatToParts === 'function') {
    const fromDay = String(fromDateKey(from).getDate());
    return format
      .formatToParts(fromDateKey(to))
      .map((part) => (part.type === 'day' ? `${fromDay} – ${part.value}` : part.value))
      .join('');
  }
  return `${format.format(fromDateKey(from))} – ${format.format(fromDateKey(to))}`;
}

/**
 * When a charge that can land any day from `from` to `to` is still to come, said the way you
 * would: "in 3–10 days", "by Nov 23" once it may land any day, else the dates. The same as
 * `formatUpcomingDay` when they're one day.
 */
export function formatUpcomingWindow(from: DateKey, to: DateKey, today: DateKey = todayKey()): string {
  if (from === to) return formatUpcomingDay(from, today);
  const [start, end] = [daysBetween(today, from), daysBetween(today, to)];
  if (start <= 0) return end === 0 ? 'today at the latest' : end === 1 ? 'by tomorrow' : `by ${formatShortDate(to, today)}`;
  if (end < 14) return `in ${start}–${end} days`;
  return formatShortDateRange(from, to, today);
}

/** Whether `today` is inside a range of more than one day, both ends included: a charge that may land any day now. */
export function isWithinRange(from: DateKey, to: DateKey, today: DateKey = todayKey()): boolean {
  return from !== to && from <= today && today <= to;
}

/**
 * "today" or "tomorrow" for a charge on a single day that near, else null. A range gets neither:
 * the "Due now" pill says when it may land.
 */
export function formatNearDay(from: DateKey, to: DateKey, today: DateKey = todayKey()): string | null {
  if (from !== to) return null;
  const days = daysBetween(today, from);
  return days === 0 ? 'today' : days === 1 ? 'tomorrow' : null;
}

/** A future day said the way you would: "today", "tomorrow", "in 5 days", else the date. */
export function formatUpcomingDay(key: DateKey, today: DateKey = todayKey()): string {
  const days = daysBetween(today, key);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days > 1 && days < 14) return `in ${days} days`;
  return `on ${formatShortDate(key, today)}`;
}
