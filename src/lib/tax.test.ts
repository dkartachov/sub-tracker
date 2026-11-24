import { defaultTax, TAX_REGIONS, taxRegion } from '@/constants/tax-regions';

import { chargesBetween, monthlyEquivalent, nextChargeOnOrAfter, spentBetween } from './billing';
import {
  formatTaxRate,
  NO_TAX,
  parseTaxRate,
  priceFieldLabel,
  sameTax,
  taxDefaultChange,
  taxOn,
  taxRateInputText,
  withTax,
  type Tax,
} from './tax';
import { simpleBilling } from '@/test-utils/subscription';

const vat21: Tax = { rate: 21_000, included: true };
const ontario: Tax = { rate: 13_000, included: false };
const quebec: Tax = { rate: 14_975, included: false };

it('adds tax on top only when the price leaves it out', () => {
  expect(withTax(1299, NO_TAX)).toBe(1299);
  expect(withTax(1299, vat21)).toBe(1299);
  expect(withTax(1000, ontario)).toBe(1130);
  // 1299 × 13% = 168.87, rounded to the cent.
  expect(withTax(1299, ontario)).toBe(1468);
  // 999 × 14.975% = 149.60…
  expect(withTax(999, quebec)).toBe(1149);
  expect(withTax(1000, undefined)).toBe(1000);
});

it('says how much of a charge is tax', () => {
  // 12.10 with 21% in it is 10.00 + 2.10.
  expect(taxOn(1210, vat21)).toBe(210);
  expect(taxOn(1299, vat21)).toBe(225);
  expect(taxOn(1299, ontario)).toBe(169);
  expect(withTax(1299, ontario) - 1299).toBe(taxOn(1299, ontario));
  expect(taxOn(1299, NO_TAX)).toBe(0);
  expect(taxOn(1299, { rate: 0, included: false })).toBe(0);
});

it('reads and writes rates exactly, in thousandths of a percent', () => {
  expect(parseTaxRate('21')).toBe(21_000);
  expect(parseTaxRate('8.1')).toBe(8_100);
  expect(parseTaxRate('14,975')).toBe(14_975);
  expect(parseTaxRate(' 13 % ')).toBe(13_000);
  expect(parseTaxRate('0')).toBe(0);
  expect(parseTaxRate('99.999')).toBe(99_999);
  for (const bad of ['', '100', '-5', '1.2345', 'abc', '1.2.3']) expect(parseTaxRate(bad)).toBeNull();

  expect(taxRateInputText(14_975)).toBe('14.975');
  expect(parseTaxRate(taxRateInputText(8_100))).toBe(8_100);
  expect(formatTaxRate(25_500)).toMatch(/^25[.,]5%$/);
  expect(formatTaxRate(20_000)).toBe('20%');
});

it('treats any tax of 0% the same', () => {
  expect(sameTax(NO_TAX, { rate: 0, included: false })).toBe(true);
  expect(sameTax(ontario, { ...ontario, included: true })).toBe(false);
  expect(sameTax(vat21, { ...vat21 })).toBe(true);
});

it('offers to move subscriptions over only when an update changed the rate', () => {
  const estoniaOld: Tax = { rate: 22_000, included: true };
  const estoniaNew: Tax = { rate: 24_000, included: true };
  // First launch with this: nothing to compare with, so it's just recorded.
  expect(taxDefaultChange(null, estoniaNew, true)).toBe('record');
  expect(taxDefaultChange(estoniaNew, estoniaNew, true)).toBeNull();
  expect(taxDefaultChange(estoniaOld, estoniaNew, true)).toBe('offer');
  // A region that's no longer in the table has no rate to offer.
  expect(taxDefaultChange(estoniaOld, NO_TAX, false)).toBe('record');
  expect(taxDefaultChange(NO_TAX, { rate: 0, included: false }, false)).toBeNull();
});

it('labels a price field as before tax when tax is added on top', () => {
  expect(priceFieldLabel(ontario, 'CAD')).toBe('Price before tax (CAD)');
  expect(priceFieldLabel(vat21, 'EUR')).toBe('Price (EUR)');
  expect(priceFieldLabel(NO_TAX, 'USD', 'New price')).toBe('New price (USD)');
});

it('charges the price plus tax in every total', () => {
  const billing = {
    ...simpleBilling({
      firstPaymentDate: '2026-01-10',
      cycle: { count: 1, unit: 'month' },
      cancelledOn: null,
      prices: [
        { amount: 1000, effectiveDate: '2026-01-10' },
        { amount: 2000, effectiveDate: '2026-03-10' },
      ],
    }),
    tax: ontario,
  };
  expect(chargesBetween(billing, '2026-01-01', '2026-03-31').map((c) => c.amount)).toEqual([1130, 1130, 2260]);
  expect(spentBetween(billing, '2026-01-01', '2026-03-31')).toBe(4520);
  const next = nextChargeOnOrAfter(billing, '2026-04-01')!;
  expect(monthlyEquivalent(next.amount, next.cycle)).toBe(2260);

  // Included tax changes nothing that's paid.
  expect(spentBetween({ ...billing, tax: vat21 }, '2026-01-01', '2026-03-31')).toBe(4000);
});

it('has a valid, unique rate table', () => {
  const codes = TAX_REGIONS.map((region) => region.code);
  expect(new Set(codes).size).toBe(codes.length);
  for (const region of TAX_REGIONS) {
    if (region.rate !== null) {
      expect(Number.isInteger(region.rate)).toBe(true);
      expect(region.rate).toBeGreaterThan(0);
      expect(region.rate).toBeLessThan(100_000);
    }
  }
  expect(taxRegion('DE')).toMatchObject({ rate: 19_000, included: true });
  expect(taxRegion('CA-QC')).toMatchObject({ rate: 14_975, included: false });
});

it('defaults new subscriptions to the region, or the typed rate where there is none', () => {
  expect(defaultTax(null, 7_250)).toEqual(NO_TAX);
  expect(defaultTax(taxRegion('FR'), 7_250)).toEqual({ rate: 20_000, included: true });
  expect(defaultTax(taxRegion('US'), 7_250)).toEqual({ rate: 7_250, included: false });
  expect(defaultTax(taxRegion('US'), 0)).toEqual({ rate: 0, included: false });
});
