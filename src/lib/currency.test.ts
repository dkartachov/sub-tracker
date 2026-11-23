import { formatMoney, moneyInputText, parseMoney } from './currency';

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

describe('currencies without cents', () => {
  it('reads whole amounts only, with thousands separators', () => {
    expect(parseMoney('980', 'JPY')).toBe(98000);
    expect(parseMoney('1,200', 'JPY')).toBe(120000);
    expect(parseMoney('1.200', 'JPY')).toBe(120000);
    expect(parseMoney('9.80', 'JPY')).toBeNull();
    expect(parseMoney('0', 'JPY')).toBeNull();
  });

  it('shows and edits whole amounts', () => {
    expect(formatMoney(98000, 'JPY')).not.toMatch(/[.,]\d{2}$/);
    expect(formatMoney(98000, 'JPY')).toMatch(/980/);
    expect(moneyInputText(98000, 'JPY')).toBe('980');
    expect(parseMoney(moneyInputText(98000, 'JPY'), 'JPY')).toBe(98000);
  });

  it('leaves other currencies with cents', () => {
    expect(formatMoney(1299, 'EUR')).toMatch(/12[.,]99/);
    expect(formatMoney(1200, 'EUR', { compact: true })).not.toMatch(/[.,]00/);
  });
});
