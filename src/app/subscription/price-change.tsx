import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';

import { Button } from '@/components/button';
import { DateField } from '@/components/date-field';
import { Field, TextField } from '@/components/field';
import { FormScreen } from '@/components/form-screen';
import { PageHeader } from '@/components/page-header';
import { ThemedText } from '@/components/themed-text';
import { addPriceChange, currentPrice, nextCharge, useSubscription, type Subscription } from '@/db/subscriptions';
import { useToday } from '@/hooks/use-today';
import { currencyDecimals, formatMoney, moneyInputText, parseMoney, useCurrency } from '@/lib/currency';
import { addDays, fromDateKey } from '@/lib/dates';
import { haptic } from '@/lib/haptics';

/** Logs a new price for the subscription in `id`, from a chosen day on. */
export default function PriceChangeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sub = useSubscription(Number(id));
  return sub ? <PriceChangeForm sub={sub} /> : null;
}

function PriceChangeForm({ sub }: { sub: Subscription }) {
  const db = useSQLiteContext();
  const currency = useCurrency();
  const today = useToday();
  const price = currentPrice(sub, today);

  const [priceText, setPriceText] = useState(moneyInputText(price, currency));
  // Price changes usually land on the next bill.
  const [effectiveDate, setEffectiveDate] = useState(nextCharge(sub, today)?.date ?? today);
  const [saving, setSaving] = useState(false);

  const amount = parseMoney(priceText, currency);
  const firstDate = sub.prices[0].effectiveDate;
  const valid = amount !== null && effectiveDate > firstDate;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await addPriceChange(db, sub.id, amount, effectiveDate);
      haptic.success();
      router.back();
    } catch (error) {
      console.error(error);
      setSaving(false);
    }
  };

  return (
    <FormScreen>
      <PageHeader title="Change price" subtitle={`${sub.name}, now ${formatMoney(price, currency)}`} />

      <Field label={`New price (${currency})`}>
        <TextField value={priceText} onChangeText={setPriceText} keyboardType={currencyDecimals(currency) === 0 ? 'number-pad' : 'decimal-pad'} selectTextOnFocus autoFocus />
      </Field>

      <Field label="Charged from">
        <DateField value={effectiveDate} onChange={setEffectiveDate} defaultDate={new Date()} minimumDate={fromDateKey(addDays(firstDate, 1))} />
        <ThemedText type="small" themeColor="textSecondary">
          Charges on and after this day use the new price. Pick a past day to correct history, or a future
          one for an announced increase.
        </ThemedText>
      </Field>

      <Button title="Save price" onPress={save} disabled={!valid} loading={saving} />
    </FormScreen>
  );
}
