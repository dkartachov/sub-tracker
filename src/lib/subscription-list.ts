/** How the Subscriptions tab filters and orders its list. Pure, apart from the saved sort order. */
import { CATEGORY_INFO } from '@/constants/categories';
import { currentPrice, endsOn, expectedCharge, statusOf, type Subscription } from '@/db/subscriptions';

import { cycleOn, firstPaymentDate, monthlyEquivalent, stoppedSince, type Cycle } from './billing';
import type { DateKey } from './dates';
import { storedSetting } from './stored-setting';

export const SUBSCRIPTION_SORTS = ['next', 'cost', 'name'] as const;
export type SubscriptionSort = (typeof SUBSCRIPTION_SORTS)[number];

export const SUBSCRIPTION_SORT_LABELS: Record<SubscriptionSort, string> = {
  next: 'Next charge',
  cost: 'Cost per month',
  name: 'Name',
};

const sortSetting = storedSetting<SubscriptionSort>('subscriptionSort', 'next', (stored) =>
  SUBSCRIPTION_SORTS.find((s) => s === stored) ?? null
);
export const setSubscriptionSort = sortSetting.set;
export const useSubscriptionSort = sortSetting.use;

export type ListedSubscription = {
  sub: Subscription;
  /** The next charge still to come, with the last day it can land (see `chargeWindowDays`). */
  next: { date: DateKey; latest: DateKey; amount: number; cycle: Cycle; isTrialEnd: boolean } | null;
  /** When one cancelled for a later day stops. */
  ends: DateKey | null;
  /** What it charges per cycle: the next charge's price, else today's. */
  price: number;
  /** The cycle `price` is per: the next charge's, else today's. */
  cycle: Cycle;
  /** For a cancelled one, when it was cancelled. */
  stopped: DateKey | null;
};

/** Whether every word typed is in the name, notes or category, ignoring case. */
export function matchesQuery(sub: Subscription, query: string) {
  const haystack = `${sub.name} ${sub.notes} ${CATEGORY_INFO[sub.category].label}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

const byName = (a: ListedSubscription, b: ListedSubscription) =>
  a.sub.name.localeCompare(b.sub.name, undefined, { sensitivity: 'base' });

/**
 * The running subscriptions in `sort` order and the cancelled ones, most recently cancelled first
 * (or by name when sorting by name), both narrowed to `query`. By next charge, ones with none left
 * go last; by cost, the dearest per month goes first.
 */
export function arrangeSubscriptions(subs: Subscription[], today: DateKey, sort: SubscriptionSort, query = '') {
  const listed = subs
    .filter((sub) => matchesQuery(sub, query))
    .map((sub): ListedSubscription => {
      const next = expectedCharge(sub, today);
      return {
        sub,
        next: next && { ...next, isTrialEnd: statusOf(sub, today) === 'trial' && next.date === firstPaymentDate(sub) },
        ends: endsOn(sub, today),
        price: next?.amount ?? currentPrice(sub, today),
        cycle: next?.cycle ?? cycleOn(sub, today),
        stopped: stoppedSince(sub, today),
      };
    });

  const running = listed.filter(({ sub }) => statusOf(sub, today) !== 'cancelled');
  const cancelled = listed.filter(({ sub }) => statusOf(sub, today) === 'cancelled');

  if (sort === 'next') {
    running.sort((a, b) => (a.next?.date ?? '9999').localeCompare(b.next?.date ?? '9999') || byName(a, b));
  } else if (sort === 'cost') {
    const perMonth = (item: ListedSubscription) => (item.next ? monthlyEquivalent(item.price, item.cycle) : 0);
    running.sort((a, b) => perMonth(b) - perMonth(a) || byName(a, b));
  } else {
    running.sort(byName);
  }

  if (sort === 'name') cancelled.sort(byName);
  else cancelled.sort((a, b) => (b.stopped ?? '').localeCompare(a.stopped ?? '') || byName(a, b));

  return { running, cancelled };
}
