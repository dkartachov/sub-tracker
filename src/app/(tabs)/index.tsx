import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { InfoRow, Section } from '@/components/section';
import { SubscriptionRow } from '@/components/subscription-row';
import { ThemedText } from '@/components/themed-text';
import { CATEGORY_INFO } from '@/constants/categories';
import { Radius, Spacing } from '@/constants/theme';
import { useSubscriptions } from '@/db/subscriptions';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney, useCurrency } from '@/lib/currency';
import { formatShortDate, formatUpcomingDay, todayKey } from '@/lib/dates';
import { getOverview, UPCOMING_DAYS } from '@/lib/spending';

/** Upcoming charges beyond this many are left to the Subscriptions tab. */
const UPCOMING_SHOWN = 6;

export default function OverviewScreen() {
  const subs = useSubscriptions();
  const currency = useCurrency();
  const today = todayKey();

  if (subs === undefined) return <Screen title="Overview">{null}</Screen>;

  if (subs.length === 0) {
    return (
      <Screen title="Overview" subtitle="Your subscriptions at a glance.">
        <Card style={styles.empty}>
          <ThemedText type="subtitle">Nothing tracked yet</ThemedText>
          <ThemedText themeColor="textSecondary">
            Add Netflix, your gym or anything else you pay for regularly, and see what it all costs here.
          </ThemedText>
          <Button title="Add a subscription" onPress={() => router.push('/subscription/edit')} />
        </Card>
      </Screen>
    );
  }

  const overview = getOverview(subs, today);
  const money = (minor: number) => formatMoney(minor, currency);
  const biggestCategory = overview.byCategory[0]?.monthly ?? 0;

  return (
    <Screen
      title="Overview"
      eyebrow={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}>
      <Card style={styles.totals}>
        <ThemedText type="eyebrow" themeColor="textSecondary">
          Per month
        </ThemedText>
        <ThemedText type="stat" style={styles.bigStat}>
          {money(overview.monthly)}
        </ThemedText>
        <ThemedText themeColor="textSecondary">
          {money(overview.yearly)} a year · {overview.activeCount} active
          {overview.trialCount > 0 && ` · ${overview.trialCount} on trial`}
        </ThemedText>
      </Card>

      {overview.trialsEnding.length > 0 && (
        <Section title="Trials ending soon">
          {overview.trialsEnding.map(({ sub, date, amount }) => (
            <SubscriptionRow
              key={sub.id}
              sub={sub}
              detail={`Converts ${formatUpcomingDay(date, today)}`}
              amount={money(amount)}
              amountDetail="then"
            />
          ))}
        </Section>
      )}

      <Section title={`Next ${UPCOMING_DAYS} days`}>
        {overview.upcoming.length === 0 ? (
          <ThemedText themeColor="textSecondary">No charges coming up.</ThemedText>
        ) : (
          <>
            {overview.upcoming.slice(0, UPCOMING_SHOWN).map(({ sub, date, amount }) => (
              <SubscriptionRow
                key={`${sub.id}-${date}`}
                sub={sub}
                detail={`${capitalize(formatUpcomingDay(date, today))} · ${formatShortDate(date, today)}`}
                amount={money(amount)}
              />
            ))}
            <InfoRow
              label={`Total, ${overview.upcoming.length} ${overview.upcoming.length === 1 ? 'charge' : 'charges'}`}
              value={money(overview.upcoming.reduce((sum, c) => sum + c.amount, 0))}
            />
          </>
        )}
      </Section>

      {overview.byCategory.length > 0 && (
        <Section title="By category, per month">
          {overview.byCategory.map(({ category, monthly }) => (
            <CategoryBar
              key={category}
              label={CATEGORY_INFO[category].label}
              color={CATEGORY_INFO[category].color}
              amount={money(monthly)}
              fraction={monthly / biggestCategory}
            />
          ))}
        </Section>
      )}

      <Section title={`Spent in ${today.slice(0, 4)}`}>
        <ThemedText type="stat">{money(overview.spentThisYear)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Charged since January 1, including subscriptions you&apos;ve since cancelled.
        </ThemedText>
      </Section>
    </Screen>
  );
}

function CategoryBar({ label, color, amount, fraction }: { label: string; color: string; amount: string; fraction: number }) {
  const theme = useTheme();
  return (
    <View style={styles.categoryRow}>
      <View style={styles.categoryLabels}>
        <ThemedText type="small">{label}</ThemedText>
        <ThemedText type="smallBold" style={styles.tabular}>
          {amount}
        </ThemedText>
      </View>
      <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
        <View style={[styles.fill, { backgroundColor: color, width: `${Math.max(fraction * 100, 2)}%` }]} />
      </View>
    </View>
  );
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const styles = StyleSheet.create({
  empty: {
    gap: Spacing.three,
    padding: Spacing.four,
  },
  totals: {
    padding: Spacing.four,
    gap: Spacing.one,
  },
  bigStat: {
    fontSize: 44,
    lineHeight: 52,
  },
  categoryRow: {
    gap: Spacing.one,
    paddingVertical: Spacing.one,
  },
  categoryLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 8,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Radius.full,
  },
});
