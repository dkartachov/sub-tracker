import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';

import { Chip } from './chip';

type ChipGroupProps<T extends string | number> = {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  label: (option: T) => string;
};

/** Pick one of a few options, as a wrapping row of chips. */
export function ChipGroup<T extends string | number>({ options, value, onChange, label }: ChipGroupProps<T>) {
  return (
    <View accessibilityRole="radiogroup" style={styles.group}>
      {options.map((option) => (
        <Chip key={String(option)} label={label(option)} selected={option === value} onPress={() => onChange(option)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
