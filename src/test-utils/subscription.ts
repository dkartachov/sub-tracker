import type { Subscription } from '@/db/subscriptions';
import type { Billing, Cycle, PriceChange } from '@/lib/billing';
import type { DateKey } from '@/lib/dates';

/** A subscription's billing as a single period, the way most tests think of it. */
export type SimpleBilling = {
  firstPaymentDate: DateKey;
  cycle: Cycle;
  cancelledOn: DateKey | null;
  prices: PriceChange[];
};

export function simpleBilling({ firstPaymentDate, cycle, cancelledOn, prices }: SimpleBilling): Billing {
  return { periods: [{ start: firstPaymentDate, cycle, end: cancelledOn }], prices };
}

export type SimpleSubscription = Omit<Subscription, 'periods' | 'paidCharges' | 'kind'> &
  SimpleBilling & { paidCharges?: DateKey[]; kind?: Subscription['kind'] };

/**
 * A subscription with one billing period, from its first payment, cycle and cancellation, and
 * nothing marked paid unless given. A subscription rather than a bill unless `kind` says otherwise.
 */
export function simpleSubscription({
  firstPaymentDate,
  cycle,
  cancelledOn,
  paidCharges = [],
  kind = 'subscription',
  ...rest
}: SimpleSubscription): Subscription {
  return { ...rest, kind, paidCharges, periods: [{ start: firstPaymentDate, cycle, end: cancelledOn }] };
}
