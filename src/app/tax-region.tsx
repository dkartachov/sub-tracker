import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useRef } from 'react';
import { StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { PageHeader } from '@/components/page-header';
import { PressableScale } from '@/components/pressable-scale';
import { ScrollView } from '@/components/scroll-view';
import { offerToApplyTax } from '@/components/tax-default-change';
import { ThemedText } from '@/components/themed-text';
import { TAX_RATES_CHECKED, TAX_REGIONS, taxRegion, type TaxRegion } from '@/constants/tax-regions';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';
import { formatTaxRate } from '@/lib/tax';
import { getDefaultTax, taxRegionSetting, useTaxRegion } from '@/lib/tax-setting';

/** Null is "No tax". */
const OPTIONS: (TaxRegion | null)[] = [null, ...TAX_REGIONS];

/** How much of the row above stays in view when the list opens scrolled to the selected one. */
const SCROLL_CONTEXT = 96;

function describe(region: TaxRegion | null) {
  if (!region) return 'Prices are what you type.';
  const rate = region.rate === null ? 'You type the rate' : formatTaxRate(region.rate);
  return `${rate} ${region.taxName}, ${region.included ? 'included in prices' : 'added on top'}`;
}

/** Picks the tax region in Settings, which fills in the tax of new subscriptions. */
export default function TaxRegionScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const selected = useTaxRegion();
  const scrollView = useRef<ScrollViewInstance>(null);
  const scrolledToSelected = useRef(false);
  /** Where the selected row is in the list, once laid out. */
  const selectedRowY = useRef<number | null>(null);

  const pick = (region: TaxRegion | null) => {
    haptic.select();
    const previous = getDefaultTax();
    taxRegionSetting.set(region?.code ?? '');
    router.back();
    // The dialog lives in the root layout, so it shows over Settings once this screen has gone.
    offerToApplyTax(db, previous, getDefaultTax()).catch(console.warn);
  };

  const current = taxRegion(selected);

  return (
    // A plain scroll view: a few dozen short rows don't need virtualizing, and every row re-renders
    // with the selection.
    <ScrollView
      ref={scrollView}
      accessibilityLabel="Tax regions"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.four }]}>
      <PageHeader
        title="Tax region"
        subtitle={`Fills in the tax on new subscriptions. Standard rates as of ${TAX_RATES_CHECKED}: check yours, and change any subscription's rate in its form.`}
      />
      <ThemedText type="smallBold" themeColor="tint" style={styles.current}>
        {current ? `Selected: ${current.name}` : 'No region selected'}
      </ThemedText>
      <View
        accessibilityRole="radiogroup"
        style={styles.list}
        onLayout={({ nativeEvent: { layout } }) => {
          // Opens on the current choice, which can be far down the list. Rows are laid out before
          // the list around them, so the selected one's place in it is known by now.
          if (scrolledToSelected.current || selectedRowY.current === null) return;
          scrolledToSelected.current = true;
          const y = layout.y + selectedRowY.current - SCROLL_CONTEXT;
          if (y > 0) scrollView.current?.scrollTo({ y, animated: false });
        }}>
        {OPTIONS.map((item) => {
          const isSelected = (item?.code ?? '') === selected;
          return (
            <PressableScale
              key={item?.code ?? 'none'}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              onPress={() => pick(item)}
              onLayout={({ nativeEvent: { layout } }) => {
                if (isSelected) selectedRowY.current = layout.y;
              }}
              style={[
                styles.row,
                isSelected
                  ? { backgroundColor: theme.tintSoft, borderColor: theme.tint }
                  : { backgroundColor: 'transparent', borderColor: 'transparent' },
              ]}>
              <View style={styles.rowText}>
                <ThemedText type="smallBold" themeColor={isSelected ? 'tint' : 'text'}>
                  {item?.name ?? 'No tax'}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {describe(item)}
                </ThemedText>
              </View>
              <View
                style={[
                  styles.radio,
                  isSelected ? { backgroundColor: theme.tint, borderColor: theme.tint } : { borderColor: theme.border },
                ]}>
                {isSelected && <Icon name={{ ios: 'checkmark', android: 'check' }} color="onTint" size={16} />}
              </View>
            </PressableScale>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.screen,
    paddingTop: Spacing.three,
  },
  current: {
    marginTop: Spacing.three,
    marginBottom: Spacing.two,
  },
  list: {
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    borderWidth: 1.5,
  },
  rowText: {
    flex: 1,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
