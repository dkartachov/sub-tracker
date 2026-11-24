import * as Application from 'expo-application';
import { getPermissionsAsync, type NotificationPermissionsStatus } from 'expo-notifications';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Share, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ChipGroup } from '@/components/chip-group';
import { showDialog } from '@/components/dialog';
import { Field, TextField } from '@/components/field';
import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { Screen } from '@/components/screen';
import { InfoRow, Section } from '@/components/section';
import { offerToApplyTax } from '@/components/tax-default-change';
import { ThemedText } from '@/components/themed-text';
import { TimeField } from '@/components/time-field';
import { Radius, Spacing } from '@/constants/theme';
import { getSubscriptions } from '@/db/subscriptions';
import { useTheme } from '@/hooks/use-theme';
import { createBackup, serializeBackup, subscriptionsCsv } from '@/lib/backup';
import { CURRENCIES, getCurrency, setCurrency, useCurrency } from '@/lib/currency';
import { todayKey } from '@/lib/dates';
import { requestNotificationPermission } from '@/lib/renewal-reminders';
import { formatTimeOfDay, setReminderTime, useReminderTime } from '@/lib/reminder-time';
import { formatTaxRate, parseTaxRate, taxRateInputText } from '@/lib/tax';
import { getDefaultTax, typedTaxRateSetting, useDefaultTax, useTypedTaxRate } from '@/lib/tax-setting';
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

      <Section title="Tax">
        <TaxSettings />
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
        <Button title="Privacy policy" variant="secondary" onPress={() => router.push('/privacy-policy')} />
      </Section>
    </Screen>
  );
}

/**
 * The tax region, which fills in the tax of new subscriptions, and the rate for a region without a
 * fixed one (the US). Picked here rather than detected, so the app needs no location access.
 */
function TaxSettings() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const { region, tax } = useDefaultTax();
  const typedRate = useTypedTaxRate();
  const [rateText, setRateText] = useState(typedRate === 0 ? '' : taxRateInputText(typedRate));
  const rate = rateText.trim() === '' ? 0 : parseTaxRate(rateText);

  const saveRate = () => {
    if (rate === null) return;
    const previous = getDefaultTax();
    typedTaxRateSetting.set(rate);
    offerToApplyTax(db, previous, getDefaultTax()).catch(console.warn);
  };

  const detail = region
    ? tax.rate === 0
      ? `Type your ${region.taxName} rate below`
      : `${formatTaxRate(tax.rate)} ${region.taxName}, ${tax.included ? 'included in prices' : 'added on top'}`
    : 'Tap to pick where you live';

  return (
    <>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`Tax region: ${region?.name ?? 'none'}. ${detail}`}
        accessibilityHint="Opens the list of regions"
        onPress={() => router.push('/tax-region')}
        style={[
          styles.regionCard,
          region
            ? { backgroundColor: theme.tintSoft, borderColor: theme.tint }
            : { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        ]}>
        <View style={[styles.regionIcon, { backgroundColor: region ? theme.tint : theme.border }]}>
          <Icon name={{ ios: 'globe', android: 'public' }} color={region ? 'onTint' : 'textSecondary'} size={20} />
        </View>
        <View style={styles.regionText}>
          <ThemedText type="eyebrow" themeColor="textSecondary">
            Region
          </ThemedText>
          <ThemedText type="subtitle" themeColor={region ? 'tint' : 'text'} numberOfLines={2}>
            {region?.name ?? 'None'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {detail}
          </ThemedText>
        </View>
        <Icon name={{ ios: 'chevron.right', android: 'chevron_right' }} color={region ? 'tint' : 'textSecondary'} />
      </PressableScale>
      <ThemedText type="small" themeColor="textSecondary">
        {region
          ? 'New subscriptions get this tax, and each can have its own rate.'
          : 'Fills in the tax on new subscriptions. It stays on this phone.'}
      </ThemedText>
      {region && region.rate === null && (
        <Field label={`Your ${region.taxName} rate (%)`}>
          <TextField value={rateText} onChangeText={setRateText} placeholder="8.875" keyboardType="decimal-pad" />
          <ThemedText type="small" themeColor={rate === null ? 'danger' : 'textSecondary'}>
            {rate === null
              ? 'Type a rate under 100, like 7.25.'
              : 'Your combined state and local rate. Not every state taxes digital subscriptions.'}
          </ThemedText>
          <Button title="Save rate" variant="secondary" onPress={saveRate} disabled={rate === null || rate === typedRate} />
        </Field>
      )}
    </>
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

const styles = StyleSheet.create({
  regionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    borderWidth: 1.5,
  },
  regionIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  regionText: {
    flex: 1,
    gap: Spacing.half,
  },
});
