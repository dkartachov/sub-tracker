/**
 * Standard consumer tax rates on digital subscriptions, for the default picked in Settings. Each
 * subscription keeps its own rate, so a wrong or outdated one here is fixed in its form, and these
 * only fill in new ones.
 *
 * Checked against national sources as of `TAX_RATES_CHECKED`. Rates change (Estonia, Romania,
 * Slovakia, Finland and Nova Scotia all did in 2024 and 2025): when one does, update it here.
 * Existing subscriptions keep their rate until the person changes it.
 *
 * US sales tax depends on the state, county and city, and whether digital services are taxed at
 * all, so it has no rate here: it's typed in.
 */
import { NO_TAX, type Tax } from '@/lib/tax';

export const TAX_RATES_CHECKED = 'November 2026';

export type TaxRegion = {
  code: string;
  name: string;
  /** Thousandths of a percent, or null when it has to be typed in. */
  rate: number | null;
  /** Whether prices there are shown with the tax in them. */
  included: boolean;
  /** What the tax is called there, for "incl. 21% VAT". */
  taxName: string;
};

const vat = (code: string, name: string, percent: number): TaxRegion => ({
  code,
  name,
  rate: Math.round(percent * 1000),
  included: true,
  taxName: 'VAT',
});

/** Canadian GST plus the provincial sales tax on digital services, added at checkout. */
const canada = (code: string, name: string, percent: number, taxName: string): TaxRegion => ({
  code,
  name: `Canada: ${name}`,
  rate: Math.round(percent * 1000),
  included: false,
  taxName,
});

export const TAX_REGIONS: readonly TaxRegion[] = [
  vat('AT', 'Austria', 20),
  vat('BE', 'Belgium', 21),
  vat('BG', 'Bulgaria', 20),
  vat('HR', 'Croatia', 25),
  vat('CY', 'Cyprus', 19),
  vat('CZ', 'Czechia', 21),
  vat('DK', 'Denmark', 25),
  vat('EE', 'Estonia', 24),
  vat('FI', 'Finland', 25.5),
  vat('FR', 'France', 20),
  vat('DE', 'Germany', 19),
  vat('GR', 'Greece', 24),
  vat('HU', 'Hungary', 27),
  vat('IE', 'Ireland', 23),
  vat('IT', 'Italy', 22),
  vat('LV', 'Latvia', 21),
  vat('LT', 'Lithuania', 21),
  vat('LU', 'Luxembourg', 17),
  vat('MT', 'Malta', 18),
  vat('NL', 'Netherlands', 21),
  vat('PL', 'Poland', 23),
  vat('PT', 'Portugal', 23),
  vat('RO', 'Romania', 21),
  vat('SK', 'Slovakia', 23),
  vat('SI', 'Slovenia', 22),
  vat('ES', 'Spain', 21),
  vat('SE', 'Sweden', 25),
  vat('GB', 'United Kingdom', 20),
  vat('CH', 'Switzerland', 8.1),
  vat('NO', 'Norway', 25),
  { code: 'AU', name: 'Australia', rate: 10_000, included: true, taxName: 'GST' },
  { code: 'NZ', name: 'New Zealand', rate: 15_000, included: true, taxName: 'GST' },
  { code: 'JP', name: 'Japan', rate: 10_000, included: true, taxName: 'consumption tax' },
  canada('CA-AB', 'Alberta', 5, 'GST'),
  canada('CA-BC', 'British Columbia', 12, 'GST + PST'),
  canada('CA-MB', 'Manitoba', 12, 'GST + RST'),
  canada('CA-NB', 'New Brunswick', 15, 'HST'),
  canada('CA-NL', 'Newfoundland and Labrador', 15, 'HST'),
  canada('CA-NS', 'Nova Scotia', 14, 'HST'),
  canada('CA-ON', 'Ontario', 13, 'HST'),
  canada('CA-PE', 'Prince Edward Island', 15, 'HST'),
  canada('CA-QC', 'Québec', 14.975, 'GST + QST'),
  canada('CA-SK', 'Saskatchewan', 11, 'GST + PST'),
  canada('CA-NT', 'Northwest Territories', 5, 'GST'),
  canada('CA-NU', 'Nunavut', 5, 'GST'),
  canada('CA-YT', 'Yukon', 5, 'GST'),
  { code: 'US', name: 'United States', rate: null, included: false, taxName: 'sales tax' },
].sort((a, b) => a.name.localeCompare(b.name));

export function taxRegion(code: string | null): TaxRegion | null {
  return TAX_REGIONS.find((region) => region.code === code) ?? null;
}

/** What new subscriptions get: the region's rate, or `typedRate` where it's typed in, none without a region. */
export function defaultTax(region: TaxRegion | null, typedRate: number): Tax {
  if (!region) return NO_TAX;
  return { rate: region.rate ?? typedRate, included: region.included };
}
