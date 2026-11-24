/// <reference types="node" />

import { DatabaseSync } from 'node:sqlite';

it('moves each subscription billing into a period when migrating from version 1', async () => {
  const sqlite = new DatabaseSync(':memory:');
  // The first migration alone, as a database from before billing periods.
  const { migrateDbIfNeeded } = jest.requireActual<typeof import('./schema')>('./schema');
  const db = {
    execAsync: async (sql: string) => sqlite.exec(sql),
    getFirstAsync: async (sql: string) => sqlite.prepare(sql).get() ?? null,
    withTransactionAsync: async (task: () => Promise<void>) => {
      sqlite.exec('BEGIN');
      await task();
      sqlite.exec('COMMIT');
    },
  };
  sqlite.exec(`
    CREATE TABLE subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT NOT NULL,
      cycle_count INTEGER NOT NULL CHECK (cycle_count > 0),
      cycle_unit TEXT NOT NULL CHECK (cycle_unit IN ('day', 'week', 'month', 'year')),
      first_payment_date TEXT NOT NULL, is_trial INTEGER NOT NULL DEFAULT 0, cancelled_on TEXT,
      reminder_days_before INTEGER, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
    );
    CREATE TABLE price_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id INTEGER NOT NULL REFERENCES subscriptions (id) ON DELETE CASCADE,
      amount INTEGER NOT NULL CHECK (amount > 0), effective_date TEXT NOT NULL
    );
    INSERT INTO subscriptions (name, category, cycle_count, cycle_unit, first_payment_date, cancelled_on, created_at)
      VALUES ('Netflix', 'streaming', 1, 'month', '2026-01-15', '2026-05-15', ''), ('Gym', 'fitness', 3, 'month', '2025-10-01', NULL, '');
    INSERT INTO price_changes (subscription_id, amount, effective_date) VALUES (1, 999, '2026-01-15'), (2, 9000, '2025-10-01');
    PRAGMA user_version = 1;
  `);

  await migrateDbIfNeeded(db as never);

  expect(sqlite.prepare('SELECT subscription_id, start_date, cycle_count, cycle_unit, end_date FROM billing_periods ORDER BY subscription_id').all()).toEqual([
    { subscription_id: 1, start_date: '2026-01-15', cycle_count: 1, cycle_unit: 'month', end_date: '2026-05-15' },
    { subscription_id: 2, start_date: '2025-10-01', cycle_count: 3, cycle_unit: 'month', end_date: null },
  ]);
  const columns = sqlite.prepare('PRAGMA table_info(subscriptions)').all().map((c) => (c as { name: string }).name);
  expect(columns).not.toContain('first_payment_date');
  expect(columns).not.toContain('cancelled_on');
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM price_changes').get()).toEqual({ n: 2 });
});

it('charges existing subscriptions on the day when adding charge windows', async () => {
  const { createTestDb } = jest.requireActual<typeof import('@/test-utils/sqlite')>('@/test-utils/sqlite');
  const db = await createTestDb();
  await db.runAsync("INSERT INTO subscriptions (name, category, notes, created_at) VALUES ('Netflix', 'streaming', '', '')");
  expect(await db.getFirstAsync('SELECT charge_window_days FROM subscriptions')).toEqual({ charge_window_days: 0 });
  await expect(db.runAsync('UPDATE subscriptions SET charge_window_days = -1')).rejects.toThrow();
});

it('gives existing subscriptions no tax when adding tax', async () => {
  const { createTestDb } = jest.requireActual<typeof import('@/test-utils/sqlite')>('@/test-utils/sqlite');
  const db = await createTestDb();
  await db.runAsync("INSERT INTO subscriptions (name, category, notes, created_at) VALUES ('Netflix', 'streaming', '', '')");
  expect(await db.getFirstAsync('SELECT tax_rate, price_includes_tax FROM subscriptions')).toEqual({
    tax_rate: 0,
    price_includes_tax: 1,
  });
  await expect(db.runAsync('UPDATE subscriptions SET tax_rate = -1')).rejects.toThrow();
});
