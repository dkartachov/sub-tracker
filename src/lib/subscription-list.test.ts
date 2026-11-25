import type { Subscription } from '@/db/subscriptions';
import { simpleSubscription, type SimpleSubscription } from '@/test-utils/subscription';

import { arrangeSubscriptions, matchesQuery } from './subscription-list';
import { NO_TAX } from '@/lib/tax';

function sub(overrides: Partial<SimpleSubscription>): Subscription {
  return simpleSubscription({
    id: 1,
    name: 'Netflix',
    category: 'streaming',
    cycle: { count: 1, unit: 'month' },
    firstPaymentDate: '2026-01-10',
    isTrial: false,
    cancelledOn: null,
    reminderDaysBefore: null,
    chargeWindowDays: 0,
    renewsEarlyDays: 0,
    tax: NO_TAX,
    notes: '',
    prices: [{ amount: 1000, effectiveDate: '2026-01-10' }],
    ...overrides,
  });
}

const TODAY = '2026-03-05';

const subs = [
  sub({ id: 1, name: 'netflix' }),
  sub({ id: 2, name: 'Gym', category: 'fitness', firstPaymentDate: '2026-01-06', notes: 'Climbing, annual pass', prices: [{ amount: 4000, effectiveDate: '2026-01-06' }] }),
  sub({ id: 3, name: 'Yearly', category: 'software', cycle: { count: 1, unit: 'year' }, firstPaymentDate: '2025-04-01', prices: [{ amount: 24000, effectiveDate: '2025-04-01' }] }),
  // Paid up until its next charge, so none left.
  sub({ id: 4, name: 'Ending', firstPaymentDate: '2026-01-07', cancelledOn: '2026-03-07', prices: [{ amount: 9900, effectiveDate: '2026-01-07' }] }),
  sub({ id: 5, name: 'Old', cancelledOn: '2026-02-01' }),
  sub({ id: 6, name: 'Older', cancelledOn: '2026-01-15' }),
];

const names = (items: { sub: Subscription }[]) => items.map((item) => item.sub.name);

it('orders running ones by next charge, those with none left last', () => {
  const { running, cancelled } = arrangeSubscriptions(subs, TODAY, 'next');
  expect(names(running)).toEqual(['Gym', 'netflix', 'Yearly', 'Ending']);
  expect(running[3]).toMatchObject({ next: null, ends: '2026-03-07' });
  expect(names(cancelled)).toEqual(['Old', 'Older']);
});

it('orders by cost per month, dearest first', () => {
  expect(names(arrangeSubscriptions(subs, TODAY, 'cost').running)).toEqual(['Gym', 'Yearly', 'netflix', 'Ending']);
});

it('orders by name, ignoring case', () => {
  const { running, cancelled } = arrangeSubscriptions(subs, TODAY, 'name');
  expect(names(running)).toEqual(['Ending', 'Gym', 'netflix', 'Yearly']);
  expect(names(cancelled)).toEqual(['Old', 'Older']);
});

it('searches names, notes and categories, every word', () => {
  expect(matchesQuery(subs[1], 'climb')).toBe(true);
  expect(matchesQuery(subs[1], 'FITNESS')).toBe(true);
  expect(matchesQuery(subs[1], 'gym pass')).toBe(true);
  expect(matchesQuery(subs[1], 'gym monthly')).toBe(false);
  expect(names(arrangeSubscriptions(subs, TODAY, 'name', 'old').cancelled)).toEqual(['Old', 'Older']);
});
