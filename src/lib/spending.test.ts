import type { Subscription } from '@/db/subscriptions';
import { simpleSubscription, type SimpleSubscription } from '@/test-utils/subscription';

import { getOverview, monthlySpending } from './spending';
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

it('keeps bills out of the subscription totals, with their own', () => {
  const mortgage = sub({
    id: 5,
    name: 'Mortgage',
    kind: 'bill',
    category: 'housing',
    firstPaymentDate: '2026-01-01',
    prices: [{ amount: 200000, effectiveDate: '2026-01-01' }],
  });
  const internet = sub({ id: 6, name: 'Internet', kind: 'bill', category: 'utilities', firstPaymentDate: '2026-01-20', prices: [{ amount: 5000, effectiveDate: '2026-01-20' }] });
  const overview = getOverview([sub({ id: 1 }), mortgage, internet], TODAY);

  expect(overview.monthly).toBe(1000);
  expect(overview.activeCount).toBe(1);
  expect(overview.spentThisYear).toBe(2000);
  expect(overview.byCategory).toEqual([{ category: 'streaming', monthly: 1000 }]);
  expect(overview.bills).toEqual({
    monthly: 205000,
    yearly: 205000 * 12,
    activeCount: 2,
    trialCount: 0,
    // The mortgage on Jan 1, Feb 1 and Mar 1, the internet on Jan 20 and Feb 20.
    spentThisYear: 600000 + 10000,
    byCategory: [
      { category: 'housing', monthly: 200000 },
      { category: 'utilities', monthly: 5000 },
    ],
  });
  // Upcoming charges are everything about to leave the account, bills included.
  expect(overview.upcoming.map((c) => [c.sub.name, c.date])).toEqual([
    ['Netflix', '2026-03-10'],
    ['Internet', '2026-03-20'],
    ['Mortgage', '2026-04-01'],
  ]);
});

it('goes by the kind, not the category', () => {
  // A gym contract someone counts as a bill, and a phone plan they count as a subscription.
  const gym = sub({ id: 1, name: 'Gym', kind: 'bill', category: 'fitness' });
  const phone = sub({ id: 2, name: 'Phone', category: 'utilities' });
  const overview = getOverview([gym, phone], TODAY);
  expect(overview.byCategory).toEqual([{ category: 'utilities', monthly: 1000 }]);
  expect(overview.bills.byCategory).toEqual([{ category: 'fitness', monthly: 1000 }]);
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

it('lists a charge due a few days ago that can still land, until its last day', () => {
  const coffee = sub({ name: 'Coffee', firstPaymentDate: '2026-01-02', chargeWindowDays: 7 });
  const { upcoming } = getOverview([coffee], '2026-03-05');
  expect(upcoming.map((c) => [c.date, c.latest])).toEqual([
    ['2026-03-02', '2026-03-09'],
    ['2026-04-02', '2026-04-09'],
  ]);
  expect(getOverview([coffee], '2026-03-10').upcoming.map((c) => c.date)).toEqual(['2026-04-02']);
});

it('leaves out a charge marked paid before its last day, still counting it in what was spent', () => {
  const coffee = sub({ name: 'Coffee', firstPaymentDate: '2026-01-02', chargeWindowDays: 7, paidCharges: ['2026-03-02'] });
  const overview = getOverview([coffee], '2026-03-05');
  expect(overview.upcoming.map((c) => c.date)).toEqual(['2026-04-02']);
  expect(overview.spentThisYear).toBe(3000);
});

describe('a charge that can land late, in the monthly chart', () => {
  // Billed on the 2nd, landing as late as the 9th.
  const coffee = (paidCharges: string[] = []) =>
    sub({ name: 'Coffee', firstPaymentDate: '2026-01-02', chargeWindowDays: 7, prices: [{ amount: 1800, effectiveDate: '2026-01-02' }], paidCharges });

  it('is still to charge while it may land', () => {
    expect(monthlySpending([coffee()], '2026-03-05', 1)).toEqual([{ month: '2026-03-01', charged: 0, scheduled: 1800 }]);
  });

  it('is charged once marked paid', () => {
    expect(monthlySpending([coffee(['2026-03-02'])], '2026-03-05', 1)).toEqual([{ month: '2026-03-01', charged: 1800, scheduled: 0 }]);
  });

  it('is charged once its last day has passed', () => {
    expect(monthlySpending([coffee()], '2026-03-09', 1)).toEqual([{ month: '2026-03-01', charged: 0, scheduled: 1800 }]);
    expect(monthlySpending([coffee()], '2026-03-10', 1)).toEqual([{ month: '2026-03-01', charged: 1800, scheduled: 0 }]);
  });

  it('stays still to charge in its own month when it may land in the next', () => {
    const lateInMonth = sub({ firstPaymentDate: '2026-01-28', chargeWindowDays: 7, prices: [{ amount: 1800, effectiveDate: '2026-01-28' }] });
    expect(monthlySpending([lateInMonth], '2026-03-02', 2)).toEqual([
      { month: '2026-02-01', charged: 0, scheduled: 1800 },
      { month: '2026-03-01', charged: 0, scheduled: 1800 },
    ]);
  });
});

it("doesn't count a charge due now in what was spent until it's paid or its last day passes", () => {
  const coffee = (paidCharges: string[] = []) =>
    sub({ name: 'Coffee', firstPaymentDate: '2026-01-02', chargeWindowDays: 7, paidCharges });
  expect(getOverview([coffee()], '2026-03-05').spentThisYear).toBe(2000);
  expect(getOverview([coffee(['2026-03-02'])], '2026-03-05').spentThisYear).toBe(3000);
  expect(getOverview([coffee()], '2026-03-10').spentThisYear).toBe(3000);
});
