/** The numbers on the Overview tab, from the subscriptions alone. */
import type { Category } from '@/constants/categories';
import { nextCharge, statusOf, trialWontConvert, type Subscription } from '@/db/subscriptions';

import { chargesBetween, monthlyEquivalent, spentBetween } from './billing';
import { addDays, addMonthsClamped, type DateKey } from './dates';

export type UpcomingCharge = { sub: Subscription; date: DateKey; amount: number };

export type Overview = {
  /**
   * Average per month across everything that will charge again, trials at the price they convert
   * to. One cancelled for a later day with no charge left before then costs nothing more.
   */
  monthly: number;
  /** `monthly` over a year. */
  yearly: number;
  activeCount: number;
  trialCount: number;
  /** Charged so far this calendar year, up to and including today. */
  spentThisYear: number;
  /** Charges in the next `UPCOMING_DAYS`, soonest first. */
  upcoming: UpcomingCharge[];
  /** Trials converting to paid soon, soonest first. */
  trialsEnding: UpcomingCharge[];
  /** Trials that turned paid in the last `RECENTLY_CONVERTED_DAYS`, most recent first, at their first charge. */
  recentlyConverted: UpcomingCharge[];
  /** Monthly cost per category, biggest first, without empty ones. */
  byCategory: { category: Category; monthly: number }[];
};

export const UPCOMING_DAYS = 30;

/** Trials converting within this many days are called out on their own. */
export const TRIAL_WARNING_DAYS = 14;

/** Trials that converted within this many days are called out too, in case it went unnoticed. */
export const RECENTLY_CONVERTED_DAYS = 7;

export function getOverview(subs: Subscription[], today: DateKey): Overview {
  const running = subs.filter((sub) => statusOf(sub, today) !== 'cancelled');
  const upcomingEnd = addDays(today, UPCOMING_DAYS - 1);

  const categoryTotals = new Map<Category, number>();
  let monthly = 0;
  for (const sub of running) {
    // A trial costs nothing yet, but what it will cost is what's worth knowing.
    const next = nextCharge(sub, today);
    if (!next) continue;
    const perMonth = monthlyEquivalent(next.amount, sub.cycle);
    monthly += perMonth;
    categoryTotals.set(sub.category, (categoryTotals.get(sub.category) ?? 0) + perMonth);
  }

  const upcoming = subs
    .flatMap((sub) => chargesBetween(sub, today, upcomingEnd).map((charge) => ({ sub, ...charge })))
    .sort((a, b) => a.date.localeCompare(b.date) || a.sub.name.localeCompare(b.sub.name));

  const firstCharge = (sub: Subscription): UpcomingCharge => ({
    sub,
    date: sub.firstPaymentDate,
    amount: chargesBetween(sub, sub.firstPaymentDate, sub.firstPaymentDate)[0]?.amount ?? 0,
  });

  const trialsEnding = running
    .filter((sub) => statusOf(sub, today) === 'trial' && !trialWontConvert(sub))
    .map(firstCharge)
    .filter(({ date }) => date <= addDays(today, TRIAL_WARNING_DAYS))
    .sort((a, b) => a.date.localeCompare(b.date));

  const recentlyConverted = running
    .filter((sub) => sub.isTrial && !trialWontConvert(sub))
    .filter((sub) => sub.firstPaymentDate <= today && sub.firstPaymentDate > addDays(today, -RECENTLY_CONVERTED_DAYS))
    .map(firstCharge)
    .sort((a, b) => b.date.localeCompare(a.date));

  const yearStart = `${today.slice(0, 4)}-01-01`;

  return {
    monthly,
    yearly: monthly * 12,
    activeCount: running.filter((sub) => statusOf(sub, today) === 'active').length,
    trialCount: running.filter((sub) => statusOf(sub, today) === 'trial').length,
    spentThisYear: subs.reduce((sum, sub) => sum + spentBetween(sub, yearStart, today), 0),
    upcoming,
    trialsEnding,
    recentlyConverted,
    byCategory: [...categoryTotals]
      .map(([category, total]) => ({ category, monthly: total }))
      .filter(({ monthly: total }) => total > 0)
      .sort((a, b) => b.monthly - a.monthly),
  };
}

export type MonthSpending = {
  /** The month's first day, `YYYY-MM-01`. */
  month: DateKey;
  /** Charged in the month up to and including today. */
  charged: number;
  /** Still to charge later in the month. Only the current month has any. */
  scheduled: number;
};

/** What was charged in each of the last `months` calendar months, this one last and in full. */
export function monthlySpending(subs: Subscription[], today: DateKey, months = 12): MonthSpending[] {
  const thisMonth = `${today.slice(0, 7)}-01`;
  return Array.from({ length: months }, (_, i) => {
    const month = addMonthsClamped(thisMonth, i - (months - 1));
    const monthEnd = addDays(addMonthsClamped(month, 1), -1);
    let charged = 0;
    let scheduled = 0;
    for (const sub of subs) {
      for (const charge of chargesBetween(sub, month, monthEnd)) {
        if (charge.date <= today) charged += charge.amount;
        else scheduled += charge.amount;
      }
    }
    return { month, charged, scheduled };
  });
}
