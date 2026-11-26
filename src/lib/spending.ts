/**
 * The numbers on the Overview tab, from the subscriptions alone.
 *
 * Housing (rent, a mortgage) is kept apart: the totals, the categories and the chart are for
 * subscriptions, and housing gets its own totals in `housing`. Upcoming charges list both, since
 * that's what's about to leave the account.
 */
import { HOUSING, type Category } from '@/constants/categories';
import { nextCharge, spentSoFar, statusOf, trialWontConvert, type Subscription } from '@/db/subscriptions';

import {
  chargeOn,
  chargesBetween,
  expectedChargesBetween,
  firstPaymentDate,
  hasLanded,
  monthlyEquivalent,
  type ExpectedCharge,
} from './billing';
import { addDays, addMonthsClamped, type DateKey } from './dates';

export type UpcomingCharge = ExpectedCharge & { sub: Subscription };

/** What a group of subscriptions costs: on average from now on, and what it's cost this year. */
export type Totals = {
  /**
   * Average per month across everything that will charge again, trials at the price they convert
   * to. One cancelled for a later day with no charge left before then costs nothing more.
   */
  monthly: number;
  /** `monthly` over a year. */
  yearly: number;
  activeCount: number;
  trialCount: number;
  /** Paid so far this calendar year, up to and including today: one due now that hasn't landed isn't yet. */
  spentThisYear: number;
  /** Monthly cost per category, biggest first, without empty ones. */
  byCategory: { category: Category; monthly: number }[];
};

/** The subscription totals, without housing, which has its own. */
export type Overview = Totals & {
  /** Rent, mortgage and the like, kept out of the subscription totals. */
  housing: Totals;
  /**
   * Charges in the next `UPCOMING_DAYS`, soonest first, and ones due in the last few days that may
   * still land (see `chargeWindowDays`).
   */
  upcoming: UpcomingCharge[];
  /** Trials converting to paid soon, soonest first. */
  trialsEnding: UpcomingCharge[];
  /** Trials that turned paid in the last `RECENTLY_CONVERTED_DAYS`, most recent first, at their first charge. */
  recentlyConverted: UpcomingCharge[];
};

export const UPCOMING_DAYS = 30;

/** Trials converting within this many days are called out on their own. */
export const TRIAL_WARNING_DAYS = 14;

/** Trials that converted within this many days are called out too, in case it went unnoticed. */
export const RECENTLY_CONVERTED_DAYS = 7;

/** Housing (rent, a mortgage), which the Overview keeps apart from the subscription totals. */
export function isHousing(sub: Pick<Subscription, 'category'>) {
  return sub.category === HOUSING;
}

export function getOverview(subs: Subscription[], today: DateKey): Overview {
  const running = subs.filter((sub) => statusOf(sub, today) !== 'cancelled');
  const upcomingEnd = addDays(today, UPCOMING_DAYS - 1);

  const upcoming = subs
    .flatMap((sub) =>
      expectedChargesBetween(sub, today, upcomingEnd, sub.chargeWindowDays, sub.paidCharges).map((charge) => ({ sub, ...charge }))
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.sub.name.localeCompare(b.sub.name));

  // A trial ends on its day, even if the charge it turns into can land later.
  const firstCharge = (sub: Subscription): UpcomingCharge => {
    const charge = chargeOn(sub, firstPaymentDate(sub));
    return { sub, ...charge, latest: charge.date };
  };

  const trialsEnding = running
    .filter((sub) => statusOf(sub, today) === 'trial' && !trialWontConvert(sub))
    .map(firstCharge)
    .filter(({ date }) => date <= addDays(today, TRIAL_WARNING_DAYS))
    .sort((a, b) => a.date.localeCompare(b.date));

  const recentlyConverted = running
    // A cancellation, even one that only takes effect later, means it was noticed.
    .filter((sub) => sub.isTrial && sub.periods.length === 1 && sub.periods[0].end === null)
    .filter((sub) => firstPaymentDate(sub) <= today && firstPaymentDate(sub) > addDays(today, -RECENTLY_CONVERTED_DAYS))
    .map(firstCharge)
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    ...totals(subs.filter((sub) => !isHousing(sub)), today),
    housing: totals(subs.filter(isHousing), today),
    upcoming,
    trialsEnding,
    recentlyConverted,
  };
}

function totals(subs: Subscription[], today: DateKey): Totals {
  const running = subs.filter((sub) => statusOf(sub, today) !== 'cancelled');

  const categoryTotals = new Map<Category, number>();
  let monthly = 0;
  for (const sub of running) {
    // A trial costs nothing yet, but what it will cost is what's worth knowing.
    const next = nextCharge(sub, today);
    if (!next) continue;
    const perMonth = monthlyEquivalent(next.amount, next.cycle);
    monthly += perMonth;
    categoryTotals.set(sub.category, (categoryTotals.get(sub.category) ?? 0) + perMonth);
  }

  const yearStart = `${today.slice(0, 4)}-01-01`;

  return {
    monthly,
    yearly: monthly * 12,
    activeCount: running.filter((sub) => statusOf(sub, today) === 'active').length,
    trialCount: running.filter((sub) => statusOf(sub, today) === 'trial').length,
    spentThisYear: subs.reduce((sum, sub) => sum + spentSoFar(sub, yearStart, today), 0),
    byCategory: [...categoryTotals]
      .map(([category, total]) => ({ category, monthly: total }))
      .filter(({ monthly: total }) => total > 0)
      .sort((a, b) => b.monthly - a.monthly),
  };
}

export type MonthSpending = {
  /** The month's first day, `YYYY-MM-01`. */
  month: DateKey;
  /**
   * Charged in the month up to and including today. A charge that can land late counts once it's
   * marked paid or its last possible day has passed (see `hasLanded`).
   */
  charged: number;
  /**
   * Still to charge: later in the month, or due now and not yet marked paid. Only the current
   * month has any, and the one before while a charge from its last days may still land.
   */
  scheduled: number;
};

/**
 * What was charged in each of the last `months` calendar months, this one last and in full. Pass
 * the subscriptions without housing for the Overview's chart.
 */
export function monthlySpending(subs: Subscription[], today: DateKey, months = 12): MonthSpending[] {
  const thisMonth = `${today.slice(0, 7)}-01`;
  return Array.from({ length: months }, (_, i) => {
    const month = addMonthsClamped(thisMonth, i - (months - 1));
    const monthEnd = addDays(addMonthsClamped(month, 1), -1);
    let charged = 0;
    let scheduled = 0;
    for (const sub of subs) {
      for (const charge of chargesBetween(sub, month, monthEnd)) {
        if (hasLanded(charge.date, sub.chargeWindowDays, today, sub.paidCharges)) charged += charge.amount;
        else scheduled += charge.amount;
      }
    }
    return { month, charged, scheduled };
  });
}
