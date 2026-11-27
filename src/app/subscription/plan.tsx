import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';

import { Button } from '@/components/button';
import { CycleField, parseCycle } from '@/components/cycle-field';
import { DateField } from '@/components/date-field';
import { Field, TextField } from '@/components/field';
import { FormScreen } from '@/components/form-screen';
import { PageHeader } from '@/components/page-header';
import { ThemedText } from '@/components/themed-text';
import { nextCharge, startPeriod, useSubscription, type Subscription } from '@/db/subscriptions';
import { useToday } from '@/hooks/use-today';
import { formatCycle, lastPeriod, newPeriodProblem, paymentDate, priceOn, type CycleUnit } from '@/lib/billing';
import { currencyDecimals, formatMoney, moneyInputText, parseMoney, useCurrency } from '@/lib/currency';
import { addDays, formatDateKey, fromDateKey, type DateKey } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { priceFieldLabel, withTax } from '@/lib/tax';

type Kind = 'resume' | 'change';

/**
 * Resumes the cancelled subscription in `id` from a chosen day (`kind=resume`), or switches it to
 * another billing cycle from one (`kind=change`), optionally at a new price. Either way it charges
 * on that day and every cycle after it, and the charges before stay as they were.
 */
export default function PlanScreen() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind: Kind }>();
  const sub = useSubscription(Number(id));
  return sub ? <PlanForm sub={sub} kind={kind === 'resume' ? 'resume' : 'change'} /> : null;
}

function PlanForm({ sub, kind }: { sub: Subscription; kind: Kind }) {
  const db = useSQLiteContext();
  const currency = useCurrency();
  const today = useToday();
  const last = lastPeriod(sub);

  const initialDate = (): DateKey => {
    if (kind === 'resume') return last.end && last.end > today ? last.end : today;
    // Plans usually switch on the next bill.
    return nextCharge(sub, addDays(last.start, 1) > today ? addDays(last.start, 1) : today)?.date ?? today;
  };
  const [from, setFrom] = useState(initialDate);
  const [countText, setCountText] = useState(String(last.cycle.count));
  const [unit, setUnit] = useState<CycleUnit>(last.cycle.unit);
  const [priceText, setPriceText] = useState(() => moneyInputText(priceOn(sub.prices, from), currency));
  const [saving, setSaving] = useState(false);

  const cycle = parseCycle(countText, unit);
  const amount = parseMoney(priceText, currency);
  const problem = newPeriodProblem(sub, kind, from);
  const unchanged = kind === 'change' && cycle?.count === last.cycle.count && cycle?.unit === last.cycle.unit;
  const valid = cycle !== null && amount !== null && problem === null && !unchanged;

  const minimumDate = kind === 'resume' ? last.end! : addDays(last.start, 1);
  const maximumDate = kind === 'change' && last.end ? addDays(last.end, -1) : undefined;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      // Only recorded as a price change if it differs from the price already in effect then.
      await startPeriod(db, sub.id, kind, from, cycle, amount === priceOn(sub.prices, from) ? null : amount);
      haptic.success();
      router.back();
    } catch (error) {
      console.error(error);
      setSaving(false);
    }
  };

  // One that renews early charges its first renewal ahead of a cycle after the switch.
  const firstRenewal = cycle && sub.renewsEarlyDays > 0 ? paymentDate({ start: from, cycle }, 1, sub.renewsEarlyDays) : null;
  const summary =
    cycle && amount !== null
      ? `${formatMoney(withTax(amount, sub.tax), currency)} on ${formatDateKey(from)}, then ${
          firstRenewal ? `renewing on ${formatDateKey(firstRenewal)} and every ${formatCycle(cycle)} after` : `every ${formatCycle(cycle)}`
        }.`
      : '';

  return (
    <FormScreen>
      <PageHeader
        title={kind === 'resume' ? `${sub.kind === 'bill' ? 'Restart' : 'Resume'} ${sub.name}` : 'Change plan'}
        subtitle={
          kind === 'resume'
            ? `${sub.kind === 'bill' ? 'Ended' : 'Cancelled'} since ${formatDateKey(last.end!)}. Nothing is counted for the time in between.`
            : `${sub.name}, now every ${formatCycle(last.cycle)}. Charges before the switch keep the old plan.`
        }
      />

      <Field label={kind === 'resume' ? (sub.kind === 'bill' ? 'First payment again on' : 'First charge again on') : 'New plan from'}>
        <DateField
          value={from}
          onChange={(date) => {
            setFrom(date);
            setPriceText(moneyInputText(priceOn(sub.prices, date), currency));
          }}
          defaultDate={new Date()}
          minimumDate={fromDateKey(minimumDate)}
          maximumDate={maximumDate ? fromDateKey(maximumDate) : undefined}
        />
        {problem && (
          <ThemedText type="small" themeColor="danger">
            {problem}
          </ThemedText>
        )}
      </Field>

      <Field label="Billed every">
        <CycleField countText={countText} onCountTextChange={setCountText} unit={unit} onUnitChange={setUnit} />
        {unchanged && (
          <ThemedText type="small" themeColor="textSecondary">
            That&apos;s the current plan. For a new price alone, use “Change price”.
          </ThemedText>
        )}
      </Field>

      <Field label={priceFieldLabel(sub.tax, currency)}>
        <TextField
          value={priceText}
          onChangeText={setPriceText}
          keyboardType={currencyDecimals(currency) === 0 ? 'number-pad' : 'decimal-pad'}
          selectTextOnFocus
        />
      </Field>

      {valid && <ThemedText>{summary}</ThemedText>}

      <Button title={kind === 'resume' ? (sub.kind === 'bill' ? 'Restart' : 'Resume') : 'Change plan'} onPress={save} disabled={!valid} loading={saving} />
    </FormScreen>
  );
}
