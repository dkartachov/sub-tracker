/**
 * Backups are plain JSON text, so they can go anywhere text can (the share sheet, a notes app,
 * an email to yourself) and be pasted back in to restore. Pure: reading and writing the
 * database is in `src/db/backup.ts`.
 *
 * The CSV export is one row per subscription, for spreadsheets. It can't be restored from.
 */
import { CATEGORIES, CATEGORY_INFO, type Category } from '@/constants/categories';
import { nextCharge, statusOf, type Subscription } from '@/db/subscriptions';

import { CYCLE_UNITS, formatCycleAdverb, monthlyEquivalent, priceOn, type CycleUnit, type PriceChange } from './billing';
import { CURRENCIES, type Currency } from './currency';
import type { DateKey } from './dates';

/** Changes whenever the format does, so an older app can refuse a backup it can't read. */
export const BACKUP_VERSION = 1;

const BACKUP_APP = 'subtracker';

export type BackupSubscription = Omit<Subscription, 'id'>;

export type Backup = {
  app: typeof BACKUP_APP;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  currency: Currency;
  subscriptions: BackupSubscription[];
};

export function createBackup(subs: Subscription[], currency: Currency, now: Date = new Date()): Backup {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    currency,
    subscriptions: subs.map(({ id: _id, ...sub }) => sub),
  };
}

export function serializeBackup(backup: Backup): string {
  return JSON.stringify(backup, null, 1);
}

/** Why a backup couldn't be read, in words for the person restoring it. */
export class BackupError extends Error {}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function fail(message: string): never {
  throw new BackupError(message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function dateKey(value: unknown, what: string): DateKey {
  if (typeof value !== 'string' || !DATE_KEY.test(value)) fail(`${what} isn't a date.`);
  return value;
}

function positiveInteger(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) fail(`${what} isn't a whole positive number.`);
  return value;
}

function parseSubscription(value: unknown, index: number): BackupSubscription {
  const where = `Subscription ${index + 1}`;
  if (!isObject(value)) fail(`${where} is unreadable.`);
  const { name, category, cycle, firstPaymentDate, isTrial, cancelledOn, reminderDaysBefore, notes, prices } = value;

  if (typeof name !== 'string' || name.trim() === '') fail(`${where} has no name.`);
  const label = `“${name}”`;
  if (!CATEGORIES.includes(category as Category)) fail(`${label} has an unknown category.`);
  if (!isObject(cycle) || !CYCLE_UNITS.includes(cycle.unit as CycleUnit)) fail(`${label} has an unknown billing cycle.`);
  const count = positiveInteger(cycle.count, `${label}'s billing cycle`);
  if (typeof isTrial !== 'boolean') fail(`${label} doesn't say whether it's a trial.`);
  if (reminderDaysBefore !== null && (typeof reminderDaysBefore !== 'number' || !Number.isInteger(reminderDaysBefore) || reminderDaysBefore < 0)) {
    fail(`${label} has an unreadable reminder.`);
  }
  if (typeof notes !== 'string') fail(`${label} has unreadable notes.`);
  if (!Array.isArray(prices) || prices.length === 0) fail(`${label} has no price.`);

  const parsedPrices: PriceChange[] = prices
    .map((price, i) => {
      if (!isObject(price)) fail(`${label}'s price ${i + 1} is unreadable.`);
      return {
        amount: positiveInteger(price.amount, `${label}'s price`),
        effectiveDate: dateKey(price.effectiveDate, `${label}'s price date`),
      };
    })
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  if (new Set(parsedPrices.map((p) => p.effectiveDate)).size !== parsedPrices.length) {
    fail(`${label} has two prices on the same day.`);
  }

  return {
    name: name.trim(),
    category: category as Category,
    cycle: { count, unit: cycle.unit as CycleUnit },
    firstPaymentDate: dateKey(firstPaymentDate, `${label}'s first payment`),
    isTrial,
    cancelledOn: cancelledOn === null ? null : dateKey(cancelledOn, `${label}'s cancellation`),
    reminderDaysBefore: reminderDaysBefore as number | null,
    notes,
    prices: parsedPrices,
  };
}

/** Reads a backup from pasted text, checking all of it, or throws a `BackupError` saying what's wrong. */
export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text.trim());
  } catch {
    fail("This isn't a Subtracker backup. Paste the whole text you exported, from the first { to the last }.");
  }
  if (!isObject(data) || data.app !== BACKUP_APP) fail("This isn't a Subtracker backup.");
  if (data.version !== BACKUP_VERSION) fail('This backup is from a newer version of Subtracker. Update the app, then try again.');
  if (!CURRENCIES.includes(data.currency as Currency)) fail('This backup has an unknown currency.');
  if (!Array.isArray(data.subscriptions)) fail('This backup has no subscriptions list.');

  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : '',
    currency: data.currency as Currency,
    subscriptions: data.subscriptions.map(parseSubscription),
  };
}

/** A CSV field, quoted when it holds a comma, quote or line break. */
function csvField(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Amounts as plain decimals ("12.99"), which spreadsheets read as numbers, in the backup's currency. */
function csvAmount(minor: number) {
  return (Math.round(minor) / 100).toFixed(2);
}

/** One row per subscription with its current price and status, for a spreadsheet. */
export function subscriptionsCsv(subs: Subscription[], currency: Currency, today: DateKey): string {
  const header = [
    'Name',
    'Category',
    'Status',
    `Price (${currency})`,
    'Billed',
    `Per month (${currency})`,
    'Next charge',
    'First payment',
    'Cancelled from',
    'Notes',
  ];
  const rows = subs.map((sub) => {
    const next = nextCharge(sub, today);
    const price = next?.amount ?? priceOn(sub.prices, today);
    return [
      sub.name,
      CATEGORY_INFO[sub.category].label,
      statusOf(sub, today),
      csvAmount(price),
      formatCycleAdverb(sub.cycle),
      csvAmount(monthlyEquivalent(price, sub.cycle)),
      next?.date ?? '',
      sub.firstPaymentDate,
      sub.cancelledOn ?? '',
      sub.notes,
    ];
  });
  // CRLF, the line ending CSV is defined with, which every spreadsheet reads.
  return [header, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n');
}
