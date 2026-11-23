/** The numbers on the Overview tab, from the subscriptions alone. */
import type { Category } from '@/constants/categories';
import { currentPrice, nextCharge, statusOf, type Subscription } from '@/db/subscriptions';

import { monthlyEquivalent, paymentsBetween, priceOn, spentBetween } from './billing';
import { addDays, todayKey, type DateKey } from './dates';

export type UpcomingCharge = { sub: Subscription; date: DateKey; amount: number };

export type Overview = {
  /** Average per month across everything still running, trials at the price they convert to. */
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
  /** Monthly cost per category, biggest first, without empty ones. */
  byCategory: { category: Category; monthly: number }[];
};

export const UPCOMING_DAYS = 30;

/** Trials converting within this many days are called out on their own. */
export const TRIAL_WARNING_DAYS = 14;

export function getOverview(subs: Subscription[], today: DateKey = todayKey()): Overview {
  const running = subs.filter((sub) => statusOf(sub, today) !== 'cancelled');
  const upcomingEnd = addDays(today, UPCOMING_DAYS - 1);

  const categoryTotals = new Map<Category, number>();
  let monthly = 0;
  for (const sub of running) {
    // A trial costs nothing yet, but what it will cost is what's worth knowing.
    const price = nextCharge(sub, today)?.amount ?? currentPrice(sub, today);
    const perMonth = monthlyEquivalent(price, sub.cycle);
    monthly += perMonth;
    categoryTotals.set(sub.category, (categoryTotals.get(sub.category) ?? 0) + perMonth);
  }

  const upcoming = subs
    .flatMap((sub) =>
      paymentsBetween(sub, today, upcomingEnd).map((date) => ({ sub, date, amount: priceOn(sub.prices, date) }))
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.sub.name.localeCompare(b.sub.name));

  const trialsEnding = running
    .filter((sub) => statusOf(sub, today) === 'trial')
    .map((sub) => ({ sub, date: sub.firstPaymentDate, amount: priceOn(sub.prices, sub.firstPaymentDate) }))
    .filter(({ date }) => date <= addDays(today, TRIAL_WARNING_DAYS))
    .sort((a, b) => a.date.localeCompare(b.date));

  const yearStart = `${today.slice(0, 4)}-01-01`;

  return {
    monthly,
    yearly: monthly * 12,
    activeCount: running.filter((sub) => statusOf(sub, today) === 'active').length,
    trialCount: running.filter((sub) => statusOf(sub, today) === 'trial').length,
    spentThisYear: subs.reduce((sum, sub) => sum + spentBetween(sub, yearStart, today), 0),
    upcoming,
    trialsEnding,
    byCategory: [...categoryTotals]
      .map(([category, total]) => ({ category, monthly: total }))
      .filter(({ monthly: total }) => total > 0)
      .sort((a, b) => b.monthly - a.monthly),
  };
}
