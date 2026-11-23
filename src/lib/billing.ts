/**
 * When subscriptions charge and how much. Everything here is pure, so the screens, the spending
 * overview and the renewal reminders all agree, and it can be tested without a database.
 *
 * A subscription charges on its first payment date and then every `cycle` after it, until it's
 * cancelled. Each charge costs the price in effect on that day, from its price history. A free trial
 * is a subscription whose first payment date is the day the trial converts.
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

export type Billing = {
  firstPaymentDate: DateKey;
  cycle: Cycle;
  /** No charges on or after this day. */
  cancelledOn: DateKey | null;
  /** Oldest first, never empty. The first one covers every charge before the next. */
  prices: PriceChange[];
};

/** The `n`th charge, counting the first payment as 0. Computed from the first payment each time, so months don't drift. */
export function paymentDate({ firstPaymentDate, cycle }: Pick<Billing, 'firstPaymentDate' | 'cycle'>, n: number) {
  switch (cycle.unit) {
    case 'day':
      return addDays(firstPaymentDate, n * cycle.count);
    case 'week':
      return addDays(firstPaymentDate, n * cycle.count * 7);
    case 'month':
      return addMonthsClamped(firstPaymentDate, n * cycle.count);
    case 'year':
      return addMonthsClamped(firstPaymentDate, n * cycle.count * 12);
  }
}

/**
 * A charge number whose date is on or before `date`, close below it, so searches don't step one
 * cycle at a time from the first payment. Counts every cycle at its longest, so it never overshoots.
 */
function cyclesBefore(billing: Billing, date: DateKey) {
  const days = daysBetween(billing.firstPaymentDate, date);
  if (days <= 0) return 0;
  return Math.floor(days / (LONGEST_CYCLE_DAYS[billing.cycle.unit] * billing.cycle.count));
}

const LONGEST_CYCLE_DAYS: Record<CycleUnit, number> = { day: 1, week: 7, month: 31, year: 366 };

/** Every charge from `from` to `to`, both included, oldest first. */
export function paymentsBetween(billing: Billing, from: DateKey, to: DateKey): DateKey[] {
  const dates: DateKey[] = [];
  for (let n = cyclesBefore(billing, from); ; n++) {
    const date = paymentDate(billing, n);
    if (date > to || (billing.cancelledOn && date >= billing.cancelledOn)) break;
    if (date >= from) dates.push(date);
  }
  return dates;
}

/** The next charge on or after `from`, or null once cancelled. */
export function nextPaymentOnOrAfter(billing: Billing, from: DateKey): DateKey | null {
  for (let n = cyclesBefore(billing, from); ; n++) {
    const date = paymentDate(billing, n);
    if (billing.cancelledOn && date >= billing.cancelledOn) return null;
    if (date >= from) return date;
  }
}

/** The price charged on `date`: the latest change in effect by then. */
export function priceOn(prices: PriceChange[], date: DateKey): number {
  let amount = prices[0]?.amount ?? 0;
  for (const change of prices) {
    if (change.effectiveDate <= date) amount = change.amount;
  }
  return amount;
}

export type Charge = { date: DateKey; amount: number };

/** Every charge from `from` to `to`, both included, oldest first, with what each cost. */
export function chargesBetween(billing: Billing, from: DateKey, to: DateKey): Charge[] {
  return paymentsBetween(billing, from, to).map((date) => ({ date, amount: priceOn(billing.prices, date) }));
}

/** Total charged from `from` to `to`, both included. */
export function spentBetween(billing: Billing, from: DateKey, to: DateKey): number {
  return chargesBetween(billing, from, to).reduce((sum, charge) => sum + charge.amount, 0);
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
