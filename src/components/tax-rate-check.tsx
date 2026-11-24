import { usePathname } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';

import { taxRegion } from '@/constants/tax-regions';
import { formatTaxRate, taxDefaultChange } from '@/lib/tax';
import { appliedTaxSetting, getDefaultTax, taxRegionSetting } from '@/lib/tax-setting';

import { useDialogOpen } from './dialog';
import { offerToApplyTax } from './tax-default-change';
import { HOLD_PATHS } from './update-prompt';

/**
 * Subscriptions keep the rate they were given, so when an app update changes the rate of the
 * region picked in Settings (`src/constants/tax-regions.ts`), this offers once to move the ones
 * still on the old rate over. Waits for forms and other dialogs like `UpdatePrompt` does. Renders
 * nothing.
 */
export function TaxRateCheck() {
  const db = useSQLiteContext();
  const held = HOLD_PATHS.includes(usePathname());
  const dialogOpen = useDialogOpen();

  useEffect(() => {
    if (held || dialogOpen) return;
    const applied = appliedTaxSetting.get();
    const current = getDefaultTax();
    const region = taxRegion(taxRegionSetting.get());
    const change = taxDefaultChange(applied, current, region !== null);
    if (change === 'record') appliedTaxSetting.set(current);
    if (change !== 'offer' || !region || !applied) return;
    offerToApplyTax(db, applied, current, {
      title: 'Tax rate changed',
      lead: `${region.name}'s ${region.taxName} is now ${formatTaxRate(current.rate)}. `,
    }).catch(console.warn);
  }, [db, held, dialogOpen]);

  return null;
}
