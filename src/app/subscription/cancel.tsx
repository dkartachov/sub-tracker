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
import {
  chargedOn,
  chargesOn,
  finalEnd,
  firstPaymentDate,
  lastPeriod,
  paidPeriodEnd,
  paymentsLeft,
  renewedCycleStart,
  withoutFinalEnd,
} from '@/lib/billing';
import { formatMoney, useCurrency } from '@/lib/currency';
import { addDays, formatDateKey, formatShortDate, fromDateKey, type DateKey } from '@/lib/dates';
import { haptic } from '@/lib/haptics';

/** Marks the subscription in `id` cancelled from a chosen day, or a bill ended, or changes that day. */
export default function CancelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sub = useSubscription(Number(id));
  return sub ? (sub.kind === 'bill' ? <EndBillForm sub={sub} /> : <CancelForm sub={sub} />) : null;
}

type When = 'today' | 'periodEnd' | 'other';

function CancelForm({ sub }: { sub: Subscription }) {
  const db = useSQLiteContext();
  const currency = useCurrency();
  const today = useToday();

  // The charge it would make next if it weren't cancelled, which is when a paid period runs out.
  // On a charge day that's the one after today's, which has already been paid.
  const periodEnd = paidPeriodEnd(sub, today);
  // For one that renews early, that charge comes before what's paid for runs out (a domain's expiry).
  const runsOut = renewedCycleStart(withoutFinalEnd(sub), periodEnd);
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
            {runsOut === periodEnd
              ? `You keep access until ${formatDateKey(periodEnd)}, the day it would have charged next.`
              : `It won't renew on ${formatDateKey(periodEnd)}, and you keep it until ${formatDateKey(runsOut)}, when what you paid for runs out.`}
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

type BillEnd = 'last' | 'now';

/**
 * When a bill ends: after its last payment (a mortgage paid off, a lease's last month), or with no
 * more payments from today (switched internet provider). Stored like a cancellation, on the day
 * after the last payment.
 */
function EndBillForm({ sub }: { sub: Subscription }) {
  const db = useSQLiteContext();
  const currency = useCurrency();
  const today = useToday();

  const endedOn = finalEnd(sub);
  const running = withoutFinalEnd(sub);
  // After a resume or plan change, the end has to come after that period's first payment.
  const earliestEnd = sub.periods.length > 1 ? addDays(lastPeriod(sub).start, 1) : null;
  const [when, setWhen] = useState<BillEnd>(endedOn === today ? 'now' : 'last');
  // The last payment is the day before it ends. A new end starts from the next payment.
  const [lastPayment, setLastPayment] = useState<DateKey>(endedOn ? addDays(endedOn, -1) : paidPeriodEnd(sub, today));
  const [saving, setSaving] = useState(false);

  const chosen = when === 'now' ? today : addDays(lastPayment, 1);
  const valid = earliestEnd === null || chosen >= earliestEnd;
  const left = paymentsLeft(running, today, chosen);
  const paidToday = chargesOn(sub, today);

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

  const effect = !valid
    ? `Pick a day on or after ${formatDateKey(lastPeriod(sub).start)}, when it last started.`
    : when === 'now'
      ? paidToday
        ? `Today's ${formatMoney(chargedOn(sub, today), currency)} payment won't be counted either. If it's been paid, pick “After a last payment” and today's date.`
        : `No payments are counted from today on. Payments before it stay in what you've spent.`
      : left.length === 0
        ? `No payments are counted after ${formatDateKey(lastPayment)}. Payments before it stay in what you've spent.`
        : `${left.length === 1 ? 'One payment is' : `${left.length} payments are`} left, the last on ${formatDateKey(left[left.length - 1])}. None are counted after it.`;

  return (
    <FormScreen>
      <PageHeader
        title={endedOn ? 'Change end date' : `End ${sub.name}`}
        subtitle="A mortgage or loan paid off, a lease that ends, a provider you've left. You can restart it later."
      />

      <Field label="Payments stop">
        <ChipGroup
          options={['last', 'now'] as const}
          value={when}
          onChange={setWhen}
          label={(option) => (option === 'last' ? 'After a last payment' : 'From today')}
        />
        {when === 'last' && (
          <Field label="Last payment">
            <DateField
              value={lastPayment}
              onChange={setLastPayment}
              defaultDate={fromDateKey(lastPayment)}
              minimumDate={earliestEnd ? fromDateKey(addDays(earliestEnd, -1)) : undefined}
            />
          </Field>
        )}
      </Field>

      <ThemedText>{effect}</ThemedText>

      <Button title={endedOn ? 'Save' : 'Set end date'} onPress={save} disabled={!valid} loading={saving} />
    </FormScreen>
  );
}
