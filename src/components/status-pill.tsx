import { StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import type { SubscriptionStatus } from '@/db/subscriptions';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

/** "Trial" or "Cancelled"; active subscriptions show nothing. */
export function StatusPill({ status }: { status: SubscriptionStatus }) {
  const theme = useTheme();
  if (status === 'active') return null;
  const isTrial = status === 'trial';

  return (
    <View style={[styles.pill, { backgroundColor: isTrial ? theme.trialSoft : theme.backgroundSelected }]}>
      <ThemedText type="eyebrow" themeColor={isTrial ? 'trial' : 'textSecondary'} style={styles.text}>
        {isTrial ? 'Trial' : 'Cancelled'}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 10,
    lineHeight: 14,
  },
});
