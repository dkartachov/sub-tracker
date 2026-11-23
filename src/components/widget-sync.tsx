import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { useSubscriptions } from '@/db/subscriptions';
import { useToday } from '@/hooks/use-today';
import { useCurrency } from '@/lib/currency';
import { widgetSnapshot } from '@/lib/widget-snapshot';
import UpcomingWidget from '@/widgets/upcoming-widget';

/**
 * Keeps the home-screen widget showing the current numbers: whenever the subscriptions or the
 * currency change, at midnight while the app is open, and on leaving the app. The widget can't
 * read the database itself, so between app launches it shows what it was last sent, with dates
 * rather than "tomorrow" so it doesn't go wrong overnight. Renders nothing; it sits inside
 * `SQLiteProvider` for the subscriptions.
 */
export function WidgetSync() {
  const subs = useSubscriptions();
  const currency = useCurrency();
  const today = useToday();

  useEffect(() => {
    if (Platform.OS !== 'android' || subs === undefined) return;
    const push = () => {
      try {
        UpcomingWidget.updateSnapshot(widgetSnapshot(subs, currency, today));
      } catch (error) {
        // A missing or failing widget mustn't take the app down with it.
        console.warn(error);
      }
    };
    push();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'background') push();
    });
    return () => appState.remove();
  }, [subs, currency, today]);

  return null;
}
