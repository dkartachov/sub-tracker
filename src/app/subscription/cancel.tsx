import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';

import { Button } from '@/components/button';
import { ChipGroup } from '@/components/chip-group';
import { DateField } from '@/components/date-field';
import { Field } from '@/components/field';
import { FormScreen } from '@/components/form-screen';
import { PageHeader } from '@/components/page-header';
import { ThemedText } from '@/components/themed-text';
import { setCancelled, statusOf, useSubscription, type Subscription } from '@/db/subscriptions';
import { useToday } from '@/hooks/use-today';
import { chargesOn, paidPeriodEnd, priceOn } from '@/lib/billing';
import { formatMoney, useCurrency } from '@/lib/currency';
import { formatDateKey, formatShortDate, type DateKey } from '@/lib/dates';
import { haptic } from '@/lib/haptics';

/** Marks the subscription in `id` cancelled from a chosen day, or changes that day. */
export default function CancelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sub = useSubscription(Number(id));
  return sub ? <CancelForm sub={sub} /> : null;
}

type When = 'today' | 'periodEnd' | 'other';

function CancelForm({ sub }: { sub: Subscription }) {
  const db = useSQLiteContext();
  const currency = useCurrency();
  const today = useToday();

  // The charge it would make next if it weren't cancelled, which is when a paid period runs out.
  // On a charge day that's the one after today's, which has already been paid.
  const periodEnd = paidPeriodEnd(sub, today);
  const isTrial = statusOf({ ...sub, cancelledOn: null }, today) === 'trial';
  // A charge today (a trial's first one included) has most likely gone through already.
  const chargedToday = !isTrial && chargesOn(sub, today);
  const options: When[] = isTrial ? ['today', 'other'] : ['today', 'periodEnd', 'other'];

  const initialWhen = (): When => {
    if (sub.cancelledOn === null) return chargedToday ? 'periodEnd' : 'today';
    if (sub.cancelledOn === today) return 'today';
    if (sub.cancelledOn === periodEnd && options.includes('periodEnd')) return 'periodEnd';
    return 'other';
  };
  const [when, setWhen] = useState<When>(initialWhen);
  const [otherDate, setOtherDate] = useState<DateKey>(sub.cancelledOn ?? today);
  const [saving, setSaving] = useState(false);

  const cancelledOn = when === 'today' ? today : when === 'periodEnd' ? periodEnd : otherDate;
  const label = (option: When) =>
    option === 'today' ? 'Today' : option === 'periodEnd' ? `When paid period ends` : 'Another day';

  const save = async () => {
    setSaving(true);
    try {
      await setCancelled(db, sub.id, cancelledOn);
      haptic.success();
      router.back();
    } catch (error) {
      console.error(error);
      setSaving(false);
    }
  };

  const future = cancelledOn > today;
  const effect = isTrial
    ? cancelledOn <= sub.firstPaymentDate
      ? `The trial won't turn into a paid plan, so the ${formatMoney(priceOn(sub.prices, sub.firstPaymentDate), currency)} first charge won't be counted.`
      : `The trial converts on ${formatShortDate(sub.firstPaymentDate, today)} first, so charges are counted until then.`
    : future
      ? `It keeps running until ${formatDateKey(cancelledOn)}, with no charges counted from that day on.`
      : cancelledOn === today && chargedToday
        ? `Today's ${formatMoney(priceOn(sub.prices, today), currency)} charge won't be counted either. If it's already gone through, pick “When paid period ends” to keep it.`
        : `No charges are counted from ${cancelledOn === today ? 'today' : formatDateKey(cancelledOn)} on. Charges before it stay in what you've spent.`;

  return (
    <FormScreen>
      <PageHeader
        title={sub.cancelledOn ? 'Change cancellation' : `Cancel ${sub.name}`}
        subtitle="From which day is nothing charged? You can resume it later."
      />

      <Field label="Charges stop">
        <ChipGroup options={options} value={when} onChange={setWhen} label={label} />
        {when === 'periodEnd' && (
          <ThemedText type="small" themeColor="textSecondary">
            You keep access until {formatDateKey(periodEnd)}, the day it would have charged next.
          </ThemedText>
        )}
        {when === 'other' && (
          <>
            <DateField value={otherDate} onChange={setOtherDate} defaultDate={new Date()} />
            <ThemedText type="small" themeColor="textSecondary">
              A past day if you cancelled a while ago and are only noting it now.
            </ThemedText>
          </>
        )}
      </Field>

      <ThemedText>{effect}</ThemedText>

      <Button title={sub.cancelledOn ? 'Save' : 'Mark cancelled'} onPress={save} loading={saving} />
    </FormScreen>
  );
}
