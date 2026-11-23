import type { AndroidSymbol, SFSymbol } from 'expo-symbols';
import { StyleSheet } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

import { Icon } from './icon';
import { PressableScale } from './pressable-scale';

type IconButtonProps = {
  icon: { ios: SFSymbol; android: AndroidSymbol };
  label: string;
  onPress: () => void;
};

/** A round accent button holding just an icon, e.g. "add" next to a page title. */
export function IconButton({ icon, label, onPress }: IconButtonProps) {
  const theme = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      pressedScale={0.9}
      onPress={onPress}
      style={[styles.button, { backgroundColor: theme.tint, boxShadow: `0 6px 16px ${theme.tint}40` }]}>
      <Icon name={icon} size={24} color="onTint" />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
