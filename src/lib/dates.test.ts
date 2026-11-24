import { formatNearDay, formatShortDateRange, formatUpcomingWindow, isWithinRange } from './dates';

const TODAY = '2026-11-10';

describe('formatShortDateRange', () => {
  it('is one day when both ends are', () => {
    expect(formatShortDateRange('2026-11-16', '2026-11-16', TODAY)).toBe('Nov 16');
  });

  it('spans the days, with the year outside this one', () => {
    expect(formatShortDateRange('2026-11-16', '2026-11-23', TODAY)).toBe('Nov 16 – 23');
    expect(formatShortDateRange('2026-11-28', '2026-12-05', TODAY)).toBe('Nov 28 – Dec 5');
    expect(formatShortDateRange('2027-01-16', '2027-01-23', TODAY)).toBe('Jan 16 – 23, 2027');
  });
});

describe('formatUpcomingWindow', () => {
  it('is the usual phrase for a single day', () => {
    expect(formatUpcomingWindow('2026-11-11', '2026-11-11', TODAY)).toBe('tomorrow');
  });

  it('counts the days to both ends while it is ahead', () => {
    expect(formatUpcomingWindow('2026-11-13', '2026-11-20', TODAY)).toBe('in 3–10 days');
  });

  it('gives the last day once it may land any day', () => {
    expect(formatUpcomingWindow('2026-11-08', '2026-11-15', TODAY)).toBe('by Nov 15');
    expect(formatUpcomingWindow('2026-11-10', '2026-11-11', TODAY)).toBe('by tomorrow');
    expect(formatUpcomingWindow('2026-11-03', '2026-11-10', TODAY)).toBe('today at the latest');
  });

  it('gives the dates when they are further ahead', () => {
    expect(formatUpcomingWindow('2026-12-16', '2026-12-23', TODAY)).toMatch(/^Dec 16/);
  });
});

describe('formatNearDay', () => {
  it('says today or tomorrow for a day that close, nothing further out', () => {
    expect(formatNearDay('2026-11-10', '2026-11-10', TODAY)).toBe('today');
    expect(formatNearDay('2026-11-11', '2026-11-11', TODAY)).toBe('tomorrow');
    expect(formatNearDay('2026-11-12', '2026-11-12', TODAY)).toBeNull();
  });

  it('says nothing for a range, even near its ends', () => {
    expect(formatNearDay('2026-11-11', '2026-11-18', TODAY)).toBeNull();
    expect(formatNearDay('2026-11-04', '2026-11-11', TODAY)).toBeNull();
    expect(formatNearDay('2026-11-03', '2026-11-10', TODAY)).toBeNull();
  });
});

describe('isWithinRange', () => {
  it('is inside from the first day to the last, both included', () => {
    expect(['2026-11-20', '2026-11-21', '2026-11-25', '2026-11-28', '2026-11-29'].map((today) => isWithinRange('2026-11-21', '2026-11-28', today))).toEqual([
      false,
      true,
      true,
      true,
      false,
    ]);
  });

  it('is never inside a single day, which is no range', () => {
    expect(isWithinRange('2026-11-21', '2026-11-21', '2026-11-21')).toBe(false);
  });
});
