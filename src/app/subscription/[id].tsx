import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { CategoryBadge } from '@/components/category-badge';
import { PageHeader } from '@/components/page-header';
import { PressableScale } from '@/components/pressable-scale';
import { ScrollView } from '@/components/scroll-view';
import { InfoRow, Section } from '@/components/section';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { CATEGORY_INFO } from '@/constants/categories';
import { Spacing } from '@/constants/theme';
import {
  currentPrice,
  deletePriceChange,
  deleteSubscription,
  nextCharge,
  setCancelled,
  statusOf,
  useSubscription,
  type Subscription,
} from '@/db/subscriptions';
import { useTheme } from '@/hooks/use-theme';
import { formatCycle, formatCycleAdverb, monthlyEquivalent, spentBetween } from '@/lib/billing';
import { formatMoney, useCurrency } from '@/lib/currency';
import { formatDateKey, formatShortDate, formatUpcomingDay, todayKey } from '@/lib/dates';

export default function SubscriptionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sub = useSubscription(Number(id));
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.five }]}>
      {sub === null && <ThemedText themeColor="textSecondary">This subscription no longer exists.</ThemedText>}
      {sub && <SubscriptionDetails sub={sub} />}
    </ScrollView>
  );
}

function SubscriptionDetails({ sub }: { sub: Subscription }) {
  const db = useSQLiteContext();
  const currency = useCurrency();
  const today = todayKey();
  const money = (minor: number) => formatMoney(minor, currency);

  const status = statusOf(sub, today);
  const next = nextCharge(sub, today);
  const price = next?.amount ?? currentPrice(sub, today);
  const reminder = sub.reminderDaysBefore;

  const cancel = () =>
    Alert.alert(`Cancel ${sub.name}?`, 'No charges are counted from today on. You can resume it later.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Mark cancelled', style: 'destructive', onPress: () => setCancelled(db, sub.id, today) },
    ]);

  const remove = () =>
    Alert.alert(`Delete ${sub.name}?`, 'Its price history goes too, and it drops out of what you spent. To keep that, mark it cancelled instead.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteSubscription(db, sub.id);
          router.back();
        },
      },
    ]);

  const removePriceChange = (effectiveDate: string, amount: number) =>
    Alert.alert('Remove this price change?', `${money(amount)} from ${formatDateKey(effectiveDate)}`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deletePriceChange(db, sub.id, effectiveDate) },
    ]);

  // Newest first, each with the price before it.
  const history = sub.prices.map((change, i) => ({ ...change, previous: sub.prices[i - 1]?.amount })).reverse();

  return (
    <>
      <View style={styles.hero}>
        <CategoryBadge category={sub.category} size={56} />
        <StatusPill status={status} />
      </View>
      <PageHeader
        title={sub.name}
        eyebrow={CATEGORY_INFO[sub.category].label}
        eyebrowColor="textSecondary"
        subtitle={`${money(price)} per ${formatCycle(sub.cycle)}`}
      />

      <Section title="Billing">
        {next ? (
          <InfoRow
            label={status === 'trial' ? 'Trial ends' : 'Next charge'}
            value={`${formatShortDate(next.date, today)}, ${formatUpcomingDay(next.date, today)}`}
          />
        ) : (
          <InfoRow label="Cancelled" value={formatDateKey(sub.cancelledOn!)} />
        )}
        <InfoRow label="Billed" value={formatCycleAdverb(sub.cycle)} />
        {sub.cycle.unit !== 'month' || sub.cycle.count !== 1 ? (
          <InfoRow label="Per month" value={`≈ ${money(monthlyEquivalent(price, sub.cycle))}`} />
        ) : (
          <InfoRow label="Per year" value={money(price * 12)} />
        )}
        <InfoRow label={sub.isTrial ? 'First charge' : 'First payment'} value={formatDateKey(sub.firstPaymentDate)} />
        <InfoRow
          label="Reminder"
          value={reminder === null ? 'Off' : reminder === 0 ? 'On the day' : `${reminder} ${reminder === 1 ? 'day' : 'days'} before`}
        />
      </Section>

      <Section title="Spent">
        <InfoRow label={`In ${today.slice(0, 4)}`} value={money(spentBetween(sub, `${today.slice(0, 4)}-01-01`, today))} />
        <InfoRow label="All time" value={money(spentBetween(sub, sub.firstPaymentDate, today))} />
      </Section>

      <Section
        title="Price history"
        action={
          <PressableScale
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.push({ pathname: '/subscription/price-change', params: { id: String(sub.id) } })}>
            <ThemedText type="smallBold" themeColor="tint">
              Change price
            </ThemedText>
          </PressableScale>
        }>
        {history.map((change) => (
          <PressableScale
            key={change.effectiveDate}
            disabled={change.previous === undefined}
            accessibilityHint={change.previous === undefined ? undefined : 'Long press to remove'}
            onLongPress={() => removePriceChange(change.effectiveDate, change.amount)}
            style={styles.priceRow}>
            <View style={styles.priceText}>
              <ThemedText type="smallBold" style={styles.tabular}>
                {money(change.amount)}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {change.effectiveDate > today ? 'Upcoming, from' : 'Since'} {formatDateKey(change.effectiveDate)}
              </ThemedText>
            </View>
            {change.previous !== undefined && <PriceDelta from={change.previous} to={change.amount} />}
          </PressableScale>
        ))}
        {history.length > 1 && (
          <ThemedText type="small" themeColor="textSecondary">
            Long press a change to remove it.
          </ThemedText>
        )}
      </Section>

      {sub.notes !== '' && (
        <Section title="Notes">
          <ThemedText>{sub.notes}</ThemedText>
        </Section>
      )}

      <View style={styles.actions}>
        <Button
          title="Edit"
          variant="secondary"
          onPress={() => router.push({ pathname: '/subscription/edit', params: { id: String(sub.id) } })}
        />
        {sub.cancelledOn ? (
          <Button title="Resume" variant="secondary" onPress={() => setCancelled(db, sub.id, null)} />
        ) : (
          <Button title="Mark cancelled" variant="secondary" onPress={cancel} />
        )}
        <Button title="Delete" variant="destructive" onPress={remove} />
      </View>
    </>
  );
}

/** "+30%" in the danger color for a rise, "−10%" in the accent for a drop. */
function PriceDelta({ from, to }: { from: number; to: number }) {
  const theme = useTheme();
  const percent = Math.round(((to - from) / from) * 100);
  const rose = to > from;
  return (
    <ThemedText type="smallBold" style={[styles.tabular, { color: rose ? theme.danger : theme.tint }]}>
      {rose ? '+' : '−'}
      {Math.abs(percent)}%
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.screen,
    paddingTop: Spacing.two,
    gap: Spacing.four,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginBottom: -Spacing.two,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.one,
  },
  priceText: {
    flex: 1,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  actions: {
    gap: Spacing.twoAndHalf,
  },
});
