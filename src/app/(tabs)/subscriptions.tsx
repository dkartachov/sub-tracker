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
import { Spacing } from '@/constants/theme';
import { useSubscriptions } from '@/db/subscriptions';
import { useToday } from '@/hooks/use-today';
import { formatCycle } from '@/lib/billing';
import { formatMoney, useCurrency } from '@/lib/currency';
import { formatShortDate, formatUpcomingDay, formatUpcomingWindow } from '@/lib/dates';
import {
  arrangeSubscriptions,
  setSubscriptionSort,
  SUBSCRIPTION_SORTS,
  SUBSCRIPTION_SORT_LABELS,
  useSubscriptionSort,
} from '@/lib/subscription-list';

/** Search only shows up once there's enough to search through. */
const SEARCH_FROM = 6;

export default function SubscriptionsScreen() {
  const subs = useSubscriptions();
  const currency = useCurrency();
  const today = useToday();
  const sort = useSubscriptionSort();
  const [query, setQuery] = useState('');

  const add = () => router.push('/subscription/edit');
  const addButton = <IconButton icon={{ ios: 'plus', android: 'add' }} label="Add subscription" onPress={add} />;

  if (subs === undefined) return <Screen title="Subscriptions">{null}</Screen>;

  // The search only applies while its field is there to see and clear it.
  const activeQuery = subs.length >= SEARCH_FROM ? query : '';
  const { running, cancelled } = arrangeSubscriptions(subs, today, sort, activeQuery);
  const money = (amount: number) => formatMoney(amount, currency);

  return (
    <Screen title="Subscriptions" headerAction={addButton}>
      {subs.length === 0 && (
        <Card style={styles.empty}>
          <ThemedText themeColor="textSecondary">You&apos;re not tracking any subscriptions yet.</ThemedText>
          <Button title="Add your first" onPress={add} />
        </Card>
      )}

      {subs.length >= SEARCH_FROM && (
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder="Search names, notes, categories"
          accessibilityLabel="Search subscriptions"
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
          label={(s) => SUBSCRIPTION_SORT_LABELS[s]}
        />
      )}

      {subs.length > 0 && running.length === 0 && cancelled.length === 0 && (
        <ThemedText themeColor="textSecondary">Nothing matches “{activeQuery.trim()}”.</ThemedText>
      )}

      {running.length > 0 && (
        <Section title={`Running · ${running.length}`}>
          {running.map(({ sub, next, ends, price, cycle }) => (
            <SubscriptionRow
              key={sub.id}
              sub={sub}
              today={today}
              detail={
                next
                  ? `${next.isTrialEnd ? `Trial ends ${formatUpcomingDay(next.date, today)}` : `Renews ${formatUpcomingWindow(next.date, next.latest, today)}`}${ends ? `, ends ${formatShortDate(ends, today)}` : ''}`
                  : ends
                    ? `Ends ${formatUpcomingDay(ends, today)}, no more charges`
                    : ''
              }
              amount={money(price)}
              amountDetail={`per ${formatCycle(cycle)}`}
            />
          ))}
        </Section>
      )}

      {cancelled.length > 0 && (
        <Section title={`Cancelled · ${cancelled.length}`}>
          {cancelled.map(({ sub, next, stopped, price, cycle }) => (
            <SubscriptionRow
              key={sub.id}
              sub={sub}
              today={today}
              detail={
                next
                  ? `Cancelled, resumes ${formatUpcomingWindow(next.date, next.latest, today)}`
                  : `Cancelled ${formatShortDate(stopped!, today)}`
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
