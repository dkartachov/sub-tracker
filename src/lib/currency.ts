/**
 * The one currency every amount in the app is in, picked in Settings. Amounts are stored in minor
 * units (cents) as integers, so sums never pick up floating-point error.
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

/** "€12.99", with the device's number format. Whole amounts drop the cents when `compact`. */
export function formatMoney(minor: number, currency: Currency = current, { compact = false } = {}) {
  const amount = Math.round(minor) / 100;
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    ...(compact && Number.isInteger(amount) && { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  }).format(amount);
}

/** Minor units from what was typed, accepting "12.99", "12,99" or "12". Null unless it's a positive amount. */
export function parseMoney(text: string): number | null {
  const normalized = text.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null;
  const minor = Math.round(Number(normalized) * 100);
  return minor > 0 ? minor : null;
}

/** An amount as it would be typed back in, "12.99", for editing. */
export function moneyInputText(minor: number) {
  return (minor / 100).toFixed(2);
}
