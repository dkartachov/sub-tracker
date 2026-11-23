/**
 * The one currency every amount in the app is in, picked in Settings. Amounts are stored as
 * integers in hundredths of the currency unit (cents), so sums never pick up floating-point error.
 * That holds for every currency, yen included, so switching currency never changes a stored amount:
 * a currency without cents only changes how amounts are typed and shown.
 */
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

export const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'CZK', 'PLN', 'SEK', 'NOK', 'DKK', 'CAD', 'AUD', 'JPY'] as const;
export type Currency = (typeof CURRENCIES)[number];

const STORAGE_KEY = 'currency';
const DEFAULT_CURRENCY: Currency = 'EUR';

let current: Currency = CURRENCIES.find((c) => c === Storage.getItemSync(STORAGE_KEY)) ?? DEFAULT_CURRENCY;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCurrency(): Currency {
  return current;
}

export function setCurrency(currency: Currency) {
  Storage.setItemSync(STORAGE_KEY, currency);
  current = currency;
  listeners.forEach((listener) => listener());
}

export function useCurrency() {
  return useSyncExternalStore(subscribe, getCurrency);
}

/** Currencies without cents in everyday use: prices are typed and shown in whole units. */
const WHOLE_UNIT_CURRENCIES: readonly Currency[] = ['JPY'];

/** Decimal places prices have in `currency`: 2, or 0 for the yen. */
export function currencyDecimals(currency: Currency = current): 0 | 2 {
  return WHOLE_UNIT_CURRENCIES.includes(currency) ? 0 : 2;
}

/** "€12.99", with the device's number format. Whole amounts drop the cents when `compact`. */
export function formatMoney(minor: number, currency: Currency = current, { compact = false } = {}) {
  const decimals = currencyDecimals(currency);
  const amount = Math.round(minor) / 100;
  const whole = decimals === 0 || (compact && Number.isInteger(amount));
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : decimals,
    maximumFractionDigits: whole ? 0 : decimals,
  }).format(amount);
}

/**
 * Hundredths from what was typed, accepting "12.99", "12,99" or "12". For a currency without cents
 * only whole amounts, where "1,200" and "1.200" are read as twelve hundred. Null unless positive.
 */
export function parseMoney(text: string, currency: Currency = current): number | null {
  const compact = text.trim().replace(/\s/g, '');
  if (currencyDecimals(currency) === 0) {
    if (!/^(\d+|\d{1,3}([.,]\d{3})+)$/.test(compact)) return null;
    const minor = Number(compact.replace(/[.,]/g, '')) * 100;
    return minor > 0 ? minor : null;
  }
  const normalized = compact.replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null;
  const minor = Math.round(Number(normalized) * 100);
  return minor > 0 ? minor : null;
}

/** An amount as it would be typed back in, "12.99" (or "1200" for the yen), for editing. */
export function moneyInputText(minor: number, currency: Currency = current) {
  return (minor / 100).toFixed(currencyDecimals(currency));
}

/** An example price for an empty price field. */
export function moneyPlaceholder(currency: Currency = current) {
  return currencyDecimals(currency) === 0 ? '1200' : '12.99';
}
