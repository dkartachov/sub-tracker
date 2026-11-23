/**
 * A small setting kept in the key-value store, readable synchronously anywhere and as a hook that
 * re-renders when it changes. Values are strings in storage; `parse` turns a stored value back into
 * one, or null when it's missing or no longer valid, so the default applies.
 */
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

export function storedSetting<T>(
  key: string,
  fallback: T,
  parse: (stored: string) => T | null,
  serialize: (value: T) => string = String
) {
  const stored = Storage.getItemSync(key);
  let current: T = (stored === null ? null : parse(stored)) ?? fallback;
  const listeners = new Set<() => void>();

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const get = () => current;

  return {
    get,
    set(value: T) {
      Storage.setItemSync(key, serialize(value));
      current = value;
      listeners.forEach((listener) => listener());
    },
    use: () => useSyncExternalStore(subscribe, get),
  };
}
