import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { ChipGroup } from '@/components/chip-group';
import { CycleField, parseCycle } from '@/components/cycle-field';
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
  typedPrice,
  updateSubscription,
  useSubscription,
  type Subscription,
  type SubscriptionInput,
} from '@/db/subscriptions';
import { useTheme } from '@/hooks/use-theme';
import {
  firstPaymentDate as firstPaymentOf,
  formatChargeWindow,
  formatCycle,
  formatRenewsEarly,
  lastPeriod,
  maxChargeWindowDays,
  maxRenewsEarlyDays,
  paymentDate,
  type Cycle,
  type CycleUnit,
} from '@/lib/billing';
import { currencyDecimals, formatMoney, moneyPlaceholder, parseMoney, useCurrency, type Currency } from '@/lib/currency';
import { formatDateKey, todayKey } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { requestNotificationPermission } from '@/lib/renewal-reminders';
import { parseTaxRate, priceFieldLabel, taxOn, taxRateInputText, withTax, type Tax } from '@/lib/tax';
import { useDefaultTax } from '@/lib/tax-setting';

const REMINDER_OPTIONS = [-1, 0, 1, 3, 7] as const;
type ReminderOption = (typeof REMINDER_OPTIONS)[number];

const DEFAULT_REMINDER_DAYS = 3;

/** How late a charge can land, in days: for ones billed around a day rather than on it. */
const CHARGE_WINDOW_OPTIONS = [0, 3, 7, 14];

/** How many days ahead it renews: for ones charged before the cycle they pay for begins, like domains. */
const RENEWS_EARLY_OPTIONS = [0, 7, 14, 30, 60];

/** Renewing early is offered from cycles this many days ahead fit in (two months and up), or once it's been set. */
const RENEWS_EARLY_SHOWN_FROM = 30;

/** `standard` that are at most `max`, plus one already saved that isn't among them, in order. */
function dayOptions(standard: number[], saved: number, max: number) {
  const options = saved > 0 && !standard.includes(saved) ? [...standard, saved] : standard;
  return options.filter((days) => days <= max).sort((a, b) => a - b);
}

/** The choices that fit `cycle` (a window can't be as long as the gap between charges), keeping one already saved. */
function chargeWindowOptions(cycle: Cycle | null, saved: number, renewsEarlyDays: number) {
  return dayOptions(CHARGE_WINDOW_OPTIONS, saved, cycle ? maxChargeWindowDays(cycle, renewsEarlyDays) : 0);
}

function chargeWindowLabel(days: number) {
  return days === 0 ? 'On the day' : `Up to ${formatChargeWindow(days)} late`;
}

function renewsEarlyLabel(days: number) {
  if (days === 0) return 'On the day';
  const text = formatRenewsEarly(days);
  return text[0].toUpperCase() + text.slice(1);
}

/** What the tax comes to on `price`, or where the rate came from when there's no price to show it on. */
function taxHint(price: number | null, tax: Tax, currency: Currency, regionName: string | null) {
  if (tax.rate === 0) {
    return regionName ? 'None for this one.' : 'Pick your tax region in Settings to fill this in for new subscriptions.';
  }
  if (price === null) return tax.included ? 'The price includes it.' : "It's added on top of the price.";
  const money = (minor: number) => formatMoney(minor, currency);
  return tax.included
    ? `${money(price)} includes ${money(taxOn(price, tax))} tax.`
    : `${money(price)} + ${money(taxOn(price, tax))} tax: ${money(withTax(price, tax))} charged.`;
}

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
  // With several billing periods (after a resume or plan change), the form edits the first one's
  // start and the latest one's cycle.
  const existingCycle = existing && lastPeriod(existing).cycle;
  const [cycleCountText, setCycleCountText] = useState(String(existingCycle?.count ?? 1));
  const [cycleUnit, setCycleUnit] = useState<CycleUnit>(existingCycle?.unit ?? 'month');
  const [firstPaymentDate, setFirstPaymentDate] = useState(existing ? firstPaymentOf(existing) : todayKey());
  const [isTrial, setIsTrial] = useState(existing?.isTrial ?? false);
  const [category, setCategory] = useState<Category>(existing?.category ?? 'streaming');
  const [reminder, setReminder] = useState<ReminderOption>(
    existing ? ((existing.reminderDaysBefore ?? -1) as ReminderOption) : DEFAULT_REMINDER_DAYS
  );
  const [chargeWindow, setChargeWindow] = useState(existing?.chargeWindowDays ?? 0);
  const [renewsEarly, setRenewsEarly] = useState(existing?.renewsEarlyDays ?? 0);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [saving, setSaving] = useState(false);
  // New ones start from the Settings region; each keeps its own rate after that.
  const { region, tax: defaultTax } = useDefaultTax();
  const [initialTax] = useState(existing?.tax ?? defaultTax);
  const [taxRateText, setTaxRateText] = useState(initialTax.rate === 0 ? '' : taxRateInputText(initialTax.rate));
  const [taxIncluded, setTaxIncluded] = useState(initialTax.included);

  const price = parseMoney(priceText, currency);
  const taxRate = taxRateText.trim() === '' ? 0 : parseTaxRate(taxRateText);
  const tax: Tax = { rate: taxRate ?? 0, included: taxIncluded };
  // Editing, the price is the current one from the price history.
  const shownPrice = existing ? typedPrice(existing) : price;
  const cycle = parseCycle(cycleCountText, cycleUnit);
  const multiplePeriods = (existing?.periods.length ?? 0) > 1;
  // The first period has to keep at least its first charge before the next one takes over.
  const firstPeriodEnd = multiplePeriods ? existing!.periods[0].end : null;
  const firstPaymentValid = firstPeriodEnd === null || firstPaymentDate < firstPeriodEnd;
  const valid =
    name.trim() !== '' && cycle !== null && firstPaymentValid && taxRate !== null && (existing !== undefined || price !== null);
  const suggestions = existing ? [] : suggestTemplates(name);
  const savedRenewsEarly = existing?.renewsEarlyDays ?? 0;
  const renewsEarlyMax = cycle ? maxRenewsEarlyDays(cycle) : 0;
  const renewsEarlyOptions = dayOptions(RENEWS_EARLY_OPTIONS, savedRenewsEarly, renewsEarlyMax);
  const showRenewsEarly = renewsEarlyOptions.length > 1 && (renewsEarlyMax >= RENEWS_EARLY_SHOWN_FROM || savedRenewsEarly > 0);
  // One left too early for a shorter cycle renews on the day.
  const renewsEarlyDays = showRenewsEarly && renewsEarlyOptions.includes(renewsEarly) ? renewsEarly : 0;
  const windowOptions = chargeWindowOptions(cycle, existing?.chargeWindowDays ?? 0, renewsEarlyDays);
  // A daily plan, or a window left too long by a shorter cycle or an early renewal, charges on the day.
  const chargeWindowDays = windowOptions.includes(chargeWindow) ? chargeWindow : 0;
  // The first two renewals, to show what renewing early means. Only with one plan: after a plan
  // change the renewals follow the later plans.
  const renewals =
    cycle && renewsEarlyDays > 0 && !multiplePeriods
      ? [1, 2].map((n) => formatDateKey(paymentDate({ start: firstPaymentDate, cycle }, n, renewsEarlyDays)))
      : null;

  const applyTemplate = (template: SubscriptionTemplate) => {
    setName(template.name);
    setCategory(template.category);
    setCycleCountText(String(template.cycle.count));
    setCycleUnit(template.cycle.unit);
  };

  const save = async () => {
    if (!valid || !cycle) return;
    setSaving(true);
    const input: SubscriptionInput = {
      name: name.trim(),
      category,
      cycle,
      firstPaymentDate,
      isTrial,
      reminderDaysBefore: reminder === -1 ? null : reminder,
      chargeWindowDays,
      renewsEarlyDays,
      tax,
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
        <Field label={priceFieldLabel(tax, currency)}>
          <TextField value={priceText} onChangeText={setPriceText} placeholder={moneyPlaceholder(currency)} keyboardType={currencyDecimals(currency) === 0 ? 'number-pad' : 'decimal-pad'} />
        </Field>
      )}

      <Field label="Tax (%)">
        <TextField
          value={taxRateText}
          onChangeText={setTaxRateText}
          placeholder="0"
          keyboardType="decimal-pad"
          accessibilityLabel="Tax rate in percent"
        />
        {taxRate === null ? (
          <ThemedText type="small" themeColor="danger">
            Type a rate under 100, like 21 or 8.1.
          </ThemedText>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            {taxHint(shownPrice, tax, currency, region?.name ?? null)}
          </ThemedText>
        )}
      </Field>

      {tax.rate > 0 && (
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <ThemedText type="smallBold">Price includes tax</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Usual for VAT and GST. Turn off where tax is added at checkout, like US and Canadian sales tax.
            </ThemedText>
          </View>
          <Switch
            value={taxIncluded}
            onValueChange={(value) => {
              haptic.select();
              setTaxIncluded(value);
            }}
            trackColor={{ true: theme.tint, false: theme.border }}
            thumbColor={theme.backgroundElement}
            accessibilityLabel="Price includes tax"
          />
        </View>
      )}

      <Field label="Billed every">
        <CycleField
          countText={cycleCountText}
          onCountTextChange={setCycleCountText}
          unit={cycleUnit}
          onUnitChange={setCycleUnit}
        />
        {multiplePeriods && (
          <ThemedText type="small" themeColor="textSecondary">
            The current plan&apos;s. To switch plan from a given day and keep past charges as they were, use
            “Change plan” instead.
          </ThemedText>
        )}
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
        {!firstPaymentValid ? (
          <ThemedText type="small" themeColor="danger">
            Pick a day before {formatDateKey(firstPeriodEnd!)}, when its billing first changed.
          </ThemedText>
        ) : (
          !isTrial &&
          !multiplePeriods && (
            <ThemedText type="small" themeColor="textSecondary">
              {renewsEarlyDays > 0
                ? 'The day you bought it, not a renewal: renewals are counted on from it.'
                : 'Any past charge works: renewals are counted on from it.'}
            </ThemedText>
          )
        )}
      </Field>

      {showRenewsEarly && (
        <Field label="Renews">
          <ChipGroup options={renewsEarlyOptions} value={renewsEarlyDays} onChange={setRenewsEarly} label={renewsEarlyLabel} />
          <ThemedText type="small" themeColor="textSecondary">
            {renewsEarlyDays === 0
              ? 'For ones charged ahead of time, like a domain renewed 30 days before it expires, pick how early.'
              : `Each renewal is charged ${formatChargeWindow(renewsEarlyDays)} before the ${formatCycle(cycle!)} it pays for begins${renewals ? `: ${renewals[0]}, then ${renewals[1]}` : ''}.`}
          </ThemedText>
        </Field>
      )}

      {windowOptions.length > 1 && (
        <Field label="Charged">
          <ChipGroup options={windowOptions} value={chargeWindowDays} onChange={setChargeWindow} label={chargeWindowLabel} />
          <ThemedText type="small" themeColor="textSecondary">
            {chargeWindowDays === 0
              ? 'For ones that charge around a day, not on it (the weekend after, say), pick how late it can be.'
              : `Set ${isTrial ? 'the trial end' : 'the first payment'} to the earliest day it charges. Each charge is shown as due up to ${formatChargeWindow(chargeWindowDays)} after that, and reminders come before the earliest day.`}
          </ThemedText>
        </Field>
      )}

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
