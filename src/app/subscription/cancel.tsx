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
import { chargedOn, chargesOn, finalEnd, firstPaymentDate, lastPeriod, paidPeriodEnd, withoutFinalEnd } from '@/lib/billing';
import { formatMoney, useCurrency } from '@/lib/currency';
import { addDays, formatDateKey, formatShortDate, fromDateKey, type DateKey } from '@/lib/dates';
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
  const cancelledOn = finalEnd(sub);
  const firstPayment = firstPaymentDate(sub);
  const isTrial = statusOf(withoutFinalEnd(sub), today) === 'trial';
  // After a resume or plan change, the cancellation ends the latest period, so it has to come after
  // that period's first charge. The first period can be called off before it charges (a trial).
  const earliest = sub.periods.length > 1 ? addDays(lastPeriod(sub).start, 1) : null;
  // A charge today (a trial's first one included) has most likely gone through already.
  const chargedToday = !isTrial && chargesOn(sub, today);
  const options: When[] = isTrial ? ['today', 'other'] : ['today', 'periodEnd', 'other'];

  const initialWhen = (): When => {
    if (cancelledOn === null) return chargedToday ? 'periodEnd' : 'today';
    if (cancelledOn === today) return 'today';
    if (cancelledOn === periodEnd && options.includes('periodEnd')) return 'periodEnd';
    return 'other';
  };
  const [when, setWhen] = useState<When>(initialWhen);
  const [otherDate, setOtherDate] = useState<DateKey>(cancelledOn ?? today);
  const [saving, setSaving] = useState(false);

  const chosen = when === 'today' ? today : when === 'periodEnd' ? periodEnd : otherDate;
  const valid = earliest === null || chosen >= earliest;
  const label = (option: When) =>
    option === 'today' ? 'Today' : option === 'periodEnd' ? `When paid period ends` : 'Another day';

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await setCancelled(db, sub.id, chosen);
      haptic.success();
      router.back();
    } catch (error) {
      console.error(error);
      setSaving(false);
    }
  };

  const future = chosen > today;
  const effect = !valid
    ? `Pick a day after ${formatDateKey(lastPeriod(sub).start)}, when it last started charging.`
    : isTrial
      ? chosen <= firstPayment
        ? `The trial won't turn into a paid plan, so the ${formatMoney(chargedOn(sub, firstPayment), currency)} first charge won't be counted.`
        : `The trial converts on ${formatShortDate(firstPayment, today)} first, so charges are counted until then.`
      : future
        ? `It keeps running until ${formatDateKey(chosen)}, with no charges counted from that day on.`
        : chosen === today && chargedToday
          ? `Today's ${formatMoney(chargedOn(sub, today), currency)} charge won't be counted either. If it's already gone through, pick “When paid period ends” to keep it.`
          : `No charges are counted from ${chosen === today ? 'today' : formatDateKey(chosen)} on. Charges before it stay in what you've spent.`;

  return (
    <FormScreen>
      <PageHeader
        title={cancelledOn ? 'Change cancellation' : `Cancel ${sub.name}`}
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
            <DateField
              value={otherDate}
              onChange={setOtherDate}
              defaultDate={new Date()}
              minimumDate={earliest ? fromDateKey(earliest) : undefined}
            />
            <ThemedText type="small" themeColor="textSecondary">
              A past day if you cancelled a while ago and are only noting it now.
            </ThemedText>
          </>
        )}
      </Field>

      <ThemedText>{effect}</ThemedText>

      <Button title={cancelledOn ? 'Save' : 'Mark cancelled'} onPress={save} disabled={!valid} loading={saving} />
    </FormScreen>
  );
}
