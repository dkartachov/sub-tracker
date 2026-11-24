/**
 * The confirmation dialogs, driven like a person would against a real (in-memory) database: the
 * destructive choice does what it says, and the other one leaves everything as it was.
 * They live outside `src/app` so Expo Router doesn't take them for screens.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { ReactElement } from 'react';
import { Share } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SettingsScreen from '@/app/(tabs)/settings';
import RestoreScreen from '@/app/restore';
import SubscriptionScreen from '@/app/subscription/[id]';
import { DialogHost } from '@/components/dialog';
import {
  addPriceChange,
  createSubscription,
  getSubscriptions,
  setCancelled,
  startPeriod,
  type SubscriptionInput,
} from '@/db/subscriptions';
import { createBackup, serializeBackup } from '@/lib/backup';
import { getCurrency, setCurrency } from '@/lib/currency';
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
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
}));

jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.0', nativeBuildVersion: '1' }));

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

function renderWithDialogs(element: ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      {element}
      <DialogHost />
    </SafeAreaProvider>
  );
}

async function renderSubscription(id: number) {
  mockParams = { id: String(id) };
  await renderWithDialogs(<SubscriptionScreen />);
  await screen.findByText('Netflix');
}

beforeEach(async () => {
  mockDb = await createTestDb();
  mockParams = {};
  router.back.mockClear();
  setCurrency('EUR');
});

afterEach(() => jest.restoreAllMocks());

/** The dialog's state outlives each test, so every test checks it closed. */
function expectNoDialog(title: string) {
  expect(screen.queryByText(title)).toBeNull();
}

describe('deleting a subscription', () => {
  it('deletes it and goes back when confirmed', async () => {
    const id = await createSubscription(mockDb, netflix, 999);
    await renderSubscription(id);

    await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText('Delete Netflix?')).toBeTruthy();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!);
    expectNoDialog('Delete Netflix?');

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(await getSubscriptions(mockDb)).toEqual([]);
  });

  it('keeps it when told to', async () => {
    const id = await createSubscription(mockDb, netflix, 999);
    await renderSubscription(id);

    await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Keep it' }));
    expectNoDialog('Delete Netflix?');

    expect(router.back).not.toHaveBeenCalled();
    expect(await getSubscriptions(mockDb)).toHaveLength(1);
  });
});

describe('removing a price change', () => {
  it('removes it when confirmed', async () => {
    const id = await createSubscription(mockDb, netflix, 999);
    await addPriceChange(mockDb, id, 1249, '2026-03-15');
    await renderSubscription(id);

    await fireEvent(screen.getByHintText('Long press to remove'), 'longPress');
    expect(screen.getByText('Remove this price change?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
    expectNoDialog('Remove this price change?');

    await waitFor(async () => expect((await getSubscriptions(mockDb))[0].prices.map((p) => p.amount)).toEqual([999]));
  });

  it('keeps it when told to', async () => {
    const id = await createSubscription(mockDb, netflix, 999);
    await addPriceChange(mockDb, id, 1249, '2026-03-15');
    await renderSubscription(id);

    await fireEvent(screen.getByHintText('Long press to remove'), 'longPress');
    await fireEvent.press(screen.getByRole('button', { name: 'Keep' }));
    expectNoDialog('Remove this price change?');

    expect((await getSubscriptions(mockDb))[0].prices.map((p) => p.amount)).toEqual([999, 1249]);
  });
});

describe('removing from the billing history', () => {
  it('undoes a resume, so it stays cancelled', async () => {
    const id = await createSubscription(mockDb, netflix, 999);
    await setCancelled(mockDb, id, '2026-03-01');
    await startPeriod(mockDb, id, 'resume', '2026-05-01', { count: 1, unit: 'month' }, null);
    await renderSubscription(id);

    await fireEvent(screen.getByHintText('Long press to remove'), 'longPress');
    expect(screen.getByText('Remove this resume?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
    expectNoDialog('Remove this resume?');

    await waitFor(async () =>
      expect((await getSubscriptions(mockDb))[0].periods).toEqual([
        { start: '2026-01-15', cycle: { count: 1, unit: 'month' }, end: '2026-03-01' },
      ])
    );
  });

  it('undoes a plan change, so the plan before carries on', async () => {
    const id = await createSubscription(mockDb, netflix, 999);
    await startPeriod(mockDb, id, 'change', '2026-05-15', { count: 1, unit: 'year' }, null);
    await renderSubscription(id);

    await fireEvent(screen.getByHintText('Long press to remove'), 'longPress');
    expect(screen.getByText('Remove this plan change?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
    expectNoDialog('Remove this plan change?');

    await waitFor(async () =>
      expect((await getSubscriptions(mockDb))[0].periods).toEqual([
        { start: '2026-01-15', cycle: { count: 1, unit: 'month' }, end: null },
      ])
    );
  });

  it('keeps it when told to', async () => {
    const id = await createSubscription(mockDb, netflix, 999);
    await startPeriod(mockDb, id, 'change', '2026-05-15', { count: 1, unit: 'year' }, null);
    await renderSubscription(id);

    await fireEvent(screen.getByHintText('Long press to remove'), 'longPress');
    await fireEvent.press(screen.getByRole('button', { name: 'Keep' }));
    expectNoDialog('Remove this plan change?');

    expect((await getSubscriptions(mockDb))[0].periods).toHaveLength(2);
  });
});

describe('restoring a backup', () => {
  /** A backup holding only Spotify, in dollars. */
  async function spotifyBackup() {
    const other = await createTestDb();
    await createSubscription(other, { ...netflix, name: 'Spotify', category: 'music' }, 1099);
    return serializeBackup(createBackup(await getSubscriptions(other), 'USD'));
  }

  async function pasteAndRestore(text: string) {
    await renderWithDialogs(<RestoreScreen />);
    await fireEvent.changeText(screen.getByPlaceholderText('{"app":"subtracker", …'), text);
    await fireEvent.press(screen.getByRole('button', { name: 'Restore' }));
  }

  it('replaces what is there when confirmed', async () => {
    await createSubscription(mockDb, netflix, 999);
    await pasteAndRestore(await spotifyBackup());

    expect(await screen.findByText('Replace 1 subscription?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Replace' }));
    expectNoDialog('Replace 1 subscription?');

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect((await getSubscriptions(mockDb)).map((s) => s.name)).toEqual(['Spotify']);
    expect(getCurrency()).toBe('USD');
  });

  it('keeps what is there when told to', async () => {
    await createSubscription(mockDb, netflix, 999);
    await pasteAndRestore(await spotifyBackup());

    await fireEvent.press(await screen.findByRole('button', { name: 'Keep mine' }));

    expectNoDialog('Replace 1 subscription?');

    expect(router.back).not.toHaveBeenCalled();
    expect((await getSubscriptions(mockDb)).map((s) => s.name)).toEqual(['Netflix']);
    expect(getCurrency()).toBe('EUR');
  });

  it("doesn't ask when there's nothing to replace", async () => {
    await pasteAndRestore(await spotifyBackup());

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect((await getSubscriptions(mockDb)).map((s) => s.name)).toEqual(['Spotify']);
  });
});

it("says so when an export can't be shared", async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(Share, 'share').mockRejectedValue(new Error('no share sheet'));
  await renderWithDialogs(<SettingsScreen />);

  await fireEvent.press(screen.getByRole('button', { name: 'Export backup' }));

  expect(await screen.findByText("Couldn't export")).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'OK' }));
  expectNoDialog("Couldn't export");
});
