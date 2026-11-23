import { addNotificationResponseReceivedListener, setNotificationHandler } from 'expo-notifications';
import { router } from 'expo-router';
import { addDatabaseChangeListener, useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useCurrency } from '@/lib/currency';
import { syncRenewalReminders } from '@/lib/renewal-reminders';

const SYNCED_TABLES = ['subscriptions', 'price_changes'];

setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Keeps scheduled renewal reminders matching the subscriptions, when they change, when the
 * currency changes (it's in the text) and whenever the app opens. Tapping one opens its
 * subscription. Renders nothing; it's a component because it has to sit inside `SQLiteProvider`.
 */
export function ReminderScheduler() {
  const db = useSQLiteContext();
  const currency = useCurrency();

  useEffect(() => {
    const taps = addNotificationResponseReceivedListener((response) => {
      const id = response.notification.request.content.data?.subscriptionId;
      if (typeof id === 'number') router.navigate({ pathname: '/subscription/[id]', params: { id: String(id) } });
    });
    return () => taps.remove();
  }, []);

  useEffect(() => {
    syncRenewalReminders(db);
  }, [db, currency]);

  useEffect(() => {
    const changes = addDatabaseChangeListener((event) => {
      if (SYNCED_TABLES.includes(event.tableName)) syncRenewalReminders(db);
    });
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') syncRenewalReminders(db);
    });
    return () => {
      changes.remove();
      appState.remove();
    };
  }, [db]);

  return null;
}
