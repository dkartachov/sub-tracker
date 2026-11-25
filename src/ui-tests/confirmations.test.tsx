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
import TaxRegionScreen from '@/app/tax-region';
import SubscriptionScreen from '@/app/subscription/[id]';
import { DialogHost } from '@/components/dialog';
import { TaxRateCheck } from '@/components/tax-rate-check';
import {
  addPriceChange,
  createSubscription,
  getSubscriptions,
  setCancelled,
  setChargePaid,
  startPeriod,
  type SubscriptionInput,
} from '@/db/subscriptions';
import { createBackup, serializeBackup } from '@/lib/backup';
import { getCurrency, setCurrency } from '@/lib/currency';
import { addDays, todayKey } from '@/lib/dates';
import { createTestDb } from '@/test-utils/sqlite';
import { NO_TAX } from '@/lib/tax';
import { appliedTaxSetting, taxRegionSetting } from '@/lib/tax-setting';

let mockDb: SQLiteDatabase;
let mockParams: Record<string, string> = {};

jest.mock('expo-sqlite', () => ({
  useSQLiteContext: () => mockDb,
  addDatabaseChangeListener: () => ({ remove() {} }),
}));

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => mockParams,
  usePathname: () => '/',
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
  chargeWindowDays: 0,
  tax: NO_TAX,
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

describe('after an app update changes the region tax rate', () => {
  const oldRate = { rate: 22_000, included: true };

  beforeEach(() => {
    taxRegionSetting.set('EE');
    appliedTaxSetting.set(oldRate);
  });
  afterEach(() => {
    taxRegionSetting.set('');
    appliedTaxSetting.set(null);
  });

  it('moves the subscriptions on the old rate over, leaving ones with their own', async () => {
    await createSubscription(mockDb, { ...netflix, tax: oldRate }, 999);
    await createSubscription(mockDb, { ...netflix, name: 'Spotify', tax: oldRate }, 1099);
    await createSubscription(mockDb, { ...netflix, name: 'Gym', tax: { rate: 9_000, included: true } }, 3000);

    await renderWithDialogs(<TaxRateCheck />);
    expect(await screen.findByText('Tax rate changed')).toBeTruthy();
    expect(screen.getByText(/Estonia's VAT is now 24%/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Update 2'));

    await waitFor(async () =>
      expect((await getSubscriptions(mockDb)).map((sub) => [sub.name, sub.tax.rate])).toEqual([
        ['Gym', 9_000],
        ['Netflix', 24_000],
        ['Spotify', 24_000],
      ])
    );
    expect(appliedTaxSetting.get()).toEqual({ rate: 24_000, included: true });
  });

  it('asks only once, keeping the old rate when told to', async () => {
    await createSubscription(mockDb, { ...netflix, tax: oldRate }, 999);

    const { unmount } = await renderWithDialogs(<TaxRateCheck />);
    await fireEvent.press(await screen.findByText('Keep them'));
    expect((await getSubscriptions(mockDb))[0].tax).toEqual(oldRate);
    await unmount();

    await renderWithDialogs(<TaxRateCheck />);
    expect(screen.queryByText('Tax rate changed')).toBeNull();
  });
});

describe('picking a tax region', () => {
  afterEach(() => {
    taxRegionSetting.set('');
    appliedTaxSetting.set(null);
  });

  it('sets it and offers to move subscriptions without tax over', async () => {
    await createSubscription(mockDb, netflix, 999);
    await renderWithDialogs(<TaxRegionScreen />);

    await fireEvent.press(screen.getByText('Canada: Québec'));
    expect(taxRegionSetting.get()).toBe('CA-QC');
    expect(router.back).toHaveBeenCalled();
    await fireEvent.press(await screen.findByText('Update it'));

    await waitFor(async () =>
      expect((await getSubscriptions(mockDb))[0].tax).toEqual({ rate: 14_975, included: false })
    );
  });
});

it('marks the selected tax region, for screen readers too', async () => {
  taxRegionSetting.set('CA-QC');
  await renderWithDialogs(<TaxRegionScreen />);

  expect(screen.getByText('Selected: Canada: Québec')).toBeTruthy();
  expect(screen.getAllByRole('radio', { selected: true })).toHaveLength(1);
  expect(screen.getByRole('radio', { name: /Canada: Québec/ })).toBeSelected();
  expect(screen.getByRole('radio', { name: /^No tax/ })).not.toBeSelected();
  taxRegionSetting.set('');
});

describe('marking a charge paid', () => {
  // Billed two days ago, landing up to a week late, so it's due now.
  const coffee = (): SubscriptionInput => ({ ...netflix, firstPaymentDate: addDays(todayKey(), -2), chargeWindowDays: 7 });

  it('marks the charge due now as paid', async () => {
    const id = await createSubscription(mockDb, coffee(), 1800);
    await renderSubscription(id);
    expect(screen.getByText('Due now')).toBeTruthy();
    // Not paid yet, so not among the charges or in what's been spent.
    expect(screen.queryByText('Charges · 1')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Mark as paid' }));
    await waitFor(async () => expect((await getSubscriptions(mockDb))[0].paidCharges).toEqual([addDays(todayKey(), -2)]));
  });

  it('no longer shows a paid one as due, and a long press on it in the charges marks it not paid', async () => {
    const id = await createSubscription(mockDb, coffee(), 1800);
    await setChargePaid(mockDb, id, addDays(todayKey(), -2), true);
    await renderSubscription(id);
    expect(screen.queryByText('Due now')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark as paid' })).toBeNull();

    await fireEvent(screen.getByText(/· paid$/), 'longPress');
    expect(screen.getByText('Mark as not paid yet?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Not paid yet' }));
    expectNoDialog('Mark as not paid yet?');
    await waitFor(async () => expect((await getSubscriptions(mockDb))[0].paidCharges).toEqual([]));
  });

  it('keeps it paid when told to', async () => {
    const id = await createSubscription(mockDb, coffee(), 1800);
    await setChargePaid(mockDb, id, addDays(todayKey(), -2), true);
    await renderSubscription(id);

    await fireEvent(screen.getByText(/· paid$/), 'longPress');
    await fireEvent.press(screen.getByRole('button', { name: 'Keep as paid' }));
    expectNoDialog('Mark as not paid yet?');
    expect((await getSubscriptions(mockDb))[0].paidCharges).toHaveLength(1);
  });

  it("isn't offered for a charge on an exact day", async () => {
    const id = await createSubscription(mockDb, { ...coffee(), chargeWindowDays: 0 }, 1800);
    await renderSubscription(id);
    expect(screen.queryByRole('button', { name: 'Mark as paid' })).toBeNull();
  });
});
