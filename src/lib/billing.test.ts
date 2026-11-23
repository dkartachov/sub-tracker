import {
  formatCycleAdverb,
  monthlyEquivalent,
  nextPaymentOnOrAfter,
  paymentsBetween,
  priceOn,
  spentBetween,
  type Billing,
} from './billing';

const monthly: Billing = {
  firstPaymentDate: '2026-01-31',
  cycle: { count: 1, unit: 'month' },
  cancelledOn: null,
  prices: [{ amount: 999, effectiveDate: '2026-01-31' }],
};

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
    const cancelled = { ...monthly, cancelledOn: '2026-03-31' };
    expect(paymentsBetween(cancelled, '2026-01-01', '2026-12-31')).toEqual(['2026-01-31', '2026-02-28']);
  });

  it('handles multi-week cycles', () => {
    const biweekly: Billing = { ...monthly, firstPaymentDate: '2026-01-01', cycle: { count: 2, unit: 'week' } };
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
    expect(nextPaymentOnOrAfter({ ...monthly, cancelledOn: '2026-03-01' }, '2026-03-01')).toBeNull();
  });

  it('handles yearly plans across leap days', () => {
    const yearly: Billing = { ...monthly, firstPaymentDate: '2024-02-29', cycle: { count: 1, unit: 'year' } };
    expect(nextPaymentOnOrAfter(yearly, '2025-01-01')).toBe('2025-02-28');
    expect(nextPaymentOnOrAfter(yearly, '2028-01-01')).toBe('2028-02-29');
  });
});

describe('prices', () => {
  const raised: Billing = {
    ...monthly,
    prices: [
      { amount: 999, effectiveDate: '2026-01-31' },
      { amount: 1299, effectiveDate: '2026-03-15' },
    ],
  };

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
