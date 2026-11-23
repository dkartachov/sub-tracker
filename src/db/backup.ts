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
    await txn.runAsync('DELETE FROM price_changes');
    await txn.runAsync('DELETE FROM subscriptions');
    for (const sub of subs) {
      const result = await txn.runAsync(
        `INSERT INTO subscriptions (name, category, cycle_count, cycle_unit, first_payment_date, is_trial,
          cancelled_on, reminder_days_before, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        sub.name,
        sub.category,
        sub.cycle.count,
        sub.cycle.unit,
        sub.firstPaymentDate,
        sub.isTrial ? 1 : 0,
        sub.cancelledOn,
        sub.reminderDaysBefore,
        sub.notes,
        createdAt
      );
      for (const price of sub.prices) {
        await txn.runAsync(
          'INSERT INTO price_changes (subscription_id, amount, effective_date) VALUES (?, ?, ?)',
          result.lastInsertRowId,
          price.amount,
          price.effectiveDate
        );
      }
    }
  });
}
