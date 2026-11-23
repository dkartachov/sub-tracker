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

export type SimpleSubscription = Omit<Subscription, 'periods'> & SimpleBilling;

/** A subscription with one billing period, from its first payment, cycle and cancellation. */
export function simpleSubscription({ firstPaymentDate, cycle, cancelledOn, ...rest }: SimpleSubscription): Subscription {
  return { ...rest, periods: [{ start: firstPaymentDate, cycle, end: cancelledOn }] };
}
