import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ChipGroup } from '@/components/chip-group';
import { TextField } from '@/components/field';
import { IconButton } from '@/components/icon-button';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { SubscriptionRow } from '@/components/subscription-row';
import { ThemedText } from '@/components/themed-text';
import { KIND_WORDS, type Kind } from '@/constants/categories';
import { Spacing } from '@/constants/theme';
import { useSubscriptions } from '@/db/subscriptions';
import { useToday } from '@/hooks/use-today';
import { formatCycle } from '@/lib/billing';
import { formatMoney, useCurrency } from '@/lib/currency';
import { formatShortDate, formatUpcomingDay, formatUpcomingWindow } from '@/lib/dates';
import {
  arrangeSubscriptions,
  ofKind,
  setSubscriptionSort,
  SUBSCRIPTION_SORTS,
  SUBSCRIPTION_SORT_LABELS,
  useSubscriptionSort,
} from '@/lib/subscription-list';

/** Search only shows up once there's enough to search through. */
const SEARCH_FROM = 6;

const EMPTY_TEXT: Record<Kind, string> = {
  subscription: "You're not tracking any subscriptions yet.",
  bill: 'Add your mortgage or rent, insurance, internet and other bills. They have their own totals, apart from your subscriptions.',
};

/** The Subscriptions tab, or the Bills tab: the running ones of that kind, then the cancelled or ended ones. */
export function KindListScreen({ kind }: { kind: Kind }) {
  const all = useSubscriptions();
  const currency = useCurrency();
  const today = useToday();
  const sort = useSubscriptionSort();
  const [query, setQuery] = useState('');
  const words = KIND_WORDS[kind];
  const isBill = kind === 'bill';

  const add = () => router.push({ pathname: '/subscription/edit', params: { kind } });
  const addButton = <IconButton icon={{ ios: 'plus', android: 'add' }} label={`Add ${words.one}`} onPress={add} />;

  if (all === undefined) return <Screen title={words.many}>{null}</Screen>;

  const subs = ofKind(all, kind);
  // The search only applies while its field is there to see and clear it.
  const activeQuery = subs.length >= SEARCH_FROM ? query : '';
  const { running, cancelled } = arrangeSubscriptions(subs, today, sort, activeQuery);
  const money = (amount: number) => formatMoney(amount, currency);

  return (
    <Screen title={words.many} headerAction={addButton}>
      {subs.length === 0 && (
        <Card style={styles.empty}>
          <ThemedText themeColor="textSecondary">{EMPTY_TEXT[kind]}</ThemedText>
          <Button title={isBill ? 'Add your first bill' : 'Add your first'} onPress={add} />
        </Card>
      )}

      {subs.length >= SEARCH_FROM && (
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder="Search names, notes, categories"
          accessibilityLabel={`Search ${words.many.toLowerCase()}`}
          returnKeyType="search"
          clearButtonMode="while-editing"
          autoCorrect={false}
        />
      )}
      {subs.length > 1 && (
        <ChipGroup
          options={SUBSCRIPTION_SORTS}
          value={sort}
          onChange={setSubscriptionSort}
          label={(s) => (s === 'next' ? words.next : SUBSCRIPTION_SORT_LABELS[s])}
        />
      )}

      {subs.length > 0 && running.length === 0 && cancelled.length === 0 && (
        <ThemedText themeColor="textSecondary">Nothing matches “{activeQuery.trim()}”.</ThemedText>
      )}

      {running.length > 0 && (
        <Section title={`${isBill ? 'Current' : 'Running'} · ${running.length}`}>
          {running.map(({ sub, next, ends, price, cycle }) => (
            <SubscriptionRow
              key={sub.id}
              sub={sub}
              today={today}
              detail={
                next
                  ? `${next.isTrialEnd ? `Trial ends ${formatUpcomingDay(next.date, today)}` : `${isBill ? 'Due' : 'Renews'} ${formatUpcomingWindow(next.date, next.latest, today)}`}${ends ? `, ends ${formatShortDate(ends, today)}` : ''}`
                  : ends
                    ? `Ends ${formatUpcomingDay(ends, today)}, no more ${isBill ? 'payments' : 'charges'}`
                    : ''
              }
              amount={money(price)}
              amountDetail={`per ${formatCycle(cycle)}`}
            />
          ))}
        </Section>
      )}

      {cancelled.length > 0 && (
        <Section title={`${words.cancelled} · ${cancelled.length}`}>
          {cancelled.map(({ sub, next, stopped, price, cycle }) => (
            <SubscriptionRow
              key={sub.id}
              sub={sub}
              today={today}
              detail={
                next
                  ? `${words.cancelled}, resumes ${formatUpcomingWindow(next.date, next.latest, today)}`
                  : `${words.cancelled} ${formatShortDate(stopped!, today)}`
              }
              amount={money(price)}
              amountDetail={`per ${formatCycle(cycle)}`}
            />
          ))}
        </Section>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: {
    gap: Spacing.three,
    padding: Spacing.four,
  },
});
