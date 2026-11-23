import type { Subscription } from '@/db/subscriptions';

import { BackupError, createBackup, parseBackup, serializeBackup, subscriptionsCsv } from './backup';

const netflix: Subscription = {
  id: 4,
  name: 'Netflix',
  category: 'streaming',
  cycle: { count: 1, unit: 'month' },
  firstPaymentDate: '2026-01-10',
  isTrial: false,
  cancelledOn: null,
  reminderDaysBefore: 3,
  notes: 'Family plan, "shared"',
  prices: [
    { amount: 1299, effectiveDate: '2026-01-10' },
    { amount: 1499, effectiveDate: '2026-06-10' },
  ],
};

const text = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ ...createBackup([netflix], 'EUR', new Date(Date.UTC(2026, 2, 1))), ...overrides });

it('reads back what it writes, without IDs', () => {
  const backup = parseBackup(serializeBackup(createBackup([netflix], 'EUR')));
  const { id: _id, ...withoutId } = netflix;
  expect(backup.currency).toBe('EUR');
  expect(backup.subscriptions).toEqual([withoutId]);
});

it('accepts a backup with spaces or lines around it', () => {
  expect(parseBackup(`\n  ${text()}  \n`).subscriptions).toHaveLength(1);
});

it('refuses text that is not a backup, saying why', () => {
  expect(() => parseBackup('hello')).toThrow(BackupError);
  expect(() => parseBackup('{"app":"other"}')).toThrow("isn't a Subtracker backup");
  expect(() => parseBackup(text({ version: 2 }))).toThrow('newer version');
  expect(() => parseBackup(text({ currency: 'XYZ' }))).toThrow('unknown currency');
});

it('refuses a subscription with bad data, naming it', () => {
  const broken = (sub: Record<string, unknown>) => text({ subscriptions: [{ ...netflix, ...sub }] });
  expect(() => parseBackup(broken({ prices: [] }))).toThrow('“Netflix” has no price');
  expect(() => parseBackup(broken({ prices: [{ amount: 12.5, effectiveDate: '2026-01-10' }] }))).toThrow('whole positive');
  expect(() => parseBackup(broken({ firstPaymentDate: 'yesterday' }))).toThrow("first payment isn't a date");
  expect(() => parseBackup(broken({ category: 'pets' }))).toThrow('unknown category');
  expect(() => parseBackup(broken({ name: '' }))).toThrow('Subscription 1 has no name');
});

it('writes a CSV row per subscription, quoting what needs it', () => {
  const [header, row] = subscriptionsCsv([netflix], 'EUR', '2026-03-05').split('\r\n');
  expect(header).toBe('Name,Category,Status,Price (EUR),Billed,Per month (EUR),Next charge,First payment,Cancelled from,Notes');
  expect(row).toBe('Netflix,Streaming,active,12.99,Monthly,12.99,2026-03-10,2026-01-10,,"Family plan, ""shared"""');
});
