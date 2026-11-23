import * as Application from 'expo-application';
import { getPermissionsAsync, type NotificationPermissionsStatus } from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking } from 'react-native';

import { Button } from '@/components/button';
import { ChipGroup } from '@/components/chip-group';
import { Screen } from '@/components/screen';
import { InfoRow, Section } from '@/components/section';
import { ThemedText } from '@/components/themed-text';
import { CURRENCIES, setCurrency, useCurrency } from '@/lib/currency';
import { REMINDER_HOUR, requestNotificationPermission } from '@/lib/renewal-reminders';
import {
  setThemePreference,
  THEME_PREFERENCE_LABELS,
  THEME_PREFERENCES,
  useThemePreference,
} from '@/lib/theme-preference';

export default function SettingsScreen() {
  const currency = useCurrency();
  const theme = useThemePreference();

  return (
    <Screen title="Settings">
      <Section title="Currency">
        <ThemedText type="small" themeColor="textSecondary">
          Every amount is in this currency. Changing it doesn&apos;t convert what you&apos;ve entered.
        </ThemedText>
        <ChipGroup options={CURRENCIES} value={currency} onChange={setCurrency} label={(c) => c} />
      </Section>

      <Section title="Renewal reminders">
        <NotificationStatus />
      </Section>

      <Section title="Appearance">
        <ChipGroup
          options={THEME_PREFERENCES}
          value={theme}
          onChange={setThemePreference}
          label={(p) => THEME_PREFERENCE_LABELS[p]}
        />
      </Section>

      <Section title="About">
        <InfoRow label="Version" value={`${Application.nativeApplicationVersion ?? '?'} (${Application.nativeBuildVersion ?? '?'})`} />
        <ThemedText type="small" themeColor="textSecondary">
          Everything you enter stays on this phone.
        </ThemedText>
      </Section>
    </Screen>
  );
}

/** Whether reminders can show, with a way to allow them. Re-checked on returning from system settings. */
function NotificationStatus() {
  const [status, setStatus] = useState<NotificationPermissionsStatus>();

  const refresh = useCallback(() => {
    getPermissionsAsync().then(setStatus, console.warn);
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  if (!status) return null;

  const hour = new Date(2026, 0, 1, REMINDER_HOUR).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  if (status.granted) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        Reminders are on. They arrive at {hour}, as many days before a charge as you set on each subscription.
      </ThemedText>
    );
  }

  return (
    <>
      <ThemedText type="small" themeColor="textSecondary">
        Notifications are off, so you won&apos;t be reminded before renewals or trials end.
      </ThemedText>
      <Button
        title={status.canAskAgain ? 'Allow notifications' : 'Open system settings'}
        variant="secondary"
        onPress={async () => {
          if (status.canAskAgain) setStatus(await requestNotificationPermission());
          else Linking.openSettings();
        }}
      />
    </>
  );
}
