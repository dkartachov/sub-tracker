/**
 * When subscriptions charge and how much. Everything here is pure, so the screens, the spending
 * overview and the renewal reminders all agree, and it can be tested without a database.
 *
 * A subscription's billing is a list of periods. Each charges on its start day and then every
 * `cycle` after it, until its end (a cancellation) or the next period's start (a plan change),
 * whichever comes first. A cancelled subscription that's resumed gets a new period, so the time in
 * between charges nothing. Each charge costs the price in effect on that day, from the price
 * history, which runs across periods. A free trial is a subscription whose first period starts on
 * the day the trial converts.
 */
import { addDays, addMonthsClamped, daysBetween, type DateKey } from './dates';

export const CYCLE_UNITS = ['day', 'week', 'month', 'year'] as const;
export type CycleUnit = (typeof CYCLE_UNITS)[number];

export type Cycle = { count: number; unit: CycleUnit };

export type PriceChange = {
  /** In minor units (cents). */
  amount: number;
  effectiveDate: DateKey;
};

export type BillingPeriod = {
  /** The period's first charge. */
  start: DateKey;
  cycle: Cycle;
  /** No charges of this period on or after this day. Null while it runs on. */
  end: DateKey | null;
};

export type Billing = {
  /**
   * Oldest first, never empty, each starting after the one before. Every period but the last has
   * an end, on or before the next one's start: on it for a plan change, before it for a break.
   */
  periods: BillingPeriod[];
  /** Oldest first, never empty. The first one covers every charge before the next. */
  prices: PriceChange[];
};

type Periods = Pick<Billing, 'periods'>;

/** The very first charge (for a trial, the day it converts). */
export function firstPaymentDate(billing: Periods): DateKey {
  return billing.periods[0].start;
}

/** The last period, which a cancellation, a resume or a plan change acts on. */
export function lastPeriod(billing: Periods): BillingPeriod {
  return billing.periods[billing.periods.length - 1];
}

/** The last period's end: when charges stop for good, unless it's resumed. */
export function finalEnd(billing: Periods): DateKey | null {
  return lastPeriod(billing).end;
}

/** The same billing with the last period running on, as if it had never been cancelled. */
export function withoutFinalEnd<T extends Periods>(billing: T): T {
  const periods = billing.periods.slice();
  periods[periods.length - 1] = { ...lastPeriod(billing), end: null };
  return { ...billing, periods };
}

/** The index of the period `date` falls in: the latest started by then, or the first before any has. */
function periodIndexOn(billing: Periods, date: DateKey): number {
  let index = 0;
  billing.periods.forEach((period, i) => {
    if (period.start <= date) index = i;
  });
  return index;
}

/** The period `date` falls in: the latest started by then, or the first before any has. */
export function periodOn(billing: Periods, date: DateKey): BillingPeriod {
  return billing.periods[periodIndexOn(billing, date)];
}

/** The billing cycle in effect on `date`. */
export function cycleOn(billing: Periods, date: DateKey): Cycle {
  return periodOn(billing, date).cycle;
}

/**
 * When charges stopped, if they had by `date` and haven't started again: the end of the period
 * `date` falls in, once reached. Null while running, and before the first charge unless that was
 * already called off (a trial cancelled early).
 */
export function stoppedSince(billing: Periods, date: DateKey): DateKey | null {
  const { end } = periodOn(billing, date);
  return end !== null && end <= date ? end : null;
}

/**
 * When a running subscription stops, if it's been cancelled for a later day: the end of the run of
 * periods `today` is in, following plan changes. Null if it runs on.
 */
export function endsAfter(billing: Periods, today: DateKey): DateKey | null {
  const { periods } = billing;
  let i = periodIndexOn(billing, today);
  while (periods[i].end !== null && periods[i + 1]?.start === periods[i].end) i++;
  const { end } = periods[i];
  return end !== null && end > today ? end : null;
}

/** The day after a period's last possible charge: its end or the next period's start, whichever is first. */
function periodStop(periods: BillingPeriod[], i: number): DateKey | null {
  const { end } = periods[i];
  const next = periods[i + 1]?.start ?? null;
  if (end === null) return next;
  if (next === null) return end;
  return end < next ? end : next;
}

/** The `n`th charge of a period, counting its start as 0. Computed from the start each time, so months don't drift. */
export function paymentDate({ start, cycle }: Pick<BillingPeriod, 'start' | 'cycle'>, n: number) {
  switch (cycle.unit) {
    case 'day':
      return addDays(start, n * cycle.count);
    case 'week':
      return addDays(start, n * cycle.count * 7);
    case 'month':
      return addMonthsClamped(start, n * cycle.count);
    case 'year':
      return addMonthsClamped(start, n * cycle.count * 12);
  }
}

/**
 * A charge number whose date is on or before `date`, close below it, so searches don't step one
 * cycle at a time from the start. Counts every cycle at its longest, so it never overshoots.
 */
function cyclesBefore(period: BillingPeriod, date: DateKey) {
  const days = daysBetween(period.start, date);
  if (days <= 0) return 0;
  return Math.floor(days / (LONGEST_CYCLE_DAYS[period.cycle.unit] * period.cycle.count));
}

const LONGEST_CYCLE_DAYS: Record<CycleUnit, number> = { day: 1, week: 7, month: 31, year: 366 };

/** Every charge from `from` to `to`, both included, oldest first. */
export function paymentsBetween(billing: Periods, from: DateKey, to: DateKey): DateKey[] {
  const dates: DateKey[] = [];
  const { periods } = billing;
  periods.forEach((period, i) => {
    const stop = periodStop(periods, i);
    if (period.start > to || (stop !== null && stop <= from)) return;
    for (let n = cyclesBefore(period, from); ; n++) {
      const date = paymentDate(period, n);
      if (date > to || (stop !== null && date >= stop)) break;
      if (date >= from) dates.push(date);
    }
  });
  return dates;
}

/** The next charge on or after `from`, or null once cancelled. */
export function nextPaymentOnOrAfter(billing: Periods, from: DateKey): DateKey | null {
  const { periods } = billing;
  for (let i = 0; i < periods.length; i++) {
    const period = periods[i];
    const stop = periodStop(periods, i);
    if (stop !== null && stop <= from) continue;
    for (let n = cyclesBefore(period, from); ; n++) {
      const date = paymentDate(period, n);
      if (stop !== null && date >= stop) break;
      if (date >= from) return date;
    }
  }
  return null;
}

/**
 * When what's been paid for runs out, ignoring the final cancellation: the first charge after
 * `today`. A charge made today has paid for the period starting today, so it runs to the one after.
 * Cancelling from this day keeps every charge up to and including today's.
 */
export function paidPeriodEnd(billing: Periods, today: DateKey): DateKey {
  // Never null: without a final end there's always a next charge.
  return nextPaymentOnOrAfter(withoutFinalEnd(billing), addDays(today, 1))!;
}

/** Whether a charge falls on `date`, ignoring the final cancellation. */
export function chargesOn(billing: Periods, date: DateKey): boolean {
  return paymentsBetween(withoutFinalEnd(billing), date, date).length > 0;
}

/** The price charged on `date`: the latest change in effect by then. */
export function priceOn(prices: PriceChange[], date: DateKey): number {
  let amount = prices[0]?.amount ?? 0;
  for (const change of prices) {
    if (change.effectiveDate <= date) amount = change.amount;
  }
  return amount;
}

export type Charge = {
  date: DateKey;
  amount: number;
  /** The cycle this charge pays for. */
  cycle: Cycle;
};

/** What a charge on `date` costs and pays for. */
export function chargeOn(billing: Billing, date: DateKey): Charge {
  return { date, amount: priceOn(billing.prices, date), cycle: cycleOn(billing, date) };
}

/** Every charge from `from` to `to`, both included, oldest first, with what each cost. */
export function chargesBetween(billing: Billing, from: DateKey, to: DateKey): Charge[] {
  return paymentsBetween(billing, from, to).map((date) => chargeOn(billing, date));
}

/** The next charge on or after `from`, or null once cancelled. */
export function nextChargeOnOrAfter(billing: Billing, from: DateKey): Charge | null {
  const date = nextPaymentOnOrAfter(billing, from);
  return date ? chargeOn(billing, date) : null;
}

/** Total charged from `from` to `to`, both included. */
export function spentBetween(billing: Billing, from: DateKey, to: DateKey): number {
  return chargesBetween(billing, from, to).reduce((sum, charge) => sum + charge.amount, 0);
}

/**
 * Why a new period can't start on `from`, or null if it can. Resuming needs the last period to have
 * ended by then; a plan change needs `from` after the last period's start and before its end.
 */
export function newPeriodProblem(billing: Periods, kind: 'resume' | 'change', from: DateKey): string | null {
  const last = lastPeriod(billing);
  if (kind === 'resume') {
    if (last.end === null) return "It hasn't been cancelled.";
    if (from < last.end) return 'Pick a day on or after it was cancelled.';
    return null;
  }
  if (from <= last.start) return 'Pick a day after the current plan started.';
  if (last.end !== null && from >= last.end) return 'Pick a day before it ends, or resume it instead.';
  return null;
}

const AVERAGE_DAYS_PER_MONTH = 365.25 / 12;

/** What a price per `cycle` comes to per month on average, in minor units. */
export function monthlyEquivalent(amount: number, cycle: Cycle): number {
  switch (cycle.unit) {
    case 'day':
      return (amount * AVERAGE_DAYS_PER_MONTH) / cycle.count;
    case 'week':
      return (amount * AVERAGE_DAYS_PER_MONTH) / (7 * cycle.count);
    case 'month':
      return amount / cycle.count;
    case 'year':
      return amount / (12 * cycle.count);
  }
}

/** "month", "3 months", "2 weeks", for "every …" or "per …". */
export function formatCycle({ count, unit }: Cycle): string {
  return count === 1 ? unit : `${count} ${unit}s`;
}

/** "Monthly", "Yearly", "Every 3 months". */
export function formatCycleAdverb(cycle: Cycle): string {
  if (cycle.count === 1) return { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' }[cycle.unit];
  return `Every ${formatCycle(cycle)}`;
}
