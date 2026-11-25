import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney, useCurrency } from '@/lib/currency';
import { fromDateKey } from '@/lib/dates';
import type { MonthSpending } from '@/lib/spending';

import { ThemedText } from './themed-text';

const PLOT_HEIGHT = 120;
/** Mark specs: a 4px rounded data end, a 2px surface gap between bars and between stacked parts. */
const BAR_RADIUS = 4;
const GAP = 2;

function monthName(month: string, style: 'long' | 'narrow') {
  return fromDateKey(month).toLocaleDateString(undefined, style === 'long' ? { month: 'long', year: 'numeric' } : { month: 'narrow' });
}

/**
 * What was charged per month, one bar each, this month last with the charges still to come (ones
 * due now that may still land included) stacked on top in a lighter shade. Tapping a bar shows its amounts above the plot; it starts on this month.
 */
export function SpendingChart({ months }: { months: MonthSpending[] }) {
  const theme = useTheme();
  const currency = useCurrency();
  const [selectedIndex, setSelectedIndex] = useState(months.length - 1);
  const selected = months[selectedIndex] ?? months[months.length - 1];
  const max = Math.max(...months.map((m) => m.charged + m.scheduled), 1);
  const hasScheduled = months.some((m) => m.scheduled > 0);
  const money = (minor: number) => formatMoney(minor, currency);
  // Both parts and the gap between them share the plot's height, so the tallest bar fits exactly.
  // Each part is at least BAR_RADIUS tall, taken from the other part so the total doesn't grow.
  const heights = ({ charged, scheduled }: MonthSpending) => {
    const both = charged > 0 && scheduled > 0;
    const total = ((charged + scheduled) / max) * (PLOT_HEIGHT - (both ? GAP : 0));
    if (!both) return { charged: charged > 0 ? Math.max(total, BAR_RADIUS) : 0, scheduled: scheduled > 0 ? Math.max(total, BAR_RADIUS) : 0 };
    const chargedHeight = Math.min(Math.max((total * charged) / (charged + scheduled), BAR_RADIUS), Math.max(total - BAR_RADIUS, BAR_RADIUS));
    return { charged: chargedHeight, scheduled: Math.max(total - chargedHeight, BAR_RADIUS) };
  };

  return (
    <View style={styles.container}>
      <View style={styles.readout} accessibilityLiveRegion="polite">
        <ThemedText type="small" themeColor="textSecondary">
          {monthName(selected.month, 'long')}
        </ThemedText>
        <ThemedText type="smallBold" style={styles.tabular}>
          {money(selected.charged + selected.scheduled)}
          {selected.scheduled > 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              {' '}
              ({money(selected.scheduled)} still to charge)
            </ThemedText>
          )}
        </ThemedText>
      </View>

      <View style={[styles.plot, { borderColor: theme.border }]}>
        {months.map((m, i) => {
          const isSelected = i === selectedIndex;
          const height = heights(m);
          const label = `${monthName(m.month, 'long')}: ${money(m.charged)} charged${m.scheduled > 0 ? `, ${money(m.scheduled)} still to charge` : ''}`;
          return (
            <Pressable
              key={m.month}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: isSelected }}
              onPress={() => setSelectedIndex(i)}
              style={styles.column}>
              {m.scheduled > 0 && (
                <View
                  style={[
                    styles.bar,
                    { height: height.scheduled, backgroundColor: theme.chartScheduled },
                    m.charged > 0 && { marginBottom: GAP },
                    isSelected ? null : styles.dimmed,
                  ]}
                />
              )}
              {m.charged > 0 && (
                <View
                  style={[
                    styles.bar,
                    { height: height.charged, backgroundColor: theme.chartCharged },
                    // Only the topmost part gets the rounded end; a lower part is square under the gap.
                    m.scheduled > 0 && styles.squareTop,
                    isSelected ? null : styles.dimmed,
                  ]}
                />
              )}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.labels} importantForAccessibility="no-hide-descendants">
        {months.map((m, i) => (
          <ThemedText
            key={m.month}
            type="small"
            themeColor={i === selectedIndex ? 'text' : 'textSecondary'}
            style={styles.monthLabel}>
            {monthName(m.month, 'narrow')}
          </ThemedText>
        ))}
      </View>

      {hasScheduled && (
        <View style={styles.legend}>
          <LegendItem color={theme.chartCharged} label="Charged" />
          <LegendItem color={theme.chartScheduled} label="Still to charge" />
        </View>
      )}
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  readout: {
    gap: Spacing.half,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  plot: {
    height: PLOT_HEIGHT,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: GAP,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  column: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  bar: {
    borderTopLeftRadius: BAR_RADIUS,
    borderTopRightRadius: BAR_RADIUS,
  },
  squareTop: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  dimmed: {
    opacity: 0.55,
  },
  labels: {
    flexDirection: 'row',
    gap: GAP,
  },
  monthLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
  },
  legend: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
});
