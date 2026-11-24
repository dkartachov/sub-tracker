import { createTestDb } from '@/test-utils/sqlite';

import { replaceAllSubscriptions } from './backup';
import { createSubscription, getSubscriptions, type SubscriptionInput } from './subscriptions';
import { NO_TAX } from '@/lib/tax';

const gym: SubscriptionInput = {
  name: 'Gym',
  category: 'fitness',
  cycle: { count: 1, unit: 'month' },
  firstPaymentDate: '2026-01-01',
  isTrial: false,
  reminderDaysBefore: null,
  chargeWindowDays: 0,
  tax: NO_TAX,
  notes: '',
};

it('replaces everything with the backup, price history included', async () => {
  const db = await createTestDb();
  await createSubscription(db, gym, 4000);

  await replaceAllSubscriptions(db, [
    {
      ...gym,
      name: 'Netflix',
      category: 'streaming',
      periods: [
        { start: '2026-01-01', cycle: { count: 1, unit: 'month' }, end: '2026-03-01' },
        { start: '2026-04-01', cycle: { count: 1, unit: 'year' }, end: '2026-05-01' },
      ],
      prices: [
        { amount: 1299, effectiveDate: '2026-01-01' },
        { amount: 1499, effectiveDate: '2026-03-01' },
      ],
    },
  ]);

  const subs = await getSubscriptions(db);
  expect(subs.map((s) => [s.name, s.periods.map((p) => [p.start, p.cycle.unit, p.end]), s.prices.map((p) => p.amount)])).toEqual([
    [
      'Netflix',
      [
        ['2026-01-01', 'month', '2026-03-01'],
        ['2026-04-01', 'year', '2026-05-01'],
      ],
      [1299, 1499],
    ],
  ]);
});

it('keeps what was there when a row fails', async () => {
  const db = await createTestDb();
  await createSubscription(db, gym, 4000);

  // A zero price breaks the table's CHECK, halfway through.
  await expect(
    replaceAllSubscriptions(db, [
      {
        ...gym,
        periods: [{ start: '2026-01-01', cycle: gym.cycle, end: null }],
        prices: [{ amount: 0, effectiveDate: '2026-01-01' }],
      },
    ])
  ).rejects.toThrow();

  expect((await getSubscriptions(db)).map((s) => s.name)).toEqual(['Gym']);
});
