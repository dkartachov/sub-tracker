import type { AndroidSymbol, SFSymbol } from 'expo-symbols';

/**
 * What's tracked comes in two kinds. Subscriptions are services you chose and could drop without
 * much changing (streaming, software, the gym). Bills are what it costs to run your home and life
 * (mortgage or rent, insurance, internet, the phone plan). They're billed the same way, but each
 * has its own tab and its own totals on the Overview, so a mortgage doesn't swamp the subscriptions.
 */
export const KINDS = ['subscription', 'bill'] as const;
export type Kind = (typeof KINDS)[number];

export const CATEGORIES = [
  'streaming',
  'music',
  'fitness',
  'software',
  'development',
  'gaming',
  'news',
  'cloud',
  'food',
  'housing',
  'utilities',
  'insurance',
  'loans',
  'taxes',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** The categories offered for each kind, in the order the form shows them. "Other" is in both. */
export const KIND_CATEGORIES: Record<Kind, readonly Category[]> = {
  subscription: ['streaming', 'music', 'fitness', 'software', 'development', 'gaming', 'news', 'cloud', 'food', 'other'],
  bill: ['housing', 'utilities', 'insurance', 'loans', 'taxes', 'other'],
};

/** The kind a category belongs to: a bill for the bill categories, a subscription otherwise (and for "Other"). */
export function kindOfCategory(category: Category): Kind {
  return category !== 'other' && KIND_CATEGORIES.bill.includes(category) ? 'bill' : 'subscription';
}

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
  development: {
    label: 'Development',
    icon: { ios: 'chevron.left.forwardslash.chevron.right', android: 'code' },
    color: '#7FA81C',
  },
  gaming: { label: 'Gaming', icon: { ios: 'gamecontroller.fill', android: 'sports_esports' }, color: '#8E4EC6' },
  news: { label: 'News', icon: { ios: 'newspaper.fill', android: 'newspaper' }, color: '#978365' },
  cloud: { label: 'Cloud', icon: { ios: 'icloud.fill', android: 'cloud' }, color: '#0090FF' },
  food: { label: 'Food & groceries', icon: { ios: 'cart.fill', android: 'shopping_cart' }, color: '#12A594' },
  housing: { label: 'Housing', icon: { ios: 'house.fill', android: 'home' }, color: '#AB6400' },
  utilities: { label: 'Utilities', icon: { ios: 'bolt.fill', android: 'bolt' }, color: '#F76B15' },
  insurance: { label: 'Insurance', icon: { ios: 'shield.fill', android: 'shield' }, color: '#5B5BD6' },
  loans: { label: 'Loans', icon: { ios: 'banknote.fill', android: 'account_balance' }, color: '#E5484D' },
  taxes: { label: 'Taxes', icon: { ios: 'doc.text.fill', android: 'request_quote' }, color: '#12A594' },
  other: { label: 'Other', icon: { ios: 'square.grid.2x2.fill', android: 'category' }, color: '#8B8D98' },
};

export function toCategory(value: string): Category {
  return CATEGORIES.find((c) => c === value) ?? 'other';
}

export function toKind(value: string): Kind {
  return KINDS.find((k) => k === value) ?? 'subscription';
}

/** Words that differ between the kinds, for the screens and reminders. */
export const KIND_WORDS: Record<Kind, { one: string; many: string; next: string; cancelled: string }> = {
  subscription: { one: 'subscription', many: 'Subscriptions', next: 'Next charge', cancelled: 'Cancelled' },
  bill: { one: 'bill', many: 'Bills', next: 'Next payment', cancelled: 'Ended' },
};
