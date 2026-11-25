import type { Subscription } from '@/db/subscriptions';
import { simpleSubscription, type SimpleSubscription } from '@/test-utils/subscription';

import { planReminders } from './renewal-reminders';
import { NO_TAX } from '@/lib/tax';

jest.mock('expo-notifications', () => ({ AndroidImportance: {} }));

function sub(overrides: Partial<SimpleSubscription>): Subscription {
  return simpleSubscription({
    id: 7,
    name: 'Netflix',
    category: 'streaming',
    cycle: { count: 1, unit: 'month' },
    firstPaymentDate: '2026-01-10',
    isTrial: false,
    cancelledOn: null,
    reminderDaysBefore: 2,
    chargeWindowDays: 0,
    renewsEarlyDays: 0,
    tax: NO_TAX,
    notes: '',
    prices: [{ amount: 1299, effectiveDate: '2026-01-10' }],
    ...overrides,
  });
}

const NOW = new Date(2026, 2, 8, 12, 0); // Mar 8, noon
const REMINDER_HOUR = 9;

it('schedules the next few reminders, skipping one already past', () => {
  const planned = planReminders([sub({})], NOW, 'EUR');
  // Mar 10's reminder was due this morning, Mar 8 at 9:00.
  expect(planned.map((r) => r.date)).toEqual([
    new Date(2026, 3, 8, REMINDER_HOUR),
    new Date(2026, 4, 8, REMINDER_HOUR),
    new Date(2026, 5, 8, REMINDER_HOUR),
  ]);
  expect(planned[0].title).toBe('Netflix renews in 2 days');
});

it('warns before a trial converts', () => {
  const [first, second] = planReminders([sub({ isTrial: true, firstPaymentDate: '2026-03-12' })], NOW, 'EUR');
  expect(first.title).toBe('Netflix trial ends in 2 days');
  expect(first.body).toMatch(/unless you cancel/);
  expect(second.title).toBe('Netflix renews in 2 days');
});

it('skips subscriptions with reminders off or cancelled', () => {
  expect(planReminders([sub({ reminderDaysBefore: null }), sub({ cancelledOn: '2026-03-01' })], NOW, 'EUR')).toEqual([]);
});

it('reminds about the charges left before a cancellation still ahead', () => {
  const planned = planReminders([sub({ cancelledOn: '2026-05-01' })], NOW, 'EUR');
  expect(planned.map((r) => r.date)).toEqual([new Date(2026, 3, 8, REMINDER_HOUR)]);
});

it('comes at the chosen time, with a new identifier when it changes', () => {
  // At noon, this evening's reminder for Mar 10 is still ahead, where this morning's has gone.
  const [evening] = planReminders([sub({})], NOW, 'EUR', { hour: 19, minute: 30 });
  expect(evening.date).toEqual(new Date(2026, 2, 8, 19, 30));

  const dayBefore = new Date(2026, 2, 7, 12, 0);
  const [morning] = planReminders([sub({})], dayBefore, 'EUR', { hour: 9, minute: 0 });
  const [sameDayEvening] = planReminders([sub({})], dayBefore, 'EUR', { hour: 19, minute: 30 });
  expect(morning.identifier).not.toBe(sameDayEvening.identifier);
});

it('gives a new identifier when anything shown changes', () => {
  const [before] = planReminders([sub({})], NOW, 'EUR');
  const [renamed] = planReminders([sub({ name: 'Netflix Premium' })], NOW, 'EUR');
  const [repriced] = planReminders([sub({ prices: [{ amount: 1499, effectiveDate: '2026-01-10' }] })], NOW, 'EUR');
  expect(new Set([before.identifier, renamed.identifier, repriced.identifier]).size).toBe(3);
});

it('reminds before the earliest day of a charge that can land late, saying the latest', () => {
  const [first] = planReminders([sub({ chargeWindowDays: 7 })], NOW, 'EUR');
  // This morning's for Mar 10 has gone, so the first is April's.
  expect(first.date).toEqual(new Date(2026, 3, 8, REMINDER_HOUR));
  expect(first.body).toMatch(/from Friday, Apr 10, by Friday, Apr 17 at the latest\.$/);
  const [exact] = planReminders([sub({})], NOW, 'EUR');
  expect(first.identifier).not.toBe(exact.identifier);
});
