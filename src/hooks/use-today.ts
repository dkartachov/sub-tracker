import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { todayKey, type DateKey } from '@/lib/dates';

/** Milliseconds from `now` until the next local midnight. */
function untilMidnight(now: Date) {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return midnight.getTime() - now.getTime();
}

/**
 * Today's date key, kept current: it changes at midnight while the app is open and is checked
 * again whenever the app comes back to the foreground. Screens use this rather than calling
 * `todayKey()` while rendering, so "today", "tomorrow" and the upcoming charges move on overnight.
 */
export function useToday(): DateKey {
  const [today, setToday] = useState(todayKey);

  useEffect(() => {
    // A second past midnight, so a timer firing a touch early still lands on the new day.
    const timer = setTimeout(() => setToday(todayKey()), untilMidnight(new Date()) + 1000);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') setToday(todayKey());
    });
    return () => {
      clearTimeout(timer);
      appState.remove();
    };
  }, [today]);

  return today;
}
