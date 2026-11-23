import type { CycleUnit } from '@/lib/billing';

import type { Category } from './categories';

/**
 * Common subscriptions, offered while typing a name, to fill in the category and billing cycle.
 * No prices: they differ by country and plan, so the price is always typed in.
 */
export type SubscriptionTemplate = { name: string; category: Category; cycle: { count: number; unit: CycleUnit } };

const monthly = { count: 1, unit: 'month' } as const;
const yearly = { count: 1, unit: 'year' } as const;

export const TEMPLATES: SubscriptionTemplate[] = [
  { name: 'Netflix', category: 'streaming', cycle: monthly },
  { name: 'Spotify', category: 'music', cycle: monthly },
  { name: 'YouTube Premium', category: 'streaming', cycle: monthly },
  { name: 'Disney+', category: 'streaming', cycle: monthly },
  { name: 'Amazon Prime', category: 'streaming', cycle: yearly },
  { name: 'Google One', category: 'cloud', cycle: monthly },
  { name: 'Gym', category: 'fitness', cycle: monthly },
  { name: 'ChatGPT Plus', category: 'software', cycle: monthly },
  { name: 'Max', category: 'streaming', cycle: monthly },
  { name: 'Apple Music', category: 'music', cycle: monthly },
  { name: 'Apple TV+', category: 'streaming', cycle: monthly },
  { name: 'iCloud+', category: 'cloud', cycle: monthly },
  { name: 'Dropbox', category: 'cloud', cycle: monthly },
  { name: 'Microsoft 365', category: 'software', cycle: yearly },
  { name: 'Adobe Creative Cloud', category: 'software', cycle: monthly },
  { name: 'Xbox Game Pass', category: 'gaming', cycle: monthly },
  { name: 'PlayStation Plus', category: 'gaming', cycle: monthly },
  { name: 'Nintendo Switch Online', category: 'gaming', cycle: yearly },
  { name: 'Audible', category: 'news', cycle: monthly },
  { name: 'Duolingo', category: 'software', cycle: yearly },
  { name: 'Phone plan', category: 'utilities', cycle: monthly },
  { name: 'Internet', category: 'utilities', cycle: monthly },
];

/** How many suggestions show at once. */
const SHOWN = 6;

/**
 * Templates for what's been typed: the popular ones while it's empty, else those with a word
 * starting with it. None once the name is exactly a template's, since it's been picked.
 */
export function suggestTemplates(typed: string): SubscriptionTemplate[] {
  const query = typed.trim().toLowerCase();
  if (query === '') return TEMPLATES.slice(0, SHOWN);
  if (TEMPLATES.some((t) => t.name.toLowerCase() === query)) return [];
  return TEMPLATES.filter((t) => {
    const name = t.name.toLowerCase();
    return name.startsWith(query) || name.split(' ').some((word) => word.startsWith(query));
  }).slice(0, SHOWN);
}
