import { StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { KIND_WORDS, type Kind } from '@/constants/categories';
import type { SubscriptionStatus } from '@/db/subscriptions';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

/** "Due now", for a charge that may land any day now (today is inside its range). */
export function DueNowPill() {
  const theme = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: theme.tintSoft }]}>
      <ThemedText type="eyebrow" themeColor="tint" style={styles.text}>
        Due now
      </ThemedText>
    </View>
  );
}

/** "Trial", or "Cancelled" ("Ended" for a bill); active ones show nothing. */
export function StatusPill({ status, kind = 'subscription' }: { status: SubscriptionStatus; kind?: Kind }) {
  const theme = useTheme();
  if (status === 'active') return null;
  const isTrial = status === 'trial';

  return (
    <View style={[styles.pill, { backgroundColor: isTrial ? theme.trialSoft : theme.backgroundSelected }]}>
      <ThemedText type="eyebrow" themeColor={isTrial ? 'trial' : 'textSecondary'} style={styles.text}>
        {isTrial ? 'Trial' : KIND_WORDS[kind].cancelled}
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
