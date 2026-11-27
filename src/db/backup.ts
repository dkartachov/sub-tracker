import type { SQLiteDatabase } from 'expo-sqlite';

import type { BackupSubscription } from '@/lib/backup';

/**
 * Replaces every subscription and price with the backup's, all or nothing: if any row fails, the
 * transaction rolls back and what was there before stays.
 */
export async function replaceAllSubscriptions(db: SQLiteDatabase, subs: BackupSubscription[]) {
  const createdAt = new Date().toISOString();
  // Exclusive, so nothing else on the connection (a reminder sync, say) can read it half restored.
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('DELETE FROM paid_charges');
    await txn.runAsync('DELETE FROM price_changes');
    await txn.runAsync('DELETE FROM billing_periods');
    await txn.runAsync('DELETE FROM subscriptions');
    for (const sub of subs) {
      const result = await txn.runAsync(
        `INSERT INTO subscriptions (name, kind, category, is_trial, reminder_days_before, charge_window_days, renews_early_days, tax_rate, price_includes_tax, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        sub.name,
        sub.kind,
        sub.category,
        sub.isTrial ? 1 : 0,
        sub.reminderDaysBefore,
        sub.chargeWindowDays,
        sub.renewsEarlyDays,
        sub.tax.rate,
        sub.tax.included ? 1 : 0,
        sub.notes,
        createdAt
      );
      for (const period of sub.periods) {
        await txn.runAsync(
          'INSERT INTO billing_periods (subscription_id, start_date, cycle_count, cycle_unit, end_date) VALUES (?, ?, ?, ?, ?)',
          result.lastInsertRowId,
          period.start,
          period.cycle.count,
          period.cycle.unit,
          period.end
        );
      }
      for (const price of sub.prices) {
        await txn.runAsync(
          'INSERT INTO price_changes (subscription_id, amount, effective_date) VALUES (?, ?, ?)',
          result.lastInsertRowId,
          price.amount,
          price.effectiveDate
        );
      }
      for (const chargeDate of sub.paidCharges) {
        await txn.runAsync(
          'INSERT INTO paid_charges (subscription_id, charge_date) VALUES (?, ?)',
          result.lastInsertRowId,
          chargeDate
        );
      }
    }
  });
}
