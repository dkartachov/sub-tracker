/**
 * The tax region picked in Settings, and the rate typed in for a region without a fixed one (the
 * US). Both stay on the phone: they only fill in the tax of new subscriptions.
 */
import { defaultTax, TAX_REGIONS, taxRegion } from '@/constants/tax-regions';

import { storedSetting } from './stored-setting';
import type { Tax } from './tax';

/** A region code from `TAX_REGIONS`, or '' for none. */
export const taxRegionSetting = storedSetting<string>('taxRegion', '', (stored) =>
  stored === '' || TAX_REGIONS.some((region) => region.code === stored) ? stored : null
);

export const typedTaxRateSetting = storedSetting<number>(
  'typedTaxRate',
  0,
  (stored) => {
    const rate = Number(stored);
    return Number.isInteger(rate) && rate >= 0 && rate < 100_000 ? rate : null;
  }
);

/**
 * The default subscriptions were last moved to, or asked about. When an app update changes the
 * region's rate, it differs from the current default, and `TaxRateCheck` offers to move them.
 */
export const appliedTaxSetting = storedSetting<Tax | null>(
  'appliedTax',
  null,
  (stored) => {
    try {
      const { rate, included } = JSON.parse(stored);
      return Number.isInteger(rate) && typeof included === 'boolean' ? { rate, included } : null;
    } catch {
      return null;
    }
  },
  (tax) => JSON.stringify(tax)
);

/**
 * The settings as hooks. Named `use…` so React Compiler treats them as hooks: a `setting.use()`
 * method call doesn't look like one to it, so it caches the call and skips it on later renders,
 * and React then crashes with "Cannot read property 'next' of undefined".
 */
export const useTaxRegion = taxRegionSetting.use;
export const useTypedTaxRate = typedTaxRateSetting.use;

export function getDefaultTax(): Tax {
  return defaultTax(taxRegion(taxRegionSetting.get()), typedTaxRateSetting.get());
}

/** The default tax with its region, re-rendering when either setting changes. */
export function useDefaultTax() {
  const region = taxRegion(useTaxRegion());
  const typedRate = useTypedTaxRate();
  return { region, tax: defaultTax(region, typedRate) };
}
