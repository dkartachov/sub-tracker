import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { CATEGORY_INFO, type Category } from '@/constants/categories';

/** The category's icon in a tinted circle, a subscription's stand-in for a logo. */
export function CategoryBadge({ category, size = 40 }: { category: Category; size?: number }) {
  const { icon, color } = CATEGORY_INFO[category];
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: `${color}26` }]}>
      <SymbolView name={icon} size={size * 0.5} tintColor={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
