/**
 * The main forms, rendered and driven like a person would, against a real (in-memory) database.
 * They live outside `src/app` so Expo Router doesn't take them for screens.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import CancelScreen from '@/app/subscription/cancel';
import EditSubscriptionScreen from '@/app/subscription/edit';
import PriceChangeScreen from '@/app/subscription/price-change';
import { createSubscription, getSubscriptions, type SubscriptionInput } from '@/db/subscriptions';
import { setCurrency } from '@/lib/currency';
import { createTestDb } from '@/test-utils/sqlite';

let mockDb: SQLiteDatabase;
let mockParams: Record<string, string> = {};

jest.mock('expo-sqlite', () => ({
  useSQLiteContext: () => mockDb,
  addDatabaseChangeListener: () => ({ remove() {} }),
}));

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useNavigation: () => {
    throw new Error('No navigator in tests');
  },
}));

jest.mock('expo-notifications', () => ({
  AndroidImportance: {},
  setNotificationChannelAsync: jest.fn(async () => null),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
}));

jest.mock('@/lib/haptics', () => ({ haptic: { select() {}, tap() {}, success() {} } }));

const { router } = jest.requireMock('expo-router') as { router: { back: jest.Mock } };

const netflix: SubscriptionInput = {
  name: 'Netflix',
  category: 'streaming',
  cycle: { count: 1, unit: 'month' },
  firstPaymentDate: '2026-01-15',
  isTrial: false,
  reminderDaysBefore: 3,
  notes: '',
};

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

function renderScreen(element: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={METRICS}>{element}</SafeAreaProvider>);
}

beforeEach(async () => {
  mockDb = await createTestDb();
  mockParams = {};
  router.back.mockClear();
  setCurrency('EUR');
});

it('adds a subscription from a suggestion, with a typed price', async () => {
  await renderScreen(<EditSubscriptionScreen />);

  await fireEvent.changeText(screen.getByPlaceholderText('Netflix, climbing gym…'), 'spot');
  await fireEvent.press(screen.getByText('Spotify'));
  await fireEvent.changeText(screen.getByPlaceholderText('12.99'), '10,99');
  await fireEvent.press(screen.getByText('Add subscription'));

  await waitFor(() => expect(router.back).toHaveBeenCalled());
  const [sub] = await getSubscriptions(mockDb);
  expect(sub).toMatchObject({ name: 'Spotify', category: 'music', cycle: { count: 1, unit: 'month' } });
  expect(sub.prices.map((p) => p.amount)).toEqual([1099]);
});

it("won't add one without a name and price", async () => {
  await renderScreen(<EditSubscriptionScreen />);
  await fireEvent.changeText(screen.getByPlaceholderText('Netflix, climbing gym…'), 'Gym');
  expect(screen.getByRole('button', { name: 'Add subscription' })).toBeDisabled();
});

it('takes whole yen only', async () => {
  setCurrency('JPY');
  await renderScreen(<EditSubscriptionScreen />);

  await fireEvent.changeText(screen.getByPlaceholderText('Netflix, climbing gym…'), 'Gym');
  await fireEvent.changeText(screen.getByPlaceholderText('1200'), '9.80');
  expect(screen.getByRole('button', { name: 'Add subscription' })).toBeDisabled();

  await fireEvent.changeText(screen.getByPlaceholderText('1200'), '980');
  await fireEvent.press(screen.getByText('Add subscription'));
  await waitFor(() => expect(router.back).toHaveBeenCalled());
  expect((await getSubscriptions(mockDb))[0].prices[0].amount).toBe(98000);
});

it('records a price change', async () => {
  const id = await createSubscription(mockDb, netflix, 999);
  mockParams = { id: String(id) };
  await renderScreen(<PriceChangeScreen />);

  const field = await screen.findByDisplayValue('9.99');
  await fireEvent.changeText(field, '12.49');
  await fireEvent.press(screen.getByText('Save price'));

  await waitFor(() => expect(router.back).toHaveBeenCalled());
  const [sub] = await getSubscriptions(mockDb);
  expect(sub.prices.map((p) => p.amount)).toEqual([999, 1249]);
});

it('cancels from today by default', async () => {
  const id = await createSubscription(mockDb, netflix, 999);
  mockParams = { id: String(id) };
  await renderScreen(<CancelScreen />);

  await fireEvent.press(await screen.findByText('Mark cancelled'));

  await waitFor(() => expect(router.back).toHaveBeenCalled());
  const [sub] = await getSubscriptions(mockDb);
  expect(sub.cancelledOn).not.toBeNull();
  expect(sub.cancelledOn! >= '2026-01-15').toBe(true);
});

it('cancels when the paid period ends', async () => {
  const id = await createSubscription(mockDb, netflix, 999);
  mockParams = { id: String(id) };
  await renderScreen(<CancelScreen />);

  await fireEvent.press(await screen.findByText('When paid period ends'));
  expect(screen.getByText(/You keep access until/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Mark cancelled'));

  await waitFor(() => expect(router.back).toHaveBeenCalled());
  const [sub] = await getSubscriptions(mockDb);
  // The day it would charge next: the 15th of a month after today.
  expect(sub.cancelledOn).toMatch(/^\d{4}-\d{2}-15$/);
});
