import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { CYCLE_UNITS, type Cycle, type CycleUnit } from '@/lib/billing';

import { ChipGroup } from './chip-group';
import { TextField } from './field';

/** The typed count of a cycle as a valid cycle, or null while it isn't a whole number from 1 to 99. */
export function parseCycle(countText: string, unit: CycleUnit): Cycle | null {
  const count = Number(countText);
  return Number.isInteger(count) && count >= 1 && count <= 99 ? { count, unit } : null;
}

type CycleFieldProps = {
  countText: string;
  onCountTextChange: (text: string) => void;
  unit: CycleUnit;
  onUnitChange: (unit: CycleUnit) => void;
};

/** "Every [1] [day | week | month | year]", for the inside of a `Field`. */
export function CycleField({ countText, onCountTextChange, unit, onUnitChange }: CycleFieldProps) {
  const plural = Number(countText) !== 1;
  return (
    <View style={styles.row}>
      <TextField
        value={countText}
        onChangeText={onCountTextChange}
        keyboardType="number-pad"
        maxLength={2}
        style={styles.count}
        selectTextOnFocus
        accessibilityLabel="Number of units per cycle"
      />
      <View style={styles.units}>
        <ChipGroup options={CYCLE_UNITS} value={unit} onChange={onUnitChange} label={(u) => (plural ? `${u}s` : u)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.twoAndHalf,
  },
  count: {
    width: 64,
    textAlign: 'center',
  },
  units: {
    flex: 1,
  },
});
