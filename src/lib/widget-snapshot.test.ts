import type { Subscription } from '@/db/subscriptions';
import { simpleSubscription, type SimpleSubscription } from '@/test-utils/subscription';

import { widgetSnapshot } from './widget-snapshot';
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

it('sends the monthly total and the next charges with their dates', () => {
  const snapshot = widgetSnapshot(
    [
      sub({ id: 1 }),
      sub({ id: 2, name: 'Gym', isTrial: true, firstPaymentDate: '2026-03-07', prices: [{ amount: 4500, effectiveDate: '2026-03-07' }] }),
    ],
    'EUR',
    TODAY
  );
  expect(snapshot.monthly).toMatch(/55[.,]00/);
  expect(snapshot.upcoming.map((c) => [c.name, c.isTrialEnd])).toEqual([
    ['Gym', true],
    ['Netflix', false],
  ]);
  expect(snapshot.upcoming[0].when).toMatch(/^Trial ends /);
  expect(snapshot.upcoming[1].amount).toMatch(/10[.,]00/);
});

it('says why there is nothing to show', () => {
  expect(widgetSnapshot([], 'EUR', TODAY).emptyText).toMatch(/Add your subscriptions/);
  expect(widgetSnapshot([sub({ cancelledOn: '2026-02-01' })], 'EUR', TODAY).emptyText).toMatch(/No charges/);
});
