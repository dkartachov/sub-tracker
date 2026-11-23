import { spentBetween } from '@/lib/billing';
import { createTestDb } from '@/test-utils/sqlite';

import {
  addPriceChange,
  createSubscription,
  deletePriceChange,
  deleteSubscription,
  endsOn,
  getSubscription,
  getSubscriptions,
  nextCharge,
  setCancelled,
  statusOf,
  trialWontConvert,
  updateSubscription,
  type SubscriptionInput,
} from './subscriptions';

const netflix: SubscriptionInput = {
  name: 'Netflix',
  category: 'streaming',
  cycle: { count: 1, unit: 'month' },
  firstPaymentDate: '2026-01-15',
  isTrial: false,
  reminderDaysBefore: 3,
  notes: '',
};

it('adds a subscription with its first price', async () => {
  const db = await createTestDb();
  const id = await createSubscription(db, netflix, 999);

  const sub = await getSubscription(db, id);
  expect(sub).toMatchObject({ name: 'Netflix', cycle: { count: 1, unit: 'month' }, cancelledOn: null });
  expect(sub?.prices).toEqual([{ amount: 999, effectiveDate: '2026-01-15' }]);
});

it('keeps the price history, one change per day', async () => {
  const db = await createTestDb();
  const id = await createSubscription(db, netflix, 999);
  await addPriceChange(db, id, 1199, '2026-06-01');
  await addPriceChange(db, id, 1299, '2026-06-01');

  const sub = (await getSubscription(db, id))!;
  expect(sub.prices.map((p) => p.amount)).toEqual([999, 1299]);
  expect(nextCharge(sub, '2026-05-20')).toEqual({ date: '2026-06-15', amount: 1299 });
});

it('never deletes the first price', async () => {
  const db = await createTestDb();
  const id = await createSubscription(db, netflix, 999);
  await addPriceChange(db, id, 1299, '2026-06-01');

  await deletePriceChange(db, id, '2026-01-15');
  await deletePriceChange(db, id, '2026-06-01');
  expect((await getSubscription(db, id))!.prices).toEqual([{ amount: 999, effectiveDate: '2026-01-15' }]);
});

it('moves the first price back with an earlier first payment', async () => {
  const db = await createTestDb();
  const id = await createSubscription(db, netflix, 999);
  await updateSubscription(db, id, { ...netflix, firstPaymentDate: '2025-11-15' });

  expect((await getSubscription(db, id))!.prices[0].effectiveDate).toBe('2025-11-15');
});

it('tells trials, active and cancelled subscriptions apart', async () => {
  const db = await createTestDb();
  const id = await createSubscription(db, { ...netflix, isTrial: true }, 999);

  expect(statusOf((await getSubscription(db, id))!, '2026-01-10')).toBe('trial');
  expect(statusOf((await getSubscription(db, id))!, '2026-01-15')).toBe('active');

  await setCancelled(db, id, '2026-01-12');
  const cancelled = (await getSubscription(db, id))!;
  expect(statusOf(cancelled, '2026-01-12')).toBe('cancelled');
  expect(nextCharge(cancelled, '2026-01-10')).toBeNull();
  expect(trialWontConvert(cancelled)).toBe(true);
});

it('keeps a subscription cancelled for a later day running until then', async () => {
  const db = await createTestDb();
  const id = await createSubscription(db, netflix, 999);
  // Cancelled on Mar 3, but paid up until the charge due Mar 15.
  await setCancelled(db, id, '2026-03-15');
  const sub = (await getSubscription(db, id))!;

  expect(statusOf(sub, '2026-03-03')).toBe('active');
  expect(endsOn(sub, '2026-03-03')).toBe('2026-03-15');
  expect(nextCharge(sub, '2026-03-03')).toBeNull();
  expect(statusOf(sub, '2026-03-15')).toBe('cancelled');
  expect(endsOn(sub, '2026-03-15')).toBeNull();
});

it('can be cancelled from a past day', async () => {
  const db = await createTestDb();
  const id = await createSubscription(db, netflix, 999);
  await setCancelled(db, id, '2026-02-20');
  const sub = (await getSubscription(db, id))!;

  expect(statusOf(sub, '2026-06-01')).toBe('cancelled');
  expect(spentBetween(sub, '2026-01-01', '2026-06-01')).toBe(2 * 999);
});

it('deletes a subscription with its prices', async () => {
  const db = await createTestDb();
  const id = await createSubscription(db, netflix, 999);
  await createSubscription(db, { ...netflix, name: 'Boulder gym' }, 4500);
  await deleteSubscription(db, id);

  const all = await getSubscriptions(db);
  expect(all.map((s) => s.name)).toEqual(['Boulder gym']);
  expect(all[0].prices).toEqual([{ amount: 4500, effectiveDate: '2026-01-15' }]);
});
