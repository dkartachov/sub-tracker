import { moneyInputText, parseMoney } from './currency';

describe('parseMoney', () => {
  it('reads dots, commas and whole amounts', () => {
    expect(parseMoney('12.99')).toBe(1299);
    expect(parseMoney('12,5')).toBe(1250);
    expect(parseMoney(' 40 ')).toBe(4000);
    expect(parseMoney('0.1')).toBe(10);
  });

  it('rejects anything else', () => {
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('0')).toBeNull();
    expect(parseMoney('-5')).toBeNull();
    expect(parseMoney('1.999')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
  });

  it('reads back what it writes', () => {
    expect(parseMoney(moneyInputText(1299))).toBe(1299);
  });
});
