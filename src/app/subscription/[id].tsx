import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { CategoryBadge } from '@/components/category-badge';
import { showDialog } from '@/components/dialog';
import { PageHeader } from '@/components/page-header';
import { PressableScale } from '@/components/pressable-scale';
import { ScrollView } from '@/components/scroll-view';
import { InfoRow, Section } from '@/components/section';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { CATEGORY_INFO, KIND_WORDS } from '@/constants/categories';
import { Spacing } from '@/constants/theme';
import {
  chargeDueNow,
  chargesSoFar,
  currentPrice,
  deletePeriod,
  deletePriceChange,
  deleteSubscription,
  endsOn,
  expectedCharge,
  setCancelled,
  setChargePaid,
  spentSoFar,
  statusOf,
  trialWontConvert,
  typedPrice,
  useSubscription,
  type Subscription,
} from '@/db/subscriptions';
import { useTheme } from '@/hooks/use-theme';
import { useToday } from '@/hooks/use-today';
import {
  chargeOn,
  cycleOn,
  finalEnd,
  firstPaymentDate,
  formatCycle,
  formatChargeWindow,
  formatCycleAdverb,
  formatRenewsEarly,
  isDueNow,
  monthlyEquivalent,
  paymentsLeft,
  renewedCycleStart,
  stoppedSince,
  type BillingPeriod,
} from '@/lib/billing';
import { formatMoney, useCurrency } from '@/lib/currency';
import { haptic } from '@/lib/haptics';
import { formatTaxRate, taxOn } from '@/lib/tax';
import {
  addDays,
  daysBetween,
  formatDateKey,
  formatNearDay,
  formatShortDateRange,
  type DateKey,
} from '@/lib/dates';
import { RECENTLY_CONVERTED_DAYS } from '@/lib/spending';

/** "Dec 23", "Nov 25, tomorrow", "Nov 16 – 23": the day, and how near only for a single day that near. */
function dueDay(from: DateKey, to: DateKey, today: DateKey) {
  return [formatShortDateRange(from, to, today), formatNearDay(from, to, today)].filter(Boolean).join(', ');
}

/** Past charges shown before "Show all". */
const CHARGES_SHOWN = 6;

export default function SubscriptionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sub = useSubscription(Number(id));
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.five }]}>
      {sub === null && <ThemedText themeColor="textSecondary">This subscription no longer exists.</ThemedText>}
      {sub && <SubscriptionDetails sub={sub} />}
    </ScrollView>
  );
}

function SubscriptionDetails({ sub }: { sub: Subscription }) {
  const db = useSQLiteContext();
  const currency = useCurrency();
  const today = useToday();
  const money = (minor: number) => formatMoney(minor, currency);

  const status = statusOf(sub, today);
  const isBill = sub.kind === 'bill';
  const words = KIND_WORDS[sub.kind];
  const next = expectedCharge(sub, today);
  const ends = endsOn(sub, today);
  // For one ending on a set day (a mortgage paid off then), the charges still to come before it.
  const left = ends !== null && next !== null ? paymentsLeft(sub, next.date, ends) : [];
  const price = next?.amount ?? currentPrice(sub, today);
  const cycle = next?.cycle ?? cycleOn(sub, today);
  const stopped = stoppedSince(sub, today);
  const cancelledOn = finalEnd(sub);
  const firstPayment = firstPaymentDate(sub);
  const reminder = sub.reminderDaysBefore;
  const chargeWindow = sub.chargeWindowDays;
  // A charge billed around a day that may land any day now, which can be marked paid once it has.
  const dueNow = status === 'active' && next !== null && chargeDueNow(sub, next.date, today);
  // For one that renews early, when what's paid for runs out: the day the cycle the next charge renews begins.
  const paidUntil = status === 'active' && next !== null ? renewedCycleStart(sub, next.date) : null;

  const markPaid = async () => {
    if (!next) return;
    await setChargePaid(db, sub.id, next.date, true);
    haptic.success();
  };

  const editCancellation = () => router.push({ pathname: '/subscription/cancel', params: { id: String(sub.id) } });
  const startPlan = (kind: 'resume' | 'change') =>
    router.push({ pathname: '/subscription/plan', params: { id: String(sub.id), kind } });
  // A cancellation still ahead is simply undone; after it, resuming starts charging again from a chosen day.
  const resume = () => (cancelledOn !== null && cancelledOn > today ? setCancelled(db, sub.id, null) : startPlan('resume'));
  const canChangePlan = cancelledOn === null || cancelledOn > today;

  const remove = () =>
    showDialog({
      title: `Delete ${sub.name}?`,
      message: `Its price history goes too, and it drops out of what you spent. To keep that, ${isBill ? 'set an end date' : 'mark it cancelled'} instead.`,
      cancelLabel: 'Keep it',
      confirm: {
        label: 'Delete',
        onPress: async () => {
          await deleteSubscription(db, sub.id);
          router.back();
        },
      },
    });

  const removePriceChange = (effectiveDate: string, amount: number) =>
    showDialog({
      title: 'Remove this price change?',
      message: `${money(amount)} from ${formatDateKey(effectiveDate)}`,
      cancelLabel: 'Keep',
      confirm: { label: 'Remove', onPress: () => deletePriceChange(db, sub.id, effectiveDate) },
    });

  // Newest first, each with the price before it.
  const history = sub.prices.map((change, i) => ({ ...change, previous: sub.prices[i - 1]?.amount })).reverse();

  return (
    <>
      <View style={styles.hero}>
        <CategoryBadge category={sub.category} size={56} />
        <StatusPill status={status} kind={sub.kind} />
      </View>
      <PageHeader
        title={sub.name}
        eyebrow={isBill ? `Bill · ${CATEGORY_INFO[sub.category].label}` : CATEGORY_INFO[sub.category].label}
        eyebrowColor="textSecondary"
        subtitle={`${money(price)} per ${formatCycle(cycle)}`}
      />

      <TrialNotice sub={sub} today={today} />

      <Section
        title={isBill ? 'Payments' : 'Billing'}
        action={
          canChangePlan && (
            <PressableScale accessibilityRole="button" hitSlop={8} onPress={() => startPlan('change')}>
              <ThemedText type="smallBold" themeColor="tint">
                Change plan
              </ThemedText>
            </PressableScale>
          )
        }>
        {next && (
          <InfoRow
            label={status === 'trial' ? 'Trial ends' : status === 'cancelled' ? 'Resumes' : dueNow ? 'Due now' : words.next}
            value={
              status === 'trial'
                ? dueDay(next.date, next.date, today)
                : dueDay(next.date, next.latest, today)
            }
          />
        )}
        {dueNow && (
          <>
            <Button title="Mark as paid" variant="secondary" onPress={markPaid} />
            <ThemedText type="small" themeColor="textSecondary">
              {isBill ? 'Already paid?' : 'Already charged?'} Marking it paid stops it showing as due. Totals count it either way.
            </ThemedText>
          </>
        )}
        {paidUntil !== null && paidUntil !== next?.date && <InfoRow label="Paid until" value={formatDateKey(paidUntil)} />}
        {ends && <InfoRow label="Ends" value={dueDay(ends, ends, today)} />}
        {left.length > 0 && (
          <InfoRow
            label="Payments left"
            value={`${left.length} · last ${formatDateKey(left[left.length - 1])}`}
          />
        )}
        {stopped && <InfoRow label={words.cancelled} value={formatDateKey(stopped)} />}
        <InfoRow label={isBill ? 'Paid' : 'Billed'} value={formatCycleAdverb(cycle)} />
        {sub.renewsEarlyDays > 0 && <InfoRow label="Renews" value={formatRenewsEarly(sub.renewsEarlyDays)} />}
        {chargeWindow > 0 && <InfoRow label={isBill ? 'Payment day' : 'Charge day'} value={`Up to ${formatChargeWindow(chargeWindow)} late`} />}
        {sub.tax.rate > 0 && (
          <InfoRow
            label={sub.tax.included ? 'Tax included' : 'Tax added'}
            value={`${money(taxOn(typedPrice(sub, next?.date ?? today), sub.tax))} (${formatTaxRate(sub.tax.rate)})`}
          />
        )}
        {cycle.unit !== 'month' || cycle.count !== 1 ? (
          <InfoRow label="Per month" value={`≈ ${money(monthlyEquivalent(price, cycle))}`} />
        ) : (
          <InfoRow label="Per year" value={money(price * 12)} />
        )}
        <InfoRow label={sub.isTrial ? 'First charge' : 'First payment'} value={formatDateKey(firstPayment)} />
        <InfoRow
          label="Reminder"
          value={reminder === null ? 'Off' : reminder === 0 ? 'On the day' : `${reminder} ${reminder === 1 ? 'day' : 'days'} before`}
        />
      </Section>

      <Section title="Spent">
        <InfoRow label={`In ${today.slice(0, 4)}`} value={money(spentSoFar(sub, `${today.slice(0, 4)}-01-01`, today))} />
        <InfoRow label="All time" value={money(spentSoFar(sub, firstPayment, today))} />
      </Section>

      <ChargeHistory sub={sub} today={today} />

      <BillingHistory sub={sub} today={today} />

      <Section
        title="Price history"
        action={
          <PressableScale
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.push({ pathname: '/subscription/price-change', params: { id: String(sub.id) } })}>
            <ThemedText type="smallBold" themeColor="tint">
              Change price
            </ThemedText>
          </PressableScale>
        }>
        {history.map((change) => (
          <PressableScale
            key={change.effectiveDate}
            disabled={change.previous === undefined}
            accessibilityHint={change.previous === undefined ? undefined : 'Long press to remove'}
            onLongPress={() => removePriceChange(change.effectiveDate, change.amount)}
            style={styles.priceRow}>
            <View style={styles.priceText}>
              <ThemedText type="smallBold" style={styles.tabular}>
                {money(change.amount)}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {change.effectiveDate > today ? 'Upcoming, from' : 'Since'} {formatDateKey(change.effectiveDate)}
              </ThemedText>
            </View>
            {change.previous !== undefined && <PriceDelta from={change.previous} to={change.amount} />}
          </PressableScale>
        ))}
        {(history.length > 1 || (sub.tax.rate > 0 && !sub.tax.included)) && (
          <ThemedText type="small" themeColor="textSecondary">
            {[
              sub.tax.rate > 0 && !sub.tax.included && `Prices before the ${formatTaxRate(sub.tax.rate)} tax added on top.`,
              history.length > 1 && 'Long press a change to remove it.',
            ]
              .filter(Boolean)
              .join(' ')}
          </ThemedText>
        )}
      </Section>

      {sub.notes !== '' && (
        <Section title="Notes">
          <ThemedText>{sub.notes}</ThemedText>
        </Section>
      )}

      <View style={styles.actions}>
        <Button
          title="Edit"
          variant="secondary"
          onPress={() => router.push({ pathname: '/subscription/edit', params: { id: String(sub.id) } })}
        />
        {cancelledOn ? (
          <>
            <Button title={isBill ? 'Restart' : 'Resume'} variant="secondary" onPress={resume} />
            <Button title={isBill ? 'Change end date' : 'Change cancellation'} variant="secondary" onPress={editCancellation} />
          </>
        ) : (
          <Button title={isBill ? 'Set end date' : 'Mark cancelled'} variant="secondary" onPress={editCancellation} />
        )}
        <Button title="Delete" variant="destructive" onPress={remove} />
      </View>
    </>
  );
}

/**
 * While a trial runs, when to cancel by to avoid paying; just after it converts, that it did, in
 * case that went unnoticed. Nothing otherwise.
 */
function TrialNotice({ sub, today }: { sub: Subscription; today: DateKey }) {
  const theme = useTheme();
  const currency = useCurrency();
  if (!sub.isTrial || trialWontConvert(sub)) return null;

  const firstPayment = firstPaymentDate(sub);
  const firstCharge = chargeOn(sub, firstPayment);
  const amount = formatMoney(firstCharge.amount, currency);
  const daysLeft = daysBetween(today, firstPayment);

  let title: string;
  let body: string;
  if (daysLeft > 0) {
    const lastFreeDay = addDays(firstPayment, -1);
    title = daysLeft === 1 ? 'Last free day: cancel today to pay nothing' : `${daysLeft} free days left`;
    body = `It's free until ${formatDateKey(lastFreeDay)}. Unless you cancel by then, ${amount} is charged on ${formatDateKey(firstPayment)}.`;
  } else if (sub.periods.length === 1 && sub.periods[0].end === null && -daysLeft < RECENTLY_CONVERTED_DAYS) {
    title = 'Your free trial has ended';
    body = `It turned paid ${daysLeft === 0 ? 'today' : `on ${formatDateKey(firstPayment)}`}, at ${amount} per ${formatCycle(firstCharge.cycle)}. Cancel it if you didn't mean to keep it.`;
  } else {
    return null;
  }

  return (
    <Card style={{ backgroundColor: theme.trialSoft }}>
      <ThemedText type="smallBold" themeColor="trial">
        {title}
      </ThemedText>
      <ThemedText type="small">{body}</ThemedText>
    </Card>
  );
}

/**
 * Every charge paid so far, newest first: the latest few, then all on request. One due now that
 * hasn't landed isn't listed until it's marked paid or its last day passes. One marked paid while it
 * could still land says so, and a long press marks it not paid yet.
 */
function ChargeHistory({ sub, today }: { sub: Subscription; today: DateKey }) {
  const db = useSQLiteContext();
  const currency = useCurrency();
  const [showAll, setShowAll] = useState(false);
  const charges = chargesSoFar(sub, firstPaymentDate(sub), today).reverse();
  if (charges.length === 0) return null;
  const shown = showAll ? charges : charges.slice(0, CHARGES_SHOWN);
  // Only while it could still land does being marked paid change anything.
  const undoable = (date: DateKey) => sub.paidCharges.includes(date) && isDueNow(date, sub.chargeWindowDays, today);

  const unmark = (date: DateKey) =>
    showDialog({
      title: 'Mark as not paid yet?',
      message: `The charge from ${formatDateKey(date)} shows as due again until it lands.`,
      cancelLabel: 'Keep as paid',
      confirm: { label: 'Not paid yet', onPress: () => setChargePaid(db, sub.id, date, false) },
    });

  return (
    <Section
      title={`${sub.kind === 'bill' ? 'Payments' : 'Charges'} · ${charges.length}`}
      action={
        charges.length > CHARGES_SHOWN && (
          <PressableScale accessibilityRole="button" hitSlop={8} onPress={() => setShowAll((all) => !all)}>
            <ThemedText type="smallBold" themeColor="tint">
              {showAll ? 'Show fewer' : 'Show all'}
            </ThemedText>
          </PressableScale>
        )
      }>
      {shown.map((charge) =>
        undoable(charge.date) ? (
          <PressableScale
            key={charge.date}
            accessibilityHint="Long press to mark as not paid yet"
            onLongPress={() => unmark(charge.date)}>
            <InfoRow label={`${formatDateKey(charge.date)} · paid`} value={formatMoney(charge.amount, currency)} />
          </PressableScale>
        ) : (
          <InfoRow key={charge.date} label={formatDateKey(charge.date)} value={formatMoney(charge.amount, currency)} />
        )
      )}
    </Section>
  );
}

/**
 * The plans it's been on and the breaks between them, newest first, once there's more than one.
 * Long pressing a later period removes it: undoing a plan change, or a resume.
 */
function BillingHistory({ sub, today }: { sub: Subscription; today: DateKey }) {
  const db = useSQLiteContext();
  if (sub.periods.length < 2) return null;

  const describe = (period: BillingPeriod, i: number) => {
    const next = sub.periods[i + 1];
    const from = `${period.start > today ? 'From' : 'Since'} ${formatDateKey(period.start)}`;
    if (next && period.end === next.start) return `${from}, until the plan changed`;
    if (period.end === null) return from;
    const ended = `${from}, ${sub.kind === 'bill' ? 'ended' : 'cancelled'} ${formatDateKey(period.end)}`;
    return next ? `${ended}, resumed ${formatDateKey(next.start)}` : ended;
  };

  const remove = (period: BillingPeriod, i: number) => {
    const previous = sub.periods[i - 1];
    const what = previous.end === period.start ? 'plan change' : 'resume';
    showDialog({
      title: `Remove this ${what}?`,
      message:
        what === 'resume'
          ? `It goes back to being cancelled from ${formatDateKey(previous.end!)}. Price changes stay.`
          : 'The plan before it carries on instead. Price changes stay.',
      cancelLabel: 'Keep',
      confirm: { label: 'Remove', onPress: () => deletePeriod(db, sub.id, period.start) },
    });
  };

  const periods = sub.periods.map((period, i) => ({ period, i })).reverse();

  return (
    <Section title="Billing history">
      {periods.map(({ period, i }) => (
        <PressableScale
          key={period.start}
          disabled={i === 0}
          accessibilityHint={i === 0 ? undefined : 'Long press to remove'}
          onLongPress={() => remove(period, i)}
          style={styles.priceRow}>
          <View style={styles.priceText}>
            <ThemedText type="smallBold">{formatCycleAdverb(period.cycle)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {describe(period, i)}
            </ThemedText>
          </View>
        </PressableScale>
      ))}
      <ThemedText type="small" themeColor="textSecondary">
        Long press a later plan or a resume to remove it.
      </ThemedText>
    </Section>
  );
}

/** "+30%" in the danger color for a rise, "−10%" in the accent for a drop. */
function PriceDelta({ from, to }: { from: number; to: number }) {
  const theme = useTheme();
  const percent = Math.round(((to - from) / from) * 100);
  const rose = to > from;
  return (
    <ThemedText type="smallBold" style={[styles.tabular, { color: rose ? theme.danger : theme.tint }]}>
      {rose ? '+' : '−'}
      {Math.abs(percent)}%
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.screen,
    paddingTop: Spacing.two,
    gap: Spacing.four,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginBottom: -Spacing.two,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.one,
  },
  priceText: {
    flex: 1,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  actions: {
    gap: Spacing.twoAndHalf,
  },
});
