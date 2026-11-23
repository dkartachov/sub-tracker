import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { statusOf, type Subscription } from '@/db/subscriptions';
import type { DateKey } from '@/lib/dates';

import { CategoryBadge } from './category-badge';
import { PressableScale } from './pressable-scale';
import { StatusPill } from './status-pill';
import { ThemedText } from './themed-text';

type SubscriptionRowProps = {
  sub: Subscription;
  /** From `useToday`, so the status moves on at midnight. */
  today: DateKey;
  /** Under the name, e.g. when it next charges. */
  detail: string;
  /** On the right, e.g. the price. */
  amount: string;
  amountDetail?: string;
};

/** A subscription in a list, opening its details. */
export function SubscriptionRow({ sub, today, detail, amount, amountDetail }: SubscriptionRowProps) {
  const status = statusOf(sub, today);

  return (
    <PressableScale
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/subscription/[id]', params: { id: String(sub.id) } })}
      style={[styles.row, status === 'cancelled' && styles.dimmed]}>
      <CategoryBadge category={sub.category} />
      <View style={styles.text}>
        <View style={styles.nameLine}>
          <ThemedText type="smallBold" numberOfLines={1} style={styles.name}>
            {sub.name}
          </ThemedText>
          <StatusPill status={status} />
        </View>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {detail}
        </ThemedText>
      </View>
      <View style={styles.amount}>
        <ThemedText type="smallBold" style={styles.tabular}>
          {amount}
        </ThemedText>
        {amountDetail && (
          <ThemedText type="small" themeColor="textSecondary">
            {amountDetail}
          </ThemedText>
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.twoAndHalf,
    paddingVertical: Spacing.two,
  },
  dimmed: {
    opacity: 0.6,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  name: {
    flexShrink: 1,
  },
  amount: {
    alignItems: 'flex-end',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
