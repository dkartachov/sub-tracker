import type { CycleUnit } from '@/lib/billing';

import { kindOfCategory, type Category, type Kind } from './categories';

/**
 * Common subscriptions and bills, offered while typing a name, to fill in the category and billing
 * cycle. Each is a bill or a subscription by its category (see `kindOfCategory`).
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
  { name: 'GitHub Copilot', category: 'development', cycle: monthly },
  { name: 'GitHub Pro', category: 'development', cycle: monthly },
  { name: 'Claude Pro', category: 'development', cycle: monthly },
  { name: 'Claude Max', category: 'development', cycle: monthly },
  { name: 'Cursor', category: 'development', cycle: monthly },
  { name: 'JetBrains All Products Pack', category: 'development', cycle: yearly },
  // Bills.
  { name: 'Mortgage', category: 'housing', cycle: monthly },
  { name: 'Rent', category: 'housing', cycle: monthly },
  { name: 'Internet', category: 'utilities', cycle: monthly },
  { name: 'Phone plan', category: 'utilities', cycle: monthly },
  { name: 'Electricity', category: 'utilities', cycle: monthly },
  { name: 'Home insurance', category: 'insurance', cycle: yearly },
  { name: 'Car insurance', category: 'insurance', cycle: monthly },
  { name: 'Health insurance', category: 'insurance', cycle: monthly },
  { name: 'Car loan', category: 'loans', cycle: monthly },
  { name: 'Student loan', category: 'loans', cycle: monthly },
  { name: 'Property tax', category: 'taxes', cycle: yearly },
  { name: 'Water', category: 'utilities', cycle: monthly },
  { name: 'Gas', category: 'utilities', cycle: monthly },
  { name: 'HOA fees', category: 'housing', cycle: monthly },
];

/** How many suggestions show at once. */
const SHOWN = 6;

/**
 * Templates for what's been typed: the popular ones while it's empty, else those with a word
 * starting with it. None once the name is exactly a template's, since it's been picked.
 */
export function suggestTemplates(typed: string, kind: Kind = 'subscription'): SubscriptionTemplate[] {
  const templates = TEMPLATES.filter((t) => kindOfCategory(t.category) === kind);
  const query = typed.trim().toLowerCase();
  if (query === '') return templates.slice(0, SHOWN);
  if (templates.some((t) => t.name.toLowerCase() === query)) return [];
  return templates.filter((t) => {
    const name = t.name.toLowerCase();
    return name.startsWith(query) || name.split(' ').some((word) => word.startsWith(query));
  }).slice(0, SHOWN);
}
