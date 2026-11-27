import type { Subscription } from '@/db/subscriptions';
import { simpleSubscription } from '@/test-utils/subscription';

import { BackupError, createBackup, parseBackup, serializeBackup, subscriptionsCsv } from './backup';
import { NO_TAX } from '@/lib/tax';

const netflix: Subscription = simpleSubscription({
  id: 4,
  name: 'Netflix',
  category: 'streaming',
  cycle: { count: 1, unit: 'month' },
  firstPaymentDate: '2026-01-10',
  isTrial: false,
  cancelledOn: null,
  reminderDaysBefore: 3,
  chargeWindowDays: 0,
  renewsEarlyDays: 0,
  tax: NO_TAX,
  notes: 'Family plan, "shared"',
  prices: [
    { amount: 1299, effectiveDate: '2026-01-10' },
    { amount: 1499, effectiveDate: '2026-06-10' },
  ],
});

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
  expect(() => parseBackup(text({ version: 8 }))).toThrow('newer version');
  expect(() => parseBackup(text({ currency: 'XYZ' }))).toThrow('unknown currency');
});

it('refuses a subscription with bad data, naming it', () => {
  const broken = (sub: Record<string, unknown>) => text({ subscriptions: [{ ...netflix, ...sub }] });
  expect(() => parseBackup(broken({ prices: [] }))).toThrow('“Netflix” has no price');
  expect(() => parseBackup(broken({ prices: [{ amount: 12.5, effectiveDate: '2026-01-10' }] }))).toThrow('whole positive');
  const period = netflix.periods[0];
  expect(() => parseBackup(broken({ periods: [] }))).toThrow('“Netflix” has no billing');
  expect(() => parseBackup(broken({ periods: [{ ...period, start: 'yesterday' }] }))).toThrow("billing start isn't a date");
  expect(() => parseBackup(broken({ periods: [{ ...period, start: '2026-02-30' }] }))).toThrow("billing start isn't a date");
  expect(() => parseBackup(broken({ periods: [{ ...period, start: '2026-13-01' }] }))).toThrow("billing start isn't a date");
  expect(() => parseBackup(broken({ periods: [period, { ...period, start: '2026-05-01' }] }))).toThrow('overlap');
  expect(() =>
    parseBackup(broken({ periods: [{ ...period, end: '2026-05-01' }, { ...period, start: '2026-04-01' }] }))
  ).toThrow('overlap');
  expect(() => parseBackup(broken({ category: 'pets' }))).toThrow('unknown category');
  expect(() => parseBackup(broken({ kind: 'chore' }))).toThrow("isn't a subscription or a bill");
  expect(() => parseBackup(broken({ name: '' }))).toThrow('Subscription 1 has no name');
});

it('reads a version 1 backup, with one billing cycle per subscription', () => {
  const v1 = {
    app: 'subtracker',
    version: 1,
    exportedAt: '2026-03-01T00:00:00.000Z',
    currency: 'EUR',
    subscriptions: [
      {
        name: 'Netflix',
        category: 'streaming',
        cycle: { count: 1, unit: 'month' },
        firstPaymentDate: '2026-01-10',
        isTrial: false,
        cancelledOn: '2026-05-10',
        reminderDaysBefore: 3,
        notes: '',
        prices: [{ amount: 1299, effectiveDate: '2026-01-10' }],
      },
    ],
  };
  const [sub] = parseBackup(JSON.stringify(v1)).subscriptions;
  expect(sub.periods).toEqual([{ start: '2026-01-10', cycle: { count: 1, unit: 'month' }, end: '2026-05-10' }]);
  expect(() =>
    parseBackup(JSON.stringify({ ...v1, subscriptions: [{ ...v1.subscriptions[0], firstPaymentDate: 'soon' }] }))
  ).toThrow("first payment isn't a date");
});

it('keeps whether each is a bill', () => {
  const mortgage = { ...netflix, name: 'Mortgage', kind: 'bill' as const, category: 'housing' as const };
  const [sub] = parseBackup(serializeBackup(createBackup([mortgage], 'EUR'))).subscriptions;
  expect(sub.kind).toBe('bill');
});

it('makes utilities in a backup from before bills into bills, like the migration does', () => {
  const v6 = (category: string) => {
    const { kind: _kind, ...withoutKind } = { ...netflix, category };
    return text({ version: 6, subscriptions: [withoutKind] });
  };
  expect(parseBackup(v6('utilities')).subscriptions[0].kind).toBe('bill');
  expect(parseBackup(v6('streaming')).subscriptions[0].kind).toBe('subscription');
  expect(parseBackup(v6('other')).subscriptions[0].kind).toBe('subscription');
});

it('writes a CSV row per subscription, quoting what needs it', () => {
  const [header, row] = subscriptionsCsv([netflix], 'EUR', '2026-03-05').split('\r\n');
  expect(header).toBe(
    'Name,Type,Category,Status,Price (EUR),Tax (%),Tax included,Billed,Per month (EUR),Next charge,First payment,Cancelled from,Notes'
  );
  expect(row).toBe('Netflix,subscription,Streaming,active,12.99,0,,Monthly,12.99,2026-03-10,2026-01-10,,"Family plan, ""shared"""');
});

it('puts what is charged, tax included, in the CSV', () => {
  const taxed = { ...netflix, tax: { rate: 13_000, included: false } };
  const [, row] = subscriptionsCsv([taxed], 'CAD', '2026-03-05').split('\r\n');
  expect(row).toContain('Netflix,subscription,Streaming,active,14.68,13,no,Monthly,14.68,');
});

it('keeps the tax, and reads older backups as without it', () => {
  const taxed = { ...netflix, tax: { rate: 14_975, included: false } };
  expect(parseBackup(serializeBackup(createBackup([taxed], 'CAD'))).subscriptions[0].tax).toEqual(taxed.tax);

  const { tax: _tax, ...v3Sub } = createBackup([taxed], 'CAD').subscriptions[0];
  expect(parseBackup(text({ version: 3, subscriptions: [v3Sub] })).subscriptions[0].tax).toEqual(NO_TAX);

  expect(() => parseBackup(text({ subscriptions: [v3Sub] }))).toThrow('unreadable tax rate');
  expect(() => parseBackup(text({ subscriptions: [{ ...v3Sub, tax: { rate: 21.5, included: true } }] }))).toThrow(
    'unreadable tax rate'
  );
});

it('keeps how late charges can land, and reads older backups as on the day', () => {
  const coffee = { ...netflix, chargeWindowDays: 7 };
  const [sub] = parseBackup(serializeBackup(createBackup([coffee], 'EUR'))).subscriptions;
  expect(sub.chargeWindowDays).toBe(7);

  const { chargeWindowDays: _window, ...v2Sub } = createBackup([netflix], 'EUR').subscriptions[0];
  expect(parseBackup(text({ version: 2, subscriptions: [v2Sub] })).subscriptions[0].chargeWindowDays).toBe(0);

  expect(() => parseBackup(text({ subscriptions: [{ ...v2Sub, chargeWindowDays: -1 }] }))).toThrow('unreadable charge day');
  expect(() => parseBackup(text({ subscriptions: [v2Sub] }))).toThrow('unreadable charge day');
});

it('keeps the charges marked paid, and reads older backups as none', () => {
  const coffee = { ...netflix, chargeWindowDays: 7, paidCharges: ['2026-02-10', '2026-03-10'] };
  expect(parseBackup(serializeBackup(createBackup([coffee], 'EUR'))).subscriptions[0].paidCharges).toEqual(coffee.paidCharges);

  const { paidCharges: _paid, ...v4Sub } = createBackup([coffee], 'EUR').subscriptions[0];
  expect(parseBackup(text({ version: 4, subscriptions: [v4Sub] })).subscriptions[0].paidCharges).toEqual([]);

  expect(() => parseBackup(text({ subscriptions: [v4Sub] }))).toThrow('unreadable paid charges');
  expect(() => parseBackup(text({ subscriptions: [{ ...v4Sub, paidCharges: ['soon'] }] }))).toThrow("paid charge isn't a date");
});

it('keeps how early it renews, and reads older backups as on the day', () => {
  const domain = { ...netflix, renewsEarlyDays: 30 };
  expect(parseBackup(serializeBackup(createBackup([domain], 'EUR'))).subscriptions[0].renewsEarlyDays).toBe(30);

  const { renewsEarlyDays: _early, ...v5Sub } = createBackup([domain], 'EUR').subscriptions[0];
  expect(parseBackup(text({ version: 5, subscriptions: [v5Sub] })).subscriptions[0].renewsEarlyDays).toBe(0);

  expect(() => parseBackup(text({ subscriptions: [v5Sub] }))).toThrow('unreadable early renewal');
  expect(() => parseBackup(text({ subscriptions: [{ ...v5Sub, renewsEarlyDays: -1 }] }))).toThrow('unreadable early renewal');
});
