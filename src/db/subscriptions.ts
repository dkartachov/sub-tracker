import type { SQLiteDatabase } from 'expo-sqlite';

import { toCategory, type Category } from '@/constants/categories';
import {
  CYCLE_UNITS,
  endsAfter,
  firstPaymentDate,
  newPeriodProblem,
  nextChargeOnOrAfter,
  priceOn,
  stoppedSince,
  type Billing,
  type BillingPeriod,
  type Cycle,
  type PriceChange,
} from '@/lib/billing';
import { todayKey, type DateKey } from '@/lib/dates';

import { useDbQuery } from './use-db-query';

export type Subscription = Billing & {
  id: number;
  name: string;
  category: Category;
  isTrial: boolean;
  reminderDaysBefore: number | null;
  notes: string;
};

/**
 * What the add and edit form sets. `firstPaymentDate` is the first period's start and `cycle` the
 * last period's cycle: with a single period, simply the subscription's. The price only when adding:
 * after that it changes through the price history, and the rest of the billing through
 * cancelling, resuming and changing plan.
 */
export type SubscriptionInput = Omit<Subscription, 'id' | 'prices' | 'periods'> & {
  firstPaymentDate: DateKey;
  cycle: Cycle;
};

export type SubscriptionStatus = 'active' | 'trial' | 'cancelled';

/**
 * Cancelled from its cancellation day on (until it's resumed), a trial until its first charge. A
 * cancellation day still ahead (access runs until the end of a paid period) leaves it running until
 * then: see `endsOn`.
 */
export function statusOf(sub: Subscription, today: DateKey = todayKey()): SubscriptionStatus {
  if (stoppedSince(sub, today) !== null) return 'cancelled';
  if (sub.isTrial && firstPaymentDate(sub) > today) return 'trial';
  return 'active';
}

/** The day a running subscription that's been cancelled stops, or null if it isn't ending. */
export function endsOn(sub: Subscription, today: DateKey = todayKey()): DateKey | null {
  return endsAfter(sub, today);
}

/** A trial that's been cancelled before it converts, so it'll never charge. */
export function trialWontConvert(sub: Subscription) {
  const [first] = sub.periods;
  return sub.isTrial && first.end !== null && first.end <= first.start;
}

/** The next charge, what it will cost and the cycle it pays for, or null once cancelled. */
export function nextCharge(sub: Subscription, today: DateKey = todayKey()) {
  return nextChargeOnOrAfter(sub, today);
}

/** The price charged today, or the first price for a subscription that hasn't started. */
export function currentPrice(sub: Subscription, today: DateKey = todayKey()) {
  return priceOn(sub.prices, today);
}

type SubscriptionRow = {
  id: number;
  name: string;
  category: string;
  is_trial: number;
  reminder_days_before: number | null;
  notes: string;
};

type PriceRow = { subscription_id: number; amount: number; effective_date: string };

type PeriodRow = {
  subscription_id: number;
  start_date: string;
  cycle_count: number;
  cycle_unit: string;
  end_date: string | null;
};

function toPeriod(row: PeriodRow): BillingPeriod {
  return {
    start: row.start_date,
    cycle: { count: row.cycle_count, unit: CYCLE_UNITS.find((u) => u === row.cycle_unit) ?? 'month' },
    end: row.end_date,
  };
}

function toSubscription(row: SubscriptionRow, periods: BillingPeriod[], prices: PriceChange[]): Subscription {
  return {
    id: row.id,
    name: row.name,
    category: toCategory(row.category),
    isTrial: row.is_trial === 1,
    reminderDaysBefore: row.reminder_days_before,
    notes: row.notes,
    periods,
    prices,
  };
}

function groupBy<Row extends { subscription_id: number }, T>(rows: Row[], map: (row: Row) => T) {
  const groups = new Map<number, T[]>();
  for (const row of rows) {
    const list = groups.get(row.subscription_id) ?? [];
    list.push(map(row));
    groups.set(row.subscription_id, list);
  }
  return groups;
}

const SELECT_SUBSCRIPTIONS = 'SELECT id, name, category, is_trial, reminder_days_before, notes FROM subscriptions';
const SELECT_PERIODS = 'SELECT subscription_id, start_date, cycle_count, cycle_unit, end_date FROM billing_periods';
const SELECT_PRICES = 'SELECT subscription_id, amount, effective_date FROM price_changes';

const toPrice = (row: PriceRow): PriceChange => ({ amount: row.amount, effectiveDate: row.effective_date });

/** Every subscription with its billing and price history, by name. */
export async function getSubscriptions(db: SQLiteDatabase): Promise<Subscription[]> {
  const rows = await db.getAllAsync<SubscriptionRow>(`${SELECT_SUBSCRIPTIONS} ORDER BY name COLLATE NOCASE, id`);
  const periods = groupBy(await db.getAllAsync<PeriodRow>(`${SELECT_PERIODS} ORDER BY start_date, id`), toPeriod);
  const prices = groupBy(await db.getAllAsync<PriceRow>(`${SELECT_PRICES} ORDER BY effective_date, id`), toPrice);
  return rows.map((row) => toSubscription(row, periods.get(row.id) ?? [], prices.get(row.id) ?? []));
}

export async function getSubscription(db: SQLiteDatabase, id: number): Promise<Subscription | null> {
  const row = await db.getFirstAsync<SubscriptionRow>(`${SELECT_SUBSCRIPTIONS} WHERE id = ?`, id);
  if (!row) return null;
  const periods = await db.getAllAsync<PeriodRow>(`${SELECT_PERIODS} WHERE subscription_id = ? ORDER BY start_date, id`, id);
  const prices = await db.getAllAsync<PriceRow>(`${SELECT_PRICES} WHERE subscription_id = ? ORDER BY effective_date, id`, id);
  return toSubscription(row, periods.map(toPeriod), prices.map(toPrice));
}

/** Adds a subscription charging `amount` from its first payment, returning its ID. */
export async function createSubscription(db: SQLiteDatabase, input: SubscriptionInput, amount: number) {
  let id = 0;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO subscriptions (name, category, is_trial, reminder_days_before, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
      input.name,
      input.category,
      input.isTrial ? 1 : 0,
      input.reminderDaysBefore,
      input.notes,
      new Date().toISOString()
    );
    id = result.lastInsertRowId;
    await db.runAsync(
      'INSERT INTO billing_periods (subscription_id, start_date, cycle_count, cycle_unit) VALUES (?, ?, ?, ?)',
      id,
      input.firstPaymentDate,
      input.cycle.count,
      input.cycle.unit
    );
    await db.runAsync(
      'INSERT INTO price_changes (subscription_id, amount, effective_date) VALUES (?, ?, ?)',
      id,
      amount,
      input.firstPaymentDate
    );
  });
  return id;
}

const FIRST_PERIOD = '(SELECT id FROM billing_periods WHERE subscription_id = ? ORDER BY start_date, id LIMIT 1)';
const LAST_PERIOD = '(SELECT id FROM billing_periods WHERE subscription_id = ? ORDER BY start_date DESC, id DESC LIMIT 1)';

/** Saves the form: the details, the first period's start and the last period's cycle. */
export async function updateSubscription(db: SQLiteDatabase, id: number, input: SubscriptionInput) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE subscriptions SET name = ?, category = ?, is_trial = ?, reminder_days_before = ?, notes = ? WHERE id = ?',
      input.name,
      input.category,
      input.isTrial ? 1 : 0,
      input.reminderDaysBefore,
      input.notes,
      id
    );
    await db.runAsync(`UPDATE billing_periods SET start_date = ? WHERE id = ${FIRST_PERIOD}`, input.firstPaymentDate, id);
    await db.runAsync(
      `UPDATE billing_periods SET cycle_count = ?, cycle_unit = ? WHERE id = ${LAST_PERIOD}`,
      input.cycle.count,
      input.cycle.unit,
      id
    );
    // The first price covers everything up to the next change, so it moves with the first payment.
    await db.runAsync(
      `UPDATE price_changes SET effective_date = ? WHERE id =
        (SELECT id FROM price_changes WHERE subscription_id = ? ORDER BY effective_date, id LIMIT 1)
        AND effective_date > ?`,
      input.firstPaymentDate,
      id,
      input.firstPaymentDate
    );
  });
}

async function insertPriceChange(db: SQLiteDatabase, id: number, amount: number, effectiveDate: DateKey) {
  await db.runAsync('DELETE FROM price_changes WHERE subscription_id = ? AND effective_date = ?', id, effectiveDate);
  await db.runAsync(
    'INSERT INTO price_changes (subscription_id, amount, effective_date) VALUES (?, ?, ?)',
    id,
    amount,
    effectiveDate
  );
}

/** Records a new price from `effectiveDate` on, replacing any change already on that day. */
export async function addPriceChange(db: SQLiteDatabase, id: number, amount: number, effectiveDate: DateKey) {
  await db.withTransactionAsync(() => insertPriceChange(db, id, amount, effectiveDate));
}

/** Removes a price change, except the first, which every subscription needs. */
export async function deletePriceChange(db: SQLiteDatabase, id: number, effectiveDate: DateKey) {
  await db.runAsync(
    `DELETE FROM price_changes WHERE subscription_id = ? AND effective_date = ?
      AND (SELECT COUNT(*) FROM price_changes WHERE subscription_id = ?) > 1
      AND effective_date > (SELECT MIN(effective_date) FROM price_changes WHERE subscription_id = ?)`,
    id,
    effectiveDate,
    id,
    id
  );
}

/**
 * Stops charges from `cancelledOn` (today, a past day or one ahead), or with null undoes a
 * cancellation, letting the last period run on. Resuming after a break is `startPeriod`.
 */
export async function setCancelled(db: SQLiteDatabase, id: number, cancelledOn: DateKey | null) {
  await db.runAsync(`UPDATE billing_periods SET end_date = ? WHERE id = ${LAST_PERIOD}`, cancelledOn, id);
}

/**
 * Starts a new billing period on `from`, charging that day and every `cycle` after it, at `amount`
 * from then on if given (else at the price already in effect). `resume` follows a cancellation,
 * leaving the time between uncharged; `change` switches plan from that day, keeping any later
 * cancellation. Throws if `from` doesn't fit (see `newPeriodProblem`).
 */
export async function startPeriod(
  db: SQLiteDatabase,
  id: number,
  kind: 'resume' | 'change',
  from: DateKey,
  cycle: Cycle,
  amount: number | null
) {
  await db.withTransactionAsync(async () => {
    const rows = await db.getAllAsync<PeriodRow & { id: number }>(
      'SELECT id, subscription_id, start_date, cycle_count, cycle_unit, end_date FROM billing_periods WHERE subscription_id = ? ORDER BY start_date, id',
      id
    );
    if (rows.length === 0) throw new Error(`No subscription ${id}`);
    const problem = newPeriodProblem({ periods: rows.map(toPeriod) }, kind, from);
    if (problem) throw new Error(problem);

    const last = rows[rows.length - 1];
    // A plan change takes over the rest of the current period, cancellation included.
    const end = kind === 'change' ? last.end_date : null;
    if (kind === 'change') await db.runAsync('UPDATE billing_periods SET end_date = ? WHERE id = ?', from, last.id);
    await db.runAsync(
      'INSERT INTO billing_periods (subscription_id, start_date, cycle_count, cycle_unit, end_date) VALUES (?, ?, ?, ?, ?)',
      id,
      from,
      cycle.count,
      cycle.unit,
      end
    );
    if (amount !== null) await insertPriceChange(db, id, amount, from);
  });
}

/**
 * Removes the period starting on `start`, except the first, which every subscription needs. A plan
 * change is undone, so the period before runs on as it did; a resume is undone, so it's cancelled
 * again from when it was. Price changes stay.
 */
export async function deletePeriod(db: SQLiteDatabase, id: number, start: DateKey) {
  await db.withTransactionAsync(async () => {
    const rows = await db.getAllAsync<{ id: number; start_date: string; end_date: string | null }>(
      'SELECT id, start_date, end_date FROM billing_periods WHERE subscription_id = ? ORDER BY start_date, id',
      id
    );
    const index = rows.findIndex((row) => row.start_date === start);
    if (index <= 0) return;
    const [previous, removed] = [rows[index - 1], rows[index]];
    if (previous.end_date === removed.start_date) {
      await db.runAsync('UPDATE billing_periods SET end_date = ? WHERE id = ?', removed.end_date, previous.id);
    }
    await db.runAsync('DELETE FROM billing_periods WHERE id = ?', removed.id);
  });
}

export async function deleteSubscription(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM subscriptions WHERE id = ?', id);
}

/** Every table a subscription is read from, for change listeners. */
export const SUBSCRIPTION_TABLES = ['subscriptions', 'billing_periods', 'price_changes'];

export function useSubscriptions() {
  return useDbQuery(getSubscriptions, SUBSCRIPTION_TABLES);
}

/** One subscription, or null once it's gone (e.g. just deleted), undefined while loading. */
export function useSubscription(id: number) {
  const all = useSubscriptions();
  return all === undefined ? undefined : (all.find((sub) => sub.id === id) ?? null);
}
