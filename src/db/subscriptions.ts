import type { SQLiteDatabase } from 'expo-sqlite';

import { toCategory, type Category } from '@/constants/categories';
import { CYCLE_UNITS, nextPaymentOnOrAfter, priceOn, type Billing, type PriceChange } from '@/lib/billing';
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

/** What a form edits. The price only when adding: after that it changes through the price history. */
export type SubscriptionInput = Omit<Subscription, 'id' | 'prices' | 'cancelledOn'>;

export type SubscriptionStatus = 'active' | 'trial' | 'cancelled';

/**
 * Cancelled from its cancellation day on, a trial until its first charge. A cancellation day still
 * ahead (access runs until the end of a paid period) leaves it running until then: see `endsOn`.
 */
export function statusOf(sub: Subscription, today: DateKey = todayKey()): SubscriptionStatus {
  if (sub.cancelledOn && sub.cancelledOn <= today) return 'cancelled';
  if (sub.isTrial && sub.firstPaymentDate > today) return 'trial';
  return 'active';
}

/** The day a running subscription that's been cancelled stops, or null if it isn't ending. */
export function endsOn(sub: Subscription, today: DateKey = todayKey()): DateKey | null {
  return sub.cancelledOn && sub.cancelledOn > today ? sub.cancelledOn : null;
}

/** A trial that's been cancelled before it converts, so it'll never charge. */
export function trialWontConvert(sub: Subscription) {
  return sub.isTrial && sub.cancelledOn !== null && sub.cancelledOn <= sub.firstPaymentDate;
}

/** The next charge and what it will cost, or null once cancelled. */
export function nextCharge(sub: Subscription, today: DateKey = todayKey()) {
  const date = nextPaymentOnOrAfter(sub, today);
  return date ? { date, amount: priceOn(sub.prices, date) } : null;
}

/** The price charged today, or the first price for a subscription that hasn't started. */
export function currentPrice(sub: Subscription, today: DateKey = todayKey()) {
  return priceOn(sub.prices, today);
}

type SubscriptionRow = {
  id: number;
  name: string;
  category: string;
  cycle_count: number;
  cycle_unit: string;
  first_payment_date: string;
  is_trial: number;
  cancelled_on: string | null;
  reminder_days_before: number | null;
  notes: string;
};

type PriceRow = { subscription_id: number; amount: number; effective_date: string };

function toSubscription(row: SubscriptionRow, prices: PriceChange[]): Subscription {
  return {
    id: row.id,
    name: row.name,
    category: toCategory(row.category),
    cycle: { count: row.cycle_count, unit: CYCLE_UNITS.find((u) => u === row.cycle_unit) ?? 'month' },
    firstPaymentDate: row.first_payment_date,
    isTrial: row.is_trial === 1,
    cancelledOn: row.cancelled_on,
    reminderDaysBefore: row.reminder_days_before,
    notes: row.notes,
    prices,
  };
}

const SELECT_SUBSCRIPTIONS = `SELECT id, name, category, cycle_count, cycle_unit, first_payment_date, is_trial,
  cancelled_on, reminder_days_before, notes FROM subscriptions`;

/** Every subscription with its price history, by name. */
export async function getSubscriptions(db: SQLiteDatabase): Promise<Subscription[]> {
  const rows = await db.getAllAsync<SubscriptionRow>(`${SELECT_SUBSCRIPTIONS} ORDER BY name COLLATE NOCASE, id`);
  const priceRows = await db.getAllAsync<PriceRow>(
    'SELECT subscription_id, amount, effective_date FROM price_changes ORDER BY effective_date, id'
  );
  const prices = new Map<number, PriceChange[]>();
  for (const row of priceRows) {
    const list = prices.get(row.subscription_id) ?? [];
    list.push({ amount: row.amount, effectiveDate: row.effective_date });
    prices.set(row.subscription_id, list);
  }
  return rows.map((row) => toSubscription(row, prices.get(row.id) ?? []));
}

export async function getSubscription(db: SQLiteDatabase, id: number): Promise<Subscription | null> {
  const row = await db.getFirstAsync<SubscriptionRow>(`${SELECT_SUBSCRIPTIONS} WHERE id = ?`, id);
  if (!row) return null;
  const priceRows = await db.getAllAsync<PriceRow>(
    'SELECT subscription_id, amount, effective_date FROM price_changes WHERE subscription_id = ? ORDER BY effective_date, id',
    id
  );
  return toSubscription(
    row,
    priceRows.map((p) => ({ amount: p.amount, effectiveDate: p.effective_date }))
  );
}

/** Adds a subscription charging `amount` from its first payment, returning its ID. */
export async function createSubscription(db: SQLiteDatabase, input: SubscriptionInput, amount: number) {
  let id = 0;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO subscriptions (name, category, cycle_count, cycle_unit, first_payment_date, is_trial,
        reminder_days_before, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.name,
      input.category,
      input.cycle.count,
      input.cycle.unit,
      input.firstPaymentDate,
      input.isTrial ? 1 : 0,
      input.reminderDaysBefore,
      input.notes,
      new Date().toISOString()
    );
    id = result.lastInsertRowId;
    await db.runAsync(
      'INSERT INTO price_changes (subscription_id, amount, effective_date) VALUES (?, ?, ?)',
      id,
      amount,
      input.firstPaymentDate
    );
  });
  return id;
}

export async function updateSubscription(db: SQLiteDatabase, id: number, input: SubscriptionInput) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE subscriptions SET name = ?, category = ?, cycle_count = ?, cycle_unit = ?, first_payment_date = ?,
        is_trial = ?, reminder_days_before = ?, notes = ? WHERE id = ?`,
      input.name,
      input.category,
      input.cycle.count,
      input.cycle.unit,
      input.firstPaymentDate,
      input.isTrial ? 1 : 0,
      input.reminderDaysBefore,
      input.notes,
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

/** Records a new price from `effectiveDate` on, replacing any change already on that day. */
export async function addPriceChange(db: SQLiteDatabase, id: number, amount: number, effectiveDate: DateKey) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM price_changes WHERE subscription_id = ? AND effective_date = ?', id, effectiveDate);
    await db.runAsync(
      'INSERT INTO price_changes (subscription_id, amount, effective_date) VALUES (?, ?, ?)',
      id,
      amount,
      effectiveDate
    );
  });
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

/** Stops charges from `cancelledOn` (today, a past day or one ahead), or resumes them with null. */
export async function setCancelled(db: SQLiteDatabase, id: number, cancelledOn: DateKey | null) {
  await db.runAsync('UPDATE subscriptions SET cancelled_on = ? WHERE id = ?', cancelledOn, id);
}

export async function deleteSubscription(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM subscriptions WHERE id = ?', id);
}

const TABLES = ['subscriptions', 'price_changes'];

export function useSubscriptions() {
  return useDbQuery(getSubscriptions, TABLES);
}

/** One subscription, or null once it's gone (e.g. just deleted), undefined while loading. */
export function useSubscription(id: number) {
  const all = useSubscriptions();
  return all === undefined ? undefined : (all.find((sub) => sub.id === id) ?? null);
}

