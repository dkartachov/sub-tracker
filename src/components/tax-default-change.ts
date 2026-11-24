import type { SQLiteDatabase } from 'expo-sqlite';

import { getSubscriptions, replaceTax } from '@/db/subscriptions';
import { formatTaxRate, sameTax, type Tax } from '@/lib/tax';
import { appliedTaxSetting } from '@/lib/tax-setting';

import { showDialog } from './dialog';

function describe(tax: Tax) {
  if (tax.rate === 0) return 'no tax';
  return `${formatTaxRate(tax.rate)} ${tax.included ? 'included' : 'added on top'}`;
}

/**
 * After the default tax changes from `previous` to `next` (a new region in Settings, or an app
 * update with a new rate), offers to move the subscriptions still on `previous` over to it. Ones
 * given a rate of their own are left alone. Either way it's recorded as asked, so it isn't again.
 */
export async function offerToApplyTax(
  db: SQLiteDatabase,
  previous: Tax,
  next: Tax,
  { title = 'Update your subscriptions?', lead = '' } = {}
) {
  appliedTaxSetting.set(next);
  if (sameTax(previous, next)) return;
  const count = (await getSubscriptions(db)).filter((sub) => sameTax(sub.tax, previous)).length;
  if (count === 0) return;

  const which = count === 1 ? 'the subscription' : `the ${count} subscriptions`;
  const effect =
    next.rate > 0 && !next.included
      ? ' Their totals go up by the tax, past charges included.'
      : previous.rate > 0 && !previous.included
        ? ' Their totals drop, past charges included.'
        : ' What they cost stays the same.';
  showDialog({
    title,
    message: `${lead}Change ${which} on ${describe(previous)} to ${describe(next)}?${effect} New subscriptions get it either way.`,
    actions: [
      { label: count === 1 ? 'Update it' : `Update ${count}`, variant: 'primary', onPress: () => replaceTax(db, previous, next).catch(console.warn) },
      { label: 'Keep them', variant: 'secondary', onPress: () => {} },
    ],
  });
}
