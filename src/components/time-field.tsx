import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { formatTimeOfDay, type TimeOfDay } from '@/lib/reminder-time';

import { inputStyles } from './field';
import { Icon } from './icon';
import { ThemedText } from './themed-text';

/** Tappable time-of-day row, opening the system time dialog (the app is Android-only). */
export function TimeField({ value, onChange }: { value: TimeOfDay; onChange: (value: TimeOfDay) => void }) {
  const theme = useTheme();

  const open = () =>
    DateTimePickerAndroid.open({
      value: new Date(2026, 0, 1, value.hour, value.minute),
      mode: 'time',
      onValueChange: (_event, selected) => onChange({ hour: selected.getHours(), minute: selected.getMinutes() }),
    });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Reminder time, ${formatTimeOfDay(value)}`}
      onPress={open}
      style={[inputStyles.box, styles.row, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <ThemedText>{formatTimeOfDay(value)}</ThemedText>
      <Icon name={{ ios: 'clock', android: 'schedule' }} color="textSecondary" size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
