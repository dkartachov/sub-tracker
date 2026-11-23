import type { Subscription } from '@/db/subscriptions';

import { getOverview } from './spending';

function sub(overrides: Partial<Subscription>): Subscription {
  return {
    id: 1,
    name: 'Netflix',
    category: 'streaming',
    cycle: { count: 1, unit: 'month' },
    firstPaymentDate: '2026-01-10',
    isTrial: false,
    cancelledOn: null,
    reminderDaysBefore: null,
    notes: '',
    prices: [{ amount: 1000, effectiveDate: '2026-01-10' }],
    ...overrides,
  };
}

const TODAY = '2026-03-05';

it('totals what is still running', () => {
  const overview = getOverview(
    [
      sub({ id: 1 }),
      sub({ id: 2, name: 'Gym', category: 'fitness', prices: [{ amount: 4000, effectiveDate: '2026-01-10' }] }),
      sub({ id: 3, name: 'Old', cancelledOn: '2026-02-01' }),
      sub({ id: 4, name: 'Yearly', category: 'software', cycle: { count: 1, unit: 'year' }, prices: [{ amount: 12000, effectiveDate: '2026-01-10' }] }),
    ],
    TODAY
  );

  expect(overview.monthly).toBe(1000 + 4000 + 1000);
  expect(overview.yearly).toBe(6000 * 12);
  expect(overview.activeCount).toBe(3);
  expect(overview.byCategory).toEqual([
    { category: 'fitness', monthly: 4000 },
    { category: 'streaming', monthly: 1000 },
    { category: 'software', monthly: 1000 },
  ]);
});

it('counts what was charged this year, cancelled subscriptions included', () => {
  const overview = getOverview([sub({ id: 1 }), sub({ id: 3, cancelledOn: '2026-02-01' })], TODAY);
  // Jan 10 and Feb 10 for the first, Jan 10 only for the cancelled one.
  expect(overview.spentThisYear).toBe(3000);
});

it('lists upcoming charges soonest first', () => {
  const overview = getOverview(
    [sub({ id: 1, name: 'B' }), sub({ id: 2, name: 'A', firstPaymentDate: '2026-01-06' })],
    TODAY
  );
  expect(overview.upcoming.map((c) => [c.sub.name, c.date])).toEqual([
    ['A', '2026-03-06'],
    ['B', '2026-03-10'],
  ]);
});

it('calls out trials about to convert, at the price they convert to', () => {
  const overview = getOverview(
    [
      sub({ id: 1, isTrial: true, firstPaymentDate: '2026-03-12', prices: [{ amount: 1500, effectiveDate: '2026-03-12' }] }),
      sub({ id: 2, isTrial: true, firstPaymentDate: '2026-06-01' }),
    ],
    TODAY
  );
  expect(overview.trialCount).toBe(2);
  expect(overview.trialsEnding.map((t) => [t.sub.id, t.amount])).toEqual([[1, 1500]]);
  expect(overview.monthly).toBe(2500);
  expect(overview.spentThisYear).toBe(0);
});
