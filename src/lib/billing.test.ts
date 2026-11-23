import {
  chargesBetween,
  chargesOn,
  cycleOn,
  endsAfter,
  newPeriodProblem,
  formatCycleAdverb,
  monthlyEquivalent,
  nextPaymentOnOrAfter,
  paidPeriodEnd,
  paymentsBetween,
  priceOn,
  spentBetween,
  stoppedSince,
  type Billing,
} from './billing';
import { simpleBilling, type SimpleBilling } from '@/test-utils/subscription';

const monthlyPlan: SimpleBilling = {
  firstPaymentDate: '2026-01-31',
  cycle: { count: 1, unit: 'month' },
  cancelledOn: null,
  prices: [{ amount: 999, effectiveDate: '2026-01-31' }],
};
const monthly = simpleBilling(monthlyPlan);
/** The monthly plan with some of it changed. */
const plan = (changes: Partial<SimpleBilling>): Billing => simpleBilling({ ...monthlyPlan, ...changes });

describe('paymentsBetween', () => {
  it('keeps the day of the month, clamped to shorter months', () => {
    expect(paymentsBetween(monthly, '2026-01-01', '2026-05-31')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ]);
  });

  it('finds charges years after the first payment', () => {
    expect(paymentsBetween(monthly, '2040-02-01', '2040-03-31')).toEqual(['2040-02-29', '2040-03-31']);
  });

  it('stops at the cancellation', () => {
    const cancelled = plan({ cancelledOn: '2026-03-31' });
    expect(paymentsBetween(cancelled, '2026-01-01', '2026-12-31')).toEqual(['2026-01-31', '2026-02-28']);
  });

  it('handles multi-week cycles', () => {
    const biweekly = plan({ firstPaymentDate: '2026-01-01', cycle: { count: 2, unit: 'week' } });
    expect(paymentsBetween(biweekly, '2026-01-10', '2026-02-15')).toEqual(['2026-01-15', '2026-01-29', '2026-02-12']);
  });
});

describe('nextPaymentOnOrAfter', () => {
  it('includes a charge on the day itself', () => {
    expect(nextPaymentOnOrAfter(monthly, '2026-02-28')).toBe('2026-02-28');
    expect(nextPaymentOnOrAfter(monthly, '2026-03-01')).toBe('2026-03-31');
  });

  it('is the first payment before it', () => {
    expect(nextPaymentOnOrAfter(monthly, '2025-06-01')).toBe('2026-01-31');
  });

  it('is null once cancelled', () => {
    expect(nextPaymentOnOrAfter(plan({ cancelledOn: '2026-03-01' }), '2026-03-01')).toBeNull();
  });

  it('handles yearly plans across leap days', () => {
    const yearly = plan({ firstPaymentDate: '2024-02-29', cycle: { count: 1, unit: 'year' } });
    expect(nextPaymentOnOrAfter(yearly, '2025-01-01')).toBe('2025-02-28');
    expect(nextPaymentOnOrAfter(yearly, '2028-01-01')).toBe('2028-02-29');
  });
});

describe('prices', () => {
  const raised = plan({
    prices: [
      { amount: 999, effectiveDate: '2026-01-31' },
      { amount: 1299, effectiveDate: '2026-03-15' },
    ],
  });

  it('charges the price in effect on each day', () => {
    expect(priceOn(raised.prices, '2026-02-28')).toBe(999);
    expect(priceOn(raised.prices, '2026-03-15')).toBe(1299);
    expect(spentBetween(raised, '2026-01-01', '2026-04-30')).toBe(999 + 999 + 1299 + 1299);
  });

  it('uses the first price before the first change', () => {
    expect(priceOn(raised.prices, '2020-01-01')).toBe(999);
  });
});

describe('monthlyEquivalent', () => {
  it('spreads longer cycles over the months', () => {
    expect(monthlyEquivalent(12000, { count: 1, unit: 'year' })).toBe(1000);
    expect(monthlyEquivalent(3000, { count: 3, unit: 'month' })).toBe(1000);
    expect(monthlyEquivalent(700, { count: 1, unit: 'week' })).toBeCloseTo(3043.75);
  });
});

it('names cycles', () => {
  expect(formatCycleAdverb({ count: 1, unit: 'month' })).toBe('Monthly');
  expect(formatCycleAdverb({ count: 3, unit: 'month' })).toBe('Every 3 months');
});

describe('paidPeriodEnd', () => {
  it('is the next charge on a day without one', () => {
    expect(paidPeriodEnd(monthly, '2026-02-10')).toBe('2026-02-28');
  });

  it("is the charge after today's on a charge day, so today's is kept", () => {
    expect(paidPeriodEnd(monthly, '2026-02-28')).toBe('2026-03-31');
  });

  it('ignores a cancellation', () => {
    expect(paidPeriodEnd(plan({ cancelledOn: '2026-02-01' }), '2026-02-10')).toBe('2026-02-28');
  });
});

describe('chargesOn', () => {
  it('is true only on charge days, cancellation aside', () => {
    expect(chargesOn(monthly, '2026-02-28')).toBe(true);
    expect(chargesOn(monthly, '2026-02-27')).toBe(false);
    expect(chargesOn(plan({ cancelledOn: '2026-02-28' }), '2026-02-28')).toBe(true);
  });
});

describe('billing periods', () => {
  const month = { count: 1, unit: 'month' } as const;
  const year = { count: 1, unit: 'year' } as const;
  const prices = [{ amount: 1000, effectiveDate: '2026-01-10' }];

  // Cancelled from Mar 10, resumed on May 20.
  const resumed: Billing = {
    periods: [
      { start: '2026-01-10', cycle: month, end: '2026-03-10' },
      { start: '2026-05-20', cycle: month, end: null },
    ],
    prices,
  };

  // Monthly, then yearly from Apr 1.
  const switched: Billing = {
    periods: [
      { start: '2026-01-10', cycle: month, end: '2026-04-01' },
      { start: '2026-04-01', cycle: year, end: null },
    ],
    prices: [...prices, { amount: 10000, effectiveDate: '2026-04-01' }],
  };

  it('charges nothing between a cancellation and a resume', () => {
    expect(paymentsBetween(resumed, '2026-01-01', '2026-07-31')).toEqual([
      '2026-01-10',
      '2026-02-10',
      '2026-05-20',
      '2026-06-20',
      '2026-07-20',
    ]);
    expect(nextPaymentOnOrAfter(resumed, '2026-03-10')).toBe('2026-05-20');
  });

  it('counts from the resume day, not the old one', () => {
    expect(nextPaymentOnOrAfter(resumed, '2027-01-01')).toBe('2027-01-20');
  });

  it('keeps the old cycle for charges before a plan change', () => {
    expect(chargesBetween(switched, '2026-01-01', '2027-12-31')).toEqual([
      { date: '2026-01-10', amount: 1000, cycle: month },
      { date: '2026-02-10', amount: 1000, cycle: month },
      { date: '2026-03-10', amount: 1000, cycle: month },
      { date: '2026-04-01', amount: 10000, cycle: year },
      { date: '2027-04-01', amount: 10000, cycle: year },
    ]);
  });

  it('knows which plan and status each day is in', () => {
    expect(cycleOn(switched, '2026-03-31')).toEqual(month);
    expect(cycleOn(switched, '2026-04-01')).toEqual(year);
    expect(stoppedSince(resumed, '2026-04-01')).toBe('2026-03-10');
    expect(stoppedSince(resumed, '2026-05-20')).toBeNull();
    expect(stoppedSince(switched, '2026-04-01')).toBeNull();
  });

  it('follows a plan change to find when it ends', () => {
    const ending: Billing = { ...switched, periods: [switched.periods[0], { ...switched.periods[1], end: '2027-04-01' }] };
    expect(endsAfter(ending, '2026-02-01')).toBe('2027-04-01');
    expect(endsAfter(switched, '2026-02-01')).toBeNull();
  });

  it('checks where a new period can start', () => {
    expect(newPeriodProblem(resumed, 'resume', '2026-06-01')).toMatch("hasn't been cancelled");
    expect(newPeriodProblem(simpleBilling({ ...monthlyPlan, cancelledOn: '2026-03-01' }), 'resume', '2026-02-01')).toMatch('on or after');
    expect(newPeriodProblem(simpleBilling({ ...monthlyPlan, cancelledOn: '2026-03-01' }), 'resume', '2026-03-01')).toBeNull();
    expect(newPeriodProblem(monthly, 'change', '2026-01-31')).toMatch('after the current plan started');
    expect(newPeriodProblem(monthly, 'change', '2026-06-01')).toBeNull();
  });
});
