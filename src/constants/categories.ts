import type { AndroidSymbol, SFSymbol } from 'expo-symbols';

export const CATEGORIES = [
  'streaming',
  'music',
  'fitness',
  'software',
  'gaming',
  'news',
  'cloud',
  'utilities',
  'food',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

type CategoryInfo = {
  label: string;
  icon: { ios: SFSymbol; android: AndroidSymbol };
  /** Same in light and dark mode: mid-tones that read on both. */
  color: string;
};

export const CATEGORY_INFO: Record<Category, CategoryInfo> = {
  streaming: { label: 'Streaming', icon: { ios: 'play.tv.fill', android: 'live_tv' }, color: '#E5484D' },
  music: { label: 'Music', icon: { ios: 'music.note', android: 'music_note' }, color: '#D6409F' },
  fitness: { label: 'Fitness', icon: { ios: 'figure.climbing', android: 'fitness_center' }, color: '#30A46C' },
  software: { label: 'Software', icon: { ios: 'app.badge.fill', android: 'apps' }, color: '#3E63DD' },
  gaming: { label: 'Gaming', icon: { ios: 'gamecontroller.fill', android: 'sports_esports' }, color: '#8E4EC6' },
  news: { label: 'News', icon: { ios: 'newspaper.fill', android: 'newspaper' }, color: '#978365' },
  cloud: { label: 'Cloud', icon: { ios: 'icloud.fill', android: 'cloud' }, color: '#0090FF' },
  utilities: { label: 'Utilities', icon: { ios: 'bolt.fill', android: 'bolt' }, color: '#F76B15' },
  food: { label: 'Food & groceries', icon: { ios: 'cart.fill', android: 'shopping_cart' }, color: '#12A594' },
  other: { label: 'Other', icon: { ios: 'square.grid.2x2.fill', android: 'category' }, color: '#8B8D98' },
};

export function toCategory(value: string): Category {
  return CATEGORIES.find((c) => c === value) ?? 'other';
}
