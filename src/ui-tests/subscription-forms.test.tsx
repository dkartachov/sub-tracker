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
import PlanScreen from '@/app/subscription/plan';
import { addPriceChange, createSubscription, getSubscriptions, setCancelled, type SubscriptionInput } from '@/db/subscriptions';
import { finalEnd, paidPeriodEnd, withoutFinalEnd } from '@/lib/billing';
import { setCurrency } from '@/lib/currency';
import { addDays, addMonthsClamped, todayKey } from '@/lib/dates';
import { createTestDb } from '@/test-utils/sqlite';
import { NO_TAX } from '@/lib/tax';
import { taxRegionSetting } from '@/lib/tax-setting';

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
  kind: 'subscription',
  category: 'streaming',
  cycle: { count: 1, unit: 'month' },
  firstPaymentDate: '2026-01-15',
  isTrial: false,
  reminderDaysBefore: 3,
  chargeWindowDays: 0,
  renewsEarlyDays: 0,
  tax: NO_TAX,
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
  taxRegionSetting.set('');
});

it('adds a subscription from a suggestion, with a typed price', async () => {
  await renderScreen(<EditSubscriptionScreen />);

  await fireEvent.changeText(screen.getByPlaceholderText('Netflix, climbing gym…'), 'spot');
  await fireEvent.press(screen.getByText('Spotify'));
  await fireEvent.changeText(screen.getByPlaceholderText('12.99'), '10,99');
  await fireEvent.press(screen.getByText('Add subscription'));

  await waitFor(() => expect(router.back).toHaveBeenCalled());
  const [sub] = await getSubscriptions(mockDb);
  expect(sub).toMatchObject({ name: 'Spotify', category: 'music', periods: [{ cycle: { count: 1, unit: 'month' } }] });
  expect(sub.prices.map((p) => p.amount)).toEqual([1099]);
});

it('adds a bill from a suggestion, ending after a last payment, with no trial or intro price', async () => {
  mockParams = { kind: 'bill' };
  await renderScreen(<EditSubscriptionScreen />);

  expect(screen.getByText('New bill')).toBeTruthy();
  // Added from the Bills tab, so it's a bill: there's no switching it here.
  expect(screen.queryByText('Type')).toBeNull();
  expect(screen.queryByText('Free trial')).toBeNull();
  expect(screen.queryByText('Discounted first payment')).toBeNull();
  await fireEvent.changeText(screen.getByPlaceholderText('Mortgage, internet…'), 'mort');
  await fireEvent.press(screen.getByText('Mortgage'));
  await fireEvent.changeText(screen.getByPlaceholderText('12.99'), '2000');
  await fireEvent(screen.getByLabelText('Ends on a set day'), 'valueChange', true);
  expect(screen.getByText(/^\d+ payments, the last on /)).toBeTruthy();
  await fireEvent.press(screen.getByText('Add bill'));

  await waitFor(() => expect(router.back).toHaveBeenCalled());
  const [sub] = await getSubscriptions(mockDb);
  expect(sub).toMatchObject({ name: 'Mortgage', kind: 'bill', category: 'housing', isTrial: false });
  // The last payment starts 25 years out; it ends the day after.
  expect(finalEnd(sub)).toBe(addDays(addMonthsClamped(todayKey(), 12 * 25), 1));
});

it('keeps a bill a bill when editing, with the categories of bills', async () => {
  const id = await createSubscription(mockDb, { ...netflix, name: 'Internet', kind: 'bill', category: 'other' }, 4500);
  mockParams = { id: String(id) };
  await renderScreen(<EditSubscriptionScreen />);
  expect(await screen.findByText('Edit bill')).toBeTruthy();
  expect(screen.queryByText('Type')).toBeNull();
  expect(screen.queryByText('Streaming')).toBeNull();

  await fireEvent.press(screen.getByText('Utilities'));
  await fireEvent.press(screen.getByText('Save'));

  await waitFor(() => expect(router.back).toHaveBeenCalled());
  expect((await getSubscriptions(mockDb))[0]).toMatchObject({ kind: 'bill', category: 'utilities' });
});

it('ends a bill after its next payment by default', async () => {
  const id = await createSubscription(mockDb, { ...netflix, name: 'Rent', kind: 'bill', category: 'housing' }, 150000);
  mockParams = { id: String(id) };
  await renderScreen(<CancelScreen />);

  expect(await screen.findByText('End Rent')).toBeTruthy();
  await fireEvent.press(screen.getByText('Set end date'));

  await waitFor(() => expect(router.back).toHaveBeenCalled());
  const [sub] = await getSubscriptions(mockDb);
  // The last payment is the next one, so it ends the day after it.
  expect(finalEnd(sub)).toBe(addDays(paidPeriodEnd(withoutFinalEnd(sub), todayKey()), 1));
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
  expect(finalEnd(sub)).not.toBeNull();
  expect(finalEnd(sub)! >= '2026-01-15').toBe(true);
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
  expect(finalEnd(sub)).toMatch(/^\d{4}-\d{2}-15$/);
});

it("keeps a trial's first charge when cancelling on the day it converts", async () => {
  const today = todayKey();
  const id = await createSubscription(mockDb, { ...netflix, isTrial: true, firstPaymentDate: today }, 999);
  mockParams = { id: String(id) };
  await renderScreen(<CancelScreen />);

  // It already charged today, so the end of the paid period is picked, and Today warns.
  expect(await screen.findByText(/You keep access until/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Today'));
  expect(screen.getByText(/Today's €9\.99 charge won't be counted either/)).toBeTruthy();
  await fireEvent.press(screen.getByText('When paid period ends'));
  await fireEvent.press(screen.getByText('Mark cancelled'));

  await waitFor(() => expect(router.back).toHaveBeenCalled());
  const [sub] = await getSubscriptions(mockDb);
  expect(finalEnd(sub)! > today).toBe(true);
});

it("names a trial's first charge at the price on the day it converts", async () => {
  const converts = addDays(todayKey(), 10);
  const id = await createSubscription(mockDb, { ...netflix, isTrial: true, firstPaymentDate: converts }, 999);
  await addPriceChange(mockDb, id, 1299, converts);
  mockParams = { id: String(id) };
  await renderScreen(<CancelScreen />);

  expect(await screen.findByText(/the €12\.99 first charge won't be counted/)).toBeTruthy();
});

it("reopens a trial's cancellation on its conversion day as another day", async () => {
  const converts = addDays(todayKey(), 10);
  const id = await createSubscription(mockDb, { ...netflix, isTrial: true, firstPaymentDate: converts }, 999);
  await setCancelled(mockDb, id, converts);
  mockParams = { id: String(id) };
  await renderScreen(<CancelScreen />);

  expect(await screen.findByText(/A past day if you cancelled/)).toBeTruthy();
  expect(screen.queryByText(/You keep access until/)).toBeNull();
});

it('resumes a cancelled subscription from today at a new price', async () => {
  const id = await createSubscription(mockDb, netflix, 999);
  await setCancelled(mockDb, id, '2026-02-01');
  mockParams = { id: String(id), kind: 'resume' };
  await renderScreen(<PlanScreen />);

  await fireEvent.changeText(await screen.findByDisplayValue('9.99'), '11.99');
  await fireEvent.press(screen.getByText('Resume'));

  await waitFor(() => expect(router.back).toHaveBeenCalled());
  const [sub] = await getSubscriptions(mockDb);
  const today = todayKey();
  expect(sub.periods.map((p) => [p.start, p.end])).toEqual([
    ['2026-01-15', '2026-02-01'],
    [today, null],
  ]);
  expect(sub.prices.at(-1)).toEqual({ amount: 1199, effectiveDate: today });
});

it('changes plan to yearly, and not to the plan it already has', async () => {
  const id = await createSubscription(mockDb, netflix, 999);
  mockParams = { id: String(id), kind: 'change' };
  await renderScreen(<PlanScreen />);

  expect(await screen.findByText(/That's the current plan/)).toBeTruthy();
  await fireEvent.press(screen.getByText('year'));
  await fireEvent.changeText(screen.getByDisplayValue('9.99'), '99');
  await fireEvent.press(screen.getAllByText('Change plan').at(-1)!);

  await waitFor(() => expect(router.back).toHaveBeenCalled());
  const [sub] = await getSubscriptions(mockDb);
  expect(sub.periods).toHaveLength(2);
  expect(sub.periods[1]).toMatchObject({ cycle: { count: 1, unit: 'year' }, end: null });
  expect(sub.periods[0].end).toBe(sub.periods[1].start);
  expect(sub.prices.at(-1)!.amount).toBe(9900);
});

it('fills in the tax from the Settings region, which the form can change', async () => {
  setCurrency('CAD');
  taxRegionSetting.set('CA-ON');
  await renderScreen(<EditSubscriptionScreen />);
  expect(screen.getByDisplayValue('13')).toBeTruthy();

  await fireEvent.changeText(screen.getByPlaceholderText('Netflix, climbing gym…'), 'Crave');
  await fireEvent.changeText(screen.getByPlaceholderText('12.99'), '10');
  expect(screen.getByText('Price before tax (CAD)')).toBeTruthy();
  expect(screen.getByText(/\+ .*1\.30 tax: .*11\.30 charged/)).toBeTruthy();

  await fireEvent.changeText(screen.getByLabelText('Tax rate in percent'), '100');
  expect(screen.getByText(/rate under 100/)).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Tax rate in percent'), '14.975');

  await fireEvent.press(screen.getByText('Add subscription'));
  await waitFor(() => expect(router.back).toHaveBeenCalled());
  const [sub] = await getSubscriptions(mockDb);
  expect(sub.tax).toEqual({ rate: 14_975, included: false });
  expect(sub.prices[0].amount).toBe(1000);
});

it('saves how late a charge can land, offering only what fits the cycle', async () => {
  await renderScreen(<EditSubscriptionScreen />);

  await fireEvent.changeText(screen.getByPlaceholderText('Netflix, climbing gym…'), 'Coffee');
  await fireEvent.changeText(screen.getByPlaceholderText('12.99'), '18');
  await fireEvent.press(screen.getByText('Up to a week late'));
  expect(screen.getByText(/earliest day it charges/)).toBeTruthy();

  // A week is as long as a weekly cycle, so it falls back to the day.
  await fireEvent.press(screen.getByText('week'));
  expect(screen.queryByText('Up to a week late')).toBeNull();
  await fireEvent.press(screen.getByText('month'));

  await fireEvent.press(screen.getByText('Add subscription'));
  await waitFor(() => expect(router.back).toHaveBeenCalled());
  expect((await getSubscriptions(mockDb))[0].chargeWindowDays).toBe(7);
});

it('saves how early a yearly one renews, offered from longer cycles', async () => {
  await renderScreen(<EditSubscriptionScreen />);

  await fireEvent.changeText(screen.getByPlaceholderText('Netflix, climbing gym…'), 'example.com');
  await fireEvent.changeText(screen.getByPlaceholderText('12.99'), '10.34');
  expect(screen.queryByText('30 days early')).toBeNull();

  await fireEvent.press(screen.getByText('year'));
  await fireEvent.press(screen.getByText('30 days early'));
  expect(screen.getByText(/Each renewal is charged 30 days before the year it pays for begins: /)).toBeTruthy();

  await fireEvent.press(screen.getByText('Add subscription'));
  await waitFor(() => expect(router.back).toHaveBeenCalled());
  expect((await getSubscriptions(mockDb))[0].renewsEarlyDays).toBe(30);
});

it('adds one with a discounted first payment, renewing at the regular price', async () => {
  await renderScreen(<EditSubscriptionScreen />);

  await fireEvent.changeText(screen.getByPlaceholderText('Netflix, climbing gym…'), 'example.com');
  await fireEvent.changeText(screen.getByPlaceholderText('12.99'), '12');
  await fireEvent.press(screen.getByText('year'));
  await fireEvent(screen.getByLabelText('Discounted first payment'), 'valueChange', true);
  await fireEvent.changeText(screen.getByLabelText('First payment price'), '8');
  expect(screen.getByText(/^€8\.00 on .*, then €12\.00 from /)).toBeTruthy();

  await fireEvent.press(screen.getByText('Add subscription'));
  await waitFor(() => expect(router.back).toHaveBeenCalled());
  const [sub] = await getSubscriptions(mockDb);
  const today = todayKey();
  expect(sub.prices).toEqual([
    { amount: 800, effectiveDate: today },
    { amount: 1200, effectiveDate: `${Number(today.slice(0, 4)) + 1}${today.slice(4)}` },
  ]);
});
