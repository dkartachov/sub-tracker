import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { ChipGroup } from '@/components/chip-group';
import { DateField } from '@/components/date-field';
import { Field, TextField } from '@/components/field';
import { FormScreen } from '@/components/form-screen';
import { PageHeader } from '@/components/page-header';
import { ScrollView } from '@/components/scroll-view';
import { ThemedText } from '@/components/themed-text';
import { CATEGORIES, CATEGORY_INFO, type Category } from '@/constants/categories';
import { suggestTemplates, type SubscriptionTemplate } from '@/constants/templates';
import { Spacing } from '@/constants/theme';
import {
  createSubscription,
  updateSubscription,
  useSubscription,
  type Subscription,
  type SubscriptionInput,
} from '@/db/subscriptions';
import { useTheme } from '@/hooks/use-theme';
import { CYCLE_UNITS, type CycleUnit } from '@/lib/billing';
import { currencyDecimals, moneyPlaceholder, parseMoney, useCurrency } from '@/lib/currency';
import { todayKey } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { requestNotificationPermission } from '@/lib/renewal-reminders';

const REMINDER_OPTIONS = [-1, 0, 1, 3, 7] as const;
type ReminderOption = (typeof REMINDER_OPTIONS)[number];

const DEFAULT_REMINDER_DAYS = 3;

function reminderLabel(days: ReminderOption) {
  if (days === -1) return 'Off';
  if (days === 0) return 'Same day';
  return days === 1 ? '1 day before' : `${days} days before`;
}

/** Adds a subscription, or edits the one in `id`. */
export default function EditSubscriptionScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useSubscription(Number(id ?? 0));

  if (id === undefined) return <SubscriptionForm />;
  return existing ? <SubscriptionForm existing={existing} /> : null;
}

function SubscriptionForm({ existing }: { existing?: Subscription }) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const currency = useCurrency();

  const [name, setName] = useState(existing?.name ?? '');
  const [priceText, setPriceText] = useState('');
  const [cycleCountText, setCycleCountText] = useState(String(existing?.cycle.count ?? 1));
  const [cycleUnit, setCycleUnit] = useState<CycleUnit>(existing?.cycle.unit ?? 'month');
  const [firstPaymentDate, setFirstPaymentDate] = useState(existing?.firstPaymentDate ?? todayKey());
  const [isTrial, setIsTrial] = useState(existing?.isTrial ?? false);
  const [category, setCategory] = useState<Category>(existing?.category ?? 'streaming');
  const [reminder, setReminder] = useState<ReminderOption>(
    existing ? ((existing.reminderDaysBefore ?? -1) as ReminderOption) : DEFAULT_REMINDER_DAYS
  );
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [saving, setSaving] = useState(false);

  const price = parseMoney(priceText, currency);
  const cycleCount = Number(cycleCountText);
  const cycleValid = Number.isInteger(cycleCount) && cycleCount >= 1 && cycleCount <= 99;
  const valid = name.trim() !== '' && cycleValid && (existing !== undefined || price !== null);
  const suggestions = existing ? [] : suggestTemplates(name);

  const applyTemplate = (template: SubscriptionTemplate) => {
    setName(template.name);
    setCategory(template.category);
    setCycleCountText(String(template.cycle.count));
    setCycleUnit(template.cycle.unit);
  };

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    const input: SubscriptionInput = {
      name: name.trim(),
      category,
      cycle: { count: cycleCount, unit: cycleUnit },
      firstPaymentDate,
      isTrial,
      reminderDaysBefore: reminder === -1 ? null : reminder,
      notes: notes.trim(),
    };
    try {
      if (existing) await updateSubscription(db, existing.id, input);
      else await createSubscription(db, input, price!);
      haptic.success();
      // Asked here, when a reminder has just been set up, rather than out of nowhere at launch.
      if (input.reminderDaysBefore !== null) requestNotificationPermission().catch(console.warn);
      router.back();
    } catch (error) {
      console.error(error);
      setSaving(false);
    }
  };

  return (
    <FormScreen>
      <PageHeader title={existing ? 'Edit subscription' : 'New subscription'} />

      <Field label="Name">
        <TextField
          value={name}
          onChangeText={setName}
          placeholder="Netflix, climbing gym…"
          autoCapitalize="words"
          autoFocus={!existing}
          returnKeyType="next"
        />
        {suggestions.length > 0 && (
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="handled"
            accessibilityLabel="Suggestions"
            contentContainerStyle={styles.suggestions}>
            {suggestions.map((template) => (
              <Chip key={template.name} label={template.name} selected={false} onPress={() => applyTemplate(template)} />
            ))}
          </ScrollView>
        )}
      </Field>

      {!existing && (
        <Field label={`Price (${currency})`}>
          <TextField value={priceText} onChangeText={setPriceText} placeholder={moneyPlaceholder(currency)} keyboardType={currencyDecimals(currency) === 0 ? 'number-pad' : 'decimal-pad'} />
        </Field>
      )}

      <Field label="Billed every">
        <View style={styles.cycleRow}>
          <TextField
            value={cycleCountText}
            onChangeText={setCycleCountText}
            keyboardType="number-pad"
            maxLength={2}
            style={styles.cycleCount}
            selectTextOnFocus
          />
          <View style={styles.cycleUnits}>
            <ChipGroup
              options={CYCLE_UNITS}
              value={cycleUnit}
              onChange={setCycleUnit}
              label={(unit) => (cycleCount === 1 ? unit : `${unit}s`)}
            />
          </View>
        </View>
      </Field>

      <View style={styles.switchRow}>
        <View style={styles.switchText}>
          <ThemedText type="smallBold">Free trial</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Free until the date below, then charged.
          </ThemedText>
        </View>
        <Switch
          value={isTrial}
          onValueChange={(value) => {
            haptic.select();
            setIsTrial(value);
          }}
          trackColor={{ true: theme.trial, false: theme.border }}
          thumbColor={theme.backgroundElement}
        />
      </View>

      <Field label={isTrial ? 'Trial ends, first charge on' : 'First payment'}>
        <DateField value={firstPaymentDate} onChange={setFirstPaymentDate} defaultDate={new Date()} />
        {!isTrial && (
          <ThemedText type="small" themeColor="textSecondary">
            Any past charge works: renewals are counted on from it.
          </ThemedText>
        )}
      </Field>

      <Field label="Category">
        <ChipGroup
          options={CATEGORIES}
          value={category}
          onChange={setCategory}
          label={(c) => CATEGORY_INFO[c].label}
        />
      </Field>

      <Field label={isTrial ? 'Remind me before it ends' : 'Remind me before it renews'}>
        <ChipGroup options={REMINDER_OPTIONS} value={reminder} onChange={setReminder} label={reminderLabel} />
      </Field>

      <Field label="Notes">
        <TextField
          value={notes}
          onChangeText={setNotes}
          placeholder="Plan, account email, how to cancel…"
          multiline
          style={styles.notes}
        />
      </Field>

      <Button title={existing ? 'Save' : 'Add subscription'} onPress={save} disabled={!valid} loading={saving} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  suggestions: {
    gap: Spacing.two,
  },
  cycleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.twoAndHalf,
  },
  cycleCount: {
    width: 64,
    textAlign: 'center',
  },
  cycleUnits: {
    flex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  switchText: {
    flex: 1,
  },
  notes: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
});
