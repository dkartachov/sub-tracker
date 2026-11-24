import * as Application from 'expo-application';
import { getPermissionsAsync, type NotificationPermissionsStatus } from 'expo-notifications';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Share } from 'react-native';

import { Button } from '@/components/button';
import { ChipGroup } from '@/components/chip-group';
import { showDialog } from '@/components/dialog';
import { Screen } from '@/components/screen';
import { InfoRow, Section } from '@/components/section';
import { ThemedText } from '@/components/themed-text';
import { TimeField } from '@/components/time-field';
import { getSubscriptions } from '@/db/subscriptions';
import { createBackup, serializeBackup, subscriptionsCsv } from '@/lib/backup';
import { CURRENCIES, getCurrency, setCurrency, useCurrency } from '@/lib/currency';
import { todayKey } from '@/lib/dates';
import { requestNotificationPermission } from '@/lib/renewal-reminders';
import { formatTimeOfDay, setReminderTime, useReminderTime } from '@/lib/reminder-time';
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

      <Section title="Backup">
        <BackupActions />
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

/**
 * Backups are text, shared through the share sheet (to Drive, email, a notes app) and pasted back
 * in to restore, so they need nothing beyond what the app already has.
 */
function BackupActions() {
  const db = useSQLiteContext();

  const share = async (title: string, message: () => Promise<string>) => {
    try {
      await Share.share({ title, message: await message() }, { dialogTitle: title });
    } catch (error) {
      console.warn(error);
      showDialog({ title: "Couldn't export", message: 'Something went wrong. Try again.' });
    }
  };

  return (
    <>
      <ThemedText type="small" themeColor="textSecondary">
        Your subscriptions only live on this phone. Export a backup now and then and keep it somewhere safe, like
        Drive or an email to yourself. To restore it, copy the whole text and paste it in.
      </ThemedText>
      <Button
        title="Export backup"
        variant="secondary"
        onPress={() =>
          share('Subtracker backup', async () => serializeBackup(createBackup(await getSubscriptions(db), getCurrency())))
        }
      />
      <Button
        title="Export spreadsheet (CSV)"
        variant="secondary"
        onPress={() =>
          share('Subtracker subscriptions', async () => subscriptionsCsv(await getSubscriptions(db), getCurrency(), todayKey()))
        }
      />
      <Button title="Restore a backup" variant="secondary" onPress={() => router.push('/restore')} />
    </>
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

  const time = useReminderTime();

  if (!status) return null;

  if (status.granted) {
    return (
      <>
        <ThemedText type="small" themeColor="textSecondary">
          Reminders are on. They arrive at {formatTimeOfDay(time)}, as many days before a charge as you set on each
          subscription.
        </ThemedText>
        <TimeField value={time} onChange={setReminderTime} />
      </>
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
