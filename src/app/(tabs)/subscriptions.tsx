import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { IconButton } from '@/components/icon-button';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { SubscriptionRow } from '@/components/subscription-row';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { currentPrice, nextCharge, statusOf, useSubscriptions, type Subscription } from '@/db/subscriptions';
import { formatCycle } from '@/lib/billing';
import { formatMoney, useCurrency } from '@/lib/currency';
import { formatShortDate, formatUpcomingDay, todayKey } from '@/lib/dates';

export default function SubscriptionsScreen() {
  const subs = useSubscriptions();
  const currency = useCurrency();
  const today = todayKey();

  const add = () => router.push('/subscription/edit');
  const addButton = <IconButton icon={{ ios: 'plus', android: 'add' }} label="Add subscription" onPress={add} />;

  if (subs === undefined) return <Screen title="Subscriptions">{null}</Screen>;

  // Running ones soonest charge first; cancelled ones most recently cancelled first.
  const running = subs
    .filter((sub) => statusOf(sub, today) !== 'cancelled')
    .map((sub) => ({ sub, next: nextCharge(sub, today) }))
    .sort((a, b) => (a.next?.date ?? '').localeCompare(b.next?.date ?? ''));
  const cancelled = subs
    .filter((sub) => statusOf(sub, today) === 'cancelled')
    .sort((a, b) => (b.cancelledOn ?? '').localeCompare(a.cancelledOn ?? ''));

  const price = (sub: Subscription, amount: number) => ({
    amount: formatMoney(amount, currency),
    amountDetail: `per ${formatCycle(sub.cycle)}`,
  });

  return (
    <Screen title="Subscriptions" headerAction={addButton}>
      {subs.length === 0 && (
        <Card style={styles.empty}>
          <ThemedText themeColor="textSecondary">You&apos;re not tracking any subscriptions yet.</ThemedText>
          <Button title="Add your first" onPress={add} />
        </Card>
      )}

      {running.length > 0 && (
        <Section title={`Running · ${running.length}`}>
          {running.map(({ sub, next }) => (
            <SubscriptionRow
              key={sub.id}
              sub={sub}
              detail={
                next
                  ? `${statusOf(sub, today) === 'trial' ? 'Trial ends' : 'Renews'} ${formatUpcomingDay(next.date, today)}`
                  : ''
              }
              {...price(sub, next?.amount ?? currentPrice(sub, today))}
            />
          ))}
        </Section>
      )}

      {cancelled.length > 0 && (
        <Section title={`Cancelled · ${cancelled.length}`}>
          {cancelled.map((sub) => (
            <SubscriptionRow
              key={sub.id}
              sub={sub}
              detail={`Cancelled ${formatShortDate(sub.cancelledOn!, today)}`}
              {...price(sub, currentPrice(sub, today))}
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
