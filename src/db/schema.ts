import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_NAME = 'subtracker.db';

/**
 * Each entry migrates the schema from version `index` to `index + 1`.
 * Append new migrations; never edit ones that have already shipped.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    cycle_count INTEGER NOT NULL CHECK (cycle_count > 0),
    cycle_unit TEXT NOT NULL CHECK (cycle_unit IN ('day', 'week', 'month', 'year')),
    -- For a free trial, the day it converts to paid.
    first_payment_date TEXT NOT NULL,
    is_trial INTEGER NOT NULL DEFAULT 0,
    -- No charges on or after this day.
    cancelled_on TEXT,
    -- Null when reminders are off.
    reminder_days_before INTEGER,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  -- The price history: every charge costs the latest price in effect on its day.
  CREATE TABLE price_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_id INTEGER NOT NULL REFERENCES subscriptions (id) ON DELETE CASCADE,
    amount INTEGER NOT NULL CHECK (amount > 0),
    effective_date TEXT NOT NULL
  );
  CREATE INDEX price_changes_subscription ON price_changes (subscription_id, effective_date);
  `,
];

/** The `user_version` of a fully migrated database. */
export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  while (version < MIGRATIONS.length) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version]);
      await db.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
    version++;
  }
}
