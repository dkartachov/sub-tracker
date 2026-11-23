import type { Subscription } from '@/db/subscriptions';

import { planReminders, REMINDER_HOUR } from './renewal-reminders';

jest.mock('expo-notifications', () => ({ AndroidImportance: {} }));

function sub(overrides: Partial<Subscription>): Subscription {
  return {
    id: 7,
    name: 'Netflix',
    category: 'streaming',
    cycle: { count: 1, unit: 'month' },
    firstPaymentDate: '2026-01-10',
    isTrial: false,
    cancelledOn: null,
    reminderDaysBefore: 2,
    notes: '',
    prices: [{ amount: 1299, effectiveDate: '2026-01-10' }],
    ...overrides,
  };
}

const NOW = new Date(2026, 2, 8, 12, 0); // Mar 8, noon

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

it('gives a new identifier when anything shown changes', () => {
  const [before] = planReminders([sub({})], NOW, 'EUR');
  const [renamed] = planReminders([sub({ name: 'Netflix Premium' })], NOW, 'EUR');
  const [repriced] = planReminders([sub({ prices: [{ amount: 1499, effectiveDate: '2026-01-10' }] })], NOW, 'EUR');
  expect(new Set([before.identifier, renamed.identifier, repriced.identifier]).size).toBe(3);
});
