import { chargesBetween, spentBetween } from '@/lib/billing';
import { createTestDb } from '@/test-utils/sqlite';

import {
  addPriceChange,
  createSubscription,
  deletePeriod,
  deletePriceChange,
  deleteSubscription,
  expectedCharge,
  endsOn,
  getSubscription,
  getSubscriptions,
  nextCharge,
  setCancelled,
  setChargePaid,
  startPeriod,
  statusOf,
  trialWontConvert,
  replaceTax,
  updateSubscription,
  type SubscriptionInput,
} from './subscriptions';
import { NO_TAX } from '@/lib/tax';

const netflix: SubscriptionInput = {
  name: 'Netflix',
  kind: 'subscription',
  category: 'streaming',
  cycle: { count: 1, unit: 'month' },
  firstPaymentDate: '2026-01-15',
  isTrial: false,
  reminderDaysBefore: 3,
  chargeWindowDays: 0,
  renewsEarlyDays: 0,
  tax: NO_TAX,
  notes: '',
};

it('adds a subscription with its first price', async () => {
  const db = await createTestDb();
  const id = await createSubscription(db, netflix, 999);

  const sub = await getSubscription(db, id);
  expect(sub).toMatchObject({ name: 'Netflix', periods: [{ start: '2026-01-15', cycle: { count: 1, unit: 'month' }, end: null }] });
  expect(sub?.prices).toEqual([{ amount: 999, effectiveDate: '2026-01-15' }]);
});

it('adds a bill ending on a set day, and changes its kind when edited', async () => {
  const db = await createTestDb();
  const mortgage: SubscriptionInput = { ...netflix, name: 'Mortgage', kind: 'bill', category: 'housing', firstPaymentDate: '2026-01-01' };
  // The last payment on Dec 1, 2055, so it ends the day after.
  const id = await createSubscription(db, mortgage, 200000, null, '2055-12-02');

  const sub = (await getSubscription(db, id))!;
  expect(sub.kind).toBe('bill');
  expect(sub.periods).toEqual([{ start: '2026-01-01', cycle: { count: 1, unit: 'month' }, end: '2055-12-02' }]);
  expect(endsOn(sub, '2026-11-27')).toBe('2055-12-02');

  await updateSubscription(db, id, { ...mortgage, kind: 'subscription' });
  expect((await getSubscription(db, id))!.kind).toBe('subscription');
});

it('keeps the price history, one change per day', async () => {
  const db = await createTestDb();
  const id = await createSubscription(db, netflix, 999);
  await addPriceChange(db, id, 1199, '2026-06-01');
  await addPriceChange(db, id, 1299, '2026-06-01');

  const sub = (await getSubscription(db, id))!;
  expect(sub.prices.map((p) => p.amount)).toEqual([999, 1299]);
  expect(nextCharge(sub, '2026-05-20')).toMatchObject({ date: '2026-06-15', amount: 1299 });
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

const month = { count: 1, unit: 'month' } as const;
const year = { count: 1, unit: 'year' } as const;

it('resumes a cancelled subscription without charging for the break', async () => {
  const db = await createTestDb();
  const id = await createSubscription(db, netflix, 999);
  await setCancelled(db, id, '2026-03-15');
  await startPeriod(db, id, 'resume', '2026-07-01', month, 1099);
  const sub = (await getSubscription(db, id))!;

  expect(statusOf(sub, '2026-05-01')).toBe('cancelled');
  expect(nextCharge(sub, '2026-05-01')).toMatchObject({ date: '2026-07-01', amount: 1099 });
  expect(statusOf(sub, '2026-07-01')).toBe('active');
  expect(chargesBetween(sub, '2026-01-01', '2026-08-31').map((c) => [c.date, c.amount])).toEqual([
    ['2026-01-15', 999],
    ['2026-02-15', 999],
    ['2026-07-01', 1099],
    ['2026-08-01', 1099],
  ]);
});

it('only resumes on or after the cancellation', async () => {
  const db = await createTestDb();
  const id = await createSubscription(db, netflix, 999);
  await expect(startPeriod(db, id, 'resume', '2026-07-01', month, null)).rejects.toThrow("hasn't been cancelled");
  await setCancelled(db, id, '2026-03-15');
  await expect(startPeriod(db, id, 'resume', '2026-03-01', month, null)).rejects.toThrow('on or after');
});

it('changes plan from a day, keeping earlier charges and a later cancellation', async () => {
  const db = await createTestDb();
  const id = await createSubscription(db, netflix, 999);
  await setCancelled(db, id, '2027-06-01');
  await startPeriod(db, id, 'change', '2026-04-15', year, 9999);
  const sub = (await getSubscription(db, id))!;

  expect(sub.periods).toEqual([
    { start: '2026-01-15', cycle: month, end: '2026-04-15' },
    { start: '2026-04-15', cycle: year, end: '2027-06-01' },
  ]);
  expect(chargesBetween(sub, '2026-01-01', '2028-01-01').map((c) => [c.date, c.amount])).toEqual([
    ['2026-01-15', 999],
    ['2026-02-15', 999],
    ['2026-03-15', 999],
    ['2026-04-15', 9999],
    ['2027-04-15', 9999],
  ]);
  expect(endsOn(sub, '2026-02-01')).toBe('2027-06-01');
});

it('undoes a plan change or a resume', async () => {
  const db = await createTestDb();
  const id = await createSubscription(db, netflix, 999);
  await startPeriod(db, id, 'change', '2026-04-15', year, null);
  await setCancelled(db, id, '2026-06-01');
  await startPeriod(db, id, 'resume', '2026-09-01', month, null);

  await deletePeriod(db, id, '2026-01-15');
  expect((await getSubscription(db, id))!.periods).toHaveLength(3);

  await deletePeriod(db, id, '2026-09-01');
  expect((await getSubscription(db, id))!.periods.map((p) => p.end)).toEqual(['2026-04-15', '2026-06-01']);

  await deletePeriod(db, id, '2026-04-15');
  expect((await getSubscription(db, id))!.periods).toEqual([{ start: '2026-01-15', cycle: month, end: '2026-06-01' }]);
});

it('edits the first period start and the latest cycle', async () => {
  const db = await createTestDb();
  const id = await createSubscription(db, netflix, 999);
  await startPeriod(db, id, 'change', '2026-04-15', year, null);
  await updateSubscription(db, id, { ...netflix, firstPaymentDate: '2026-01-10', cycle: { count: 2, unit: 'year' } });

  expect((await getSubscription(db, id))!.periods.map((p) => [p.start, p.cycle])).toEqual([
    ['2026-01-10', month],
    ['2026-04-15', { count: 2, unit: 'year' }],
  ]);
});

it('saves its tax and charges it on top', async () => {
  const db = await createTestDb();
  const id = await createSubscription(db, { ...netflix, tax: { rate: 13_000, included: false } }, 1000);
  const sub = (await getSubscription(db, id))!;
  expect(sub.tax).toEqual({ rate: 13_000, included: false });
  expect(nextCharge(sub, '2026-01-01')!.amount).toBe(1130);
  // The price history keeps the price as typed.
  expect(sub.prices[0].amount).toBe(1000);

  await updateSubscription(db, id, { ...netflix, tax: { rate: 21_000, included: true } });
  expect((await getSubscription(db, id))!.tax).toEqual({ rate: 21_000, included: true });
  await expect(db.runAsync('UPDATE subscriptions SET tax_rate = 100000')).rejects.toThrow();
});

it('moves only the subscriptions on the old default to a new one', async () => {
  const db = await createTestDb();
  const untaxed = await createSubscription(db, netflix, 999);
  const own = await createSubscription(db, { ...netflix, name: 'Gym', tax: { rate: 5_000, included: false } }, 3000);

  expect(await replaceTax(db, NO_TAX, { rate: 19_000, included: true })).toBe(1);
  expect((await getSubscription(db, untaxed))!.tax).toEqual({ rate: 19_000, included: true });
  expect((await getSubscription(db, own))!.tax).toEqual({ rate: 5_000, included: false });

  // An included rate isn't the same as that rate added on top.
  expect(await replaceTax(db, { rate: 19_000, included: false }, NO_TAX)).toBe(0);
});

it('saves how late a charge can land', async () => {
  const db = await createTestDb();
  const id = await createSubscription(db, { ...netflix, chargeWindowDays: 7 }, 999);
  expect((await getSubscription(db, id))!.chargeWindowDays).toBe(7);

  await updateSubscription(db, id, { ...netflix, chargeWindowDays: 3 });
  expect((await getSubscription(db, id))!.chargeWindowDays).toBe(3);
});

it('marks a charge paid and not paid again, and drops the marks with the subscription', async () => {
  const db = await createTestDb();
  const id = await createSubscription(db, { ...netflix, chargeWindowDays: 7 }, 999);

  await setChargePaid(db, id, '2026-02-15', true);
  await setChargePaid(db, id, '2026-02-15', true);
  await setChargePaid(db, id, '2026-01-15', true);
  const sub = (await getSubscription(db, id))!;
  expect(sub.paidCharges).toEqual(['2026-01-15', '2026-02-15']);
  expect((await getSubscriptions(db))[0].paidCharges).toEqual(['2026-01-15', '2026-02-15']);
  expect(expectedCharge(sub, '2026-02-18')).toMatchObject({ date: '2026-03-15' });
  // Totals count it either way.
  expect(spentBetween(sub, '2026-01-01', '2026-02-28')).toBe(1998);

  await setChargePaid(db, id, '2026-02-15', false);
  expect(expectedCharge((await getSubscription(db, id))!, '2026-02-18')).toMatchObject({ date: '2026-02-15' });

  await deleteSubscription(db, id);
  expect(await db.getAllAsync('SELECT * FROM paid_charges')).toEqual([]);
});

it('saves how early it renews, and charges renewals that far ahead', async () => {
  const db = await createTestDb();
  const domain = { ...netflix, firstPaymentDate: '2026-11-24', cycle: { count: 1, unit: 'year' as const }, renewsEarlyDays: 30 };
  const id = await createSubscription(db, domain, 1034);
  const sub = (await getSubscription(db, id))!;
  expect(sub.renewsEarlyDays).toBe(30);
  expect(nextCharge(sub, '2026-11-25')?.date).toBe('2027-10-25');

  await updateSubscription(db, id, { ...domain, renewsEarlyDays: 14 });
  expect((await getSubscription(db, id))!.renewsEarlyDays).toBe(14);
});
