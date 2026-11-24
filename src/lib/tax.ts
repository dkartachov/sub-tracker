/**
 * Sales tax, VAT and GST on a subscription. Pure, like `billing.ts`, which uses it to work out what
 * each charge actually costs.
 *
 * Rates are integers in thousandths of a percent (21% is 21000, Québec's 14.975% is 14975), so
 * they're stored and compared exactly. Tax is rounded to the cent once per charge, the way a bill is.
 */

/** 100% in rate units. */
export const TAX_RATE_SCALE = 100_000;

export type Tax = {
  /** Thousandths of a percent, 0 for none. */
  rate: number;
  /** Whether the typed price already has the tax in it (VAT in Europe), or it's added on top (US and Canadian sales tax). */
  included: boolean;
};

export const NO_TAX: Tax = { rate: 0, included: true };

export function sameTax(a: Tax, b: Tax) {
  return a.rate === b.rate && (a.included === b.included || a.rate === 0);
}

/** What a charge at `price` costs with `tax`: the price itself when the tax is in it, else the price plus tax. */
export function withTax(price: number, tax: Tax = NO_TAX): number {
  if (tax.included || tax.rate === 0) return price;
  return price + Math.round((price * tax.rate) / TAX_RATE_SCALE);
}

/** How much tax a charge at `price` carries: the part of it that's tax, or what's added on top. */
export function taxOn(price: number, tax: Tax = NO_TAX): number {
  if (tax.rate === 0) return 0;
  if (!tax.included) return withTax(price, tax) - price;
  return price - Math.round((price * TAX_RATE_SCALE) / (TAX_RATE_SCALE + tax.rate));
}

/** "21%", "8.1%", "14.975%", with the device's decimal separator. */
export function formatTaxRate(rate: number) {
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(rate / 1000)}%`;
}

/** The rate as it would be typed back in: "21", "8.1", "14.975". */
export function taxRateInputText(rate: number) {
  return String(rate / 1000);
}

/** A rate from what was typed: "21", "8.1", "14,975", an optional "%". Null unless 0 up to under 100. */
export function parseTaxRate(text: string): number | null {
  const normalized = text.trim().replace(/\s|%/g, '').replace(',', '.');
  if (!/^\d{1,2}(\.\d{0,3})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 1000);
}

/**
 * What to do at launch about the default tax, given the one subscriptions were last moved to (or
 * asked about), null before there was one. 'record' takes the current one silently: on the first
 * launch, or when the region is gone (no rate to offer). 'offer' asks to move subscriptions over:
 * an app update changed the rate. Null when nothing changed.
 */
export function taxDefaultChange(applied: Tax | null, current: Tax, hasRegion: boolean): 'record' | 'offer' | null {
  if (applied !== null && sameTax(applied, current)) return null;
  return applied === null || !hasRegion ? 'record' : 'offer';
}

/** "Price (EUR)", or "Price before tax (USD)" when tax is added on top, for a price field. */
export function priceFieldLabel(tax: Tax, currency: string, label = 'Price') {
  return tax.rate > 0 && !tax.included ? `${label} before tax (${currency})` : `${label} (${currency})`;
}

/** "incl. 21% VAT" or "+ 13% tax", for next to a price. Empty without tax. */
export function taxPhrase(tax: Tax, name = 'tax') {
  if (tax.rate === 0) return '';
  return tax.included ? `incl. ${formatTaxRate(tax.rate)} ${name}` : `+ ${formatTaxRate(tax.rate)} ${name}`;
}
