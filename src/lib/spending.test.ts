import type { Subscription } from '@/db/subscriptions';
import { simpleSubscription, type SimpleSubscription } from '@/test-utils/subscription';

import { getOverview, monthlySpending } from './spending';

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
    notes: '',
    prices: [{ amount: 1000, effectiveDate: '2026-01-10' }],
    ...overrides,
  });
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

it('keeps one cancelled for a later day running, without counting charges it will not make', () => {
  const overview = getOverview(
    [
      // Paid up to Mar 10, when it would have charged again.
      sub({ id: 1, cancelledOn: '2026-03-10' }),
      // Ending in April, so March's charge still comes.
      sub({ id: 2, name: 'Gym', cancelledOn: '2026-04-01' }),
    ],
    TODAY
  );
  expect(overview.activeCount).toBe(2);
  expect(overview.monthly).toBe(1000);
  expect(overview.upcoming.map((c) => [c.sub.name, c.date])).toEqual([['Gym', '2026-03-10']]);
});

it('leaves out a trial cancelled before it converts', () => {
  const overview = getOverview([sub({ isTrial: true, firstPaymentDate: '2026-03-12', cancelledOn: '2026-03-12' })], TODAY);
  expect(overview.trialCount).toBe(1);
  expect(overview.trialsEnding).toEqual([]);
  expect(overview.monthly).toBe(0);
});

it('points out trials that just turned paid', () => {
  const overview = getOverview(
    [
      sub({ id: 1, isTrial: true, firstPaymentDate: '2026-03-02' }),
      sub({ id: 2, isTrial: true, firstPaymentDate: '2026-02-01' }),
      sub({ id: 3, firstPaymentDate: '2026-03-03' }),
    ],
    TODAY
  );
  expect(overview.recentlyConverted.map((t) => [t.sub.id, t.date, t.amount])).toEqual([[1, '2026-03-02', 1000]]);
});

it('totals each of the last months, this one split into charged and still to come', () => {
  const months = monthlySpending(
    [sub({ id: 1, firstPaymentDate: '2025-12-10' }), sub({ id: 2, firstPaymentDate: '2026-02-01', cancelledOn: '2026-03-01' })],
    TODAY,
    4
  );
  expect(months).toEqual([
    { month: '2025-12-01', charged: 1000, scheduled: 0 },
    { month: '2026-01-01', charged: 1000, scheduled: 0 },
    { month: '2026-02-01', charged: 2000, scheduled: 0 },
    // Mar 10 is still ahead on Mar 5.
    { month: '2026-03-01', charged: 0, scheduled: 1000 },
  ]);
});

it("doesn't point out a trial that turned paid once it's been cancelled", () => {
  const overview = getOverview([sub({ isTrial: true, firstPaymentDate: '2026-03-02', cancelledOn: '2026-04-02' })], TODAY);
  expect(overview.recentlyConverted).toEqual([]);
});
