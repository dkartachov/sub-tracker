/**
 * Backups are plain JSON text, so they can go anywhere text can (the share sheet, a notes app,
 * an email to yourself) and be pasted back in to restore. Pure: reading and writing the
 * database is in `src/db/backup.ts`.
 *
 * The CSV export is one row per subscription, for spreadsheets. It can't be restored from.
 */
import { CATEGORIES, CATEGORY_INFO, type Category } from '@/constants/categories';
import { nextCharge, statusOf, type Subscription } from '@/db/subscriptions';

import {
  chargedOn,
  CYCLE_UNITS,
  cycleOn,
  finalEnd,
  firstPaymentDate,
  formatCycleAdverb,
  monthlyEquivalent,
  type BillingPeriod,
  type Cycle,
  type CycleUnit,
  type PriceChange,
} from './billing';
import { CURRENCIES, type Currency } from './currency';
import { fromDateKey, toDateKey, type DateKey } from './dates';
import { NO_TAX, TAX_RATE_SCALE, type Tax } from './tax';

/**
 * Changes whenever the format does, so an older app can refuse a backup it can't read. Version 1
 * had one billing cycle per subscription (`firstPaymentDate`, `cycle`, `cancelledOn`) where
 * version 2 has `periods`. Version 3 adds `chargeWindowDays`, 0 for older ones. Version 4 adds
 * `tax`, none for older ones. All four restore.
 */
export const BACKUP_VERSION = 4;

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
  // The round trip turns away days that don't exist, like Feb 30, which Date would roll over.
  if (typeof value !== 'string' || !DATE_KEY.test(value) || toDateKey(fromDateKey(value)) !== value) {
    fail(`${what} isn't a date.`);
  }
  return value;
}

function positiveInteger(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) fail(`${what} isn't a whole positive number.`);
  return value;
}

function parseCycle(cycle: unknown, label: string): Cycle {
  if (!isObject(cycle) || !CYCLE_UNITS.includes(cycle.unit as CycleUnit)) fail(`${label} has an unknown billing cycle.`);
  return { count: positiveInteger(cycle.count, `${label}'s billing cycle`), unit: cycle.unit as CycleUnit };
}

/** A version 2 `periods` list, checked to be in order with only the last one left open. */
function parsePeriods(periods: unknown, label: string): BillingPeriod[] {
  if (!Array.isArray(periods) || periods.length === 0) fail(`${label} has no billing.`);
  const parsed = periods.map((period, i): BillingPeriod => {
    if (!isObject(period)) fail(`${label}'s billing period ${i + 1} is unreadable.`);
    return {
      start: dateKey(period.start, `${label}'s billing start`),
      cycle: parseCycle(period.cycle, label),
      end: period.end === null ? null : dateKey(period.end, `${label}'s billing end`),
    };
  });
  parsed.forEach((period, i) => {
    const next = parsed[i + 1];
    if (!next) return;
    if (period.end === null || next.start <= period.start || next.start < period.end) {
      fail(`${label}'s billing periods overlap.`);
    }
  });
  return parsed;
}

function parseTax(tax: unknown, label: string): Tax {
  if (
    !isObject(tax) ||
    typeof tax.rate !== 'number' ||
    !Number.isInteger(tax.rate) ||
    tax.rate < 0 ||
    tax.rate >= TAX_RATE_SCALE ||
    typeof tax.included !== 'boolean'
  ) {
    fail(`${label} has an unreadable tax rate.`);
  }
  return { rate: tax.rate, included: tax.included };
}

function parseSubscription(value: unknown, index: number, version: number): BackupSubscription {
  const where = `Subscription ${index + 1}`;
  if (!isObject(value)) fail(`${where} is unreadable.`);
  const { name, category, isTrial, reminderDaysBefore, chargeWindowDays, tax, notes, prices } = value;

  if (typeof name !== 'string' || name.trim() === '') fail(`${where} has no name.`);
  const label = `“${name}”`;
  if (!CATEGORIES.includes(category as Category)) fail(`${label} has an unknown category.`);
  const periods: BillingPeriod[] =
    version === 1
      ? [
          {
            start: dateKey(value.firstPaymentDate, `${label}'s first payment`),
            cycle: parseCycle(value.cycle, label),
            end: value.cancelledOn === null ? null : dateKey(value.cancelledOn, `${label}'s cancellation`),
          },
        ]
      : parsePeriods(value.periods, label);
  if (typeof isTrial !== 'boolean') fail(`${label} doesn't say whether it's a trial.`);
  if (reminderDaysBefore !== null && (typeof reminderDaysBefore !== 'number' || !Number.isInteger(reminderDaysBefore) || reminderDaysBefore < 0)) {
    fail(`${label} has an unreadable reminder.`);
  }
  if (version >= 3 && (typeof chargeWindowDays !== 'number' || !Number.isInteger(chargeWindowDays) || chargeWindowDays < 0)) {
    fail(`${label} has an unreadable charge day.`);
  }
  const parsedTax: Tax = version >= 4 ? parseTax(tax, label) : NO_TAX;
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
    isTrial,
    periods,
    reminderDaysBefore: reminderDaysBefore as number | null,
    chargeWindowDays: version >= 3 ? (chargeWindowDays as number) : 0,
    tax: parsedTax,
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
  const { version } = data;
  if (version !== 1 && version !== 2 && version !== 3 && version !== BACKUP_VERSION) fail('This backup is from a newer version of Subtracker. Update the app, then try again.');
  if (!CURRENCIES.includes(data.currency as Currency)) fail('This backup has an unknown currency.');
  if (!Array.isArray(data.subscriptions)) fail('This backup has no subscriptions list.');

  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : '',
    currency: data.currency as Currency,
    subscriptions: data.subscriptions.map((sub, i) => parseSubscription(sub, i, version)),
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
    'Tax (%)',
    'Tax included',
    'Billed',
    `Per month (${currency})`,
    'Next charge',
    'First payment',
    'Cancelled from',
    'Notes',
  ];
  const rows = subs.map((sub) => {
    const next = nextCharge(sub, today);
    // What's charged, tax included, so it adds up with the totals in the app.
    const price = next?.amount ?? chargedOn(sub, today);
    const cycle = next?.cycle ?? cycleOn(sub, today);
    return [
      sub.name,
      CATEGORY_INFO[sub.category].label,
      statusOf(sub, today),
      csvAmount(price),
      sub.tax.rate / 1000,
      sub.tax.rate === 0 ? '' : sub.tax.included ? 'yes' : 'no',
      formatCycleAdverb(cycle),
      csvAmount(monthlyEquivalent(price, cycle)),
      next?.date ?? '',
      firstPaymentDate(sub),
      finalEnd(sub) ?? '',
      sub.notes,
    ];
  });
  // CRLF, the line ending CSV is defined with, which every spreadsheet reads.
  return [header, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n');
}
