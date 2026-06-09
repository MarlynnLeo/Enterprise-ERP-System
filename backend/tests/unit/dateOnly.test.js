const { isValidDateOnly, getMonthRange } = require('../../src/utils/dateOnly');

describe('dateOnly utilities', () => {
  test('validates date-only strings without timezone conversion', () => {
    expect(isValidDateOnly('2026-06-01')).toBe(true);
    expect(isValidDateOnly('2026-02-29')).toBe(false);
    expect(isValidDateOnly('2024-02-29')).toBe(true);
    expect(isValidDateOnly('2026-13-01')).toBe(false);
    expect(isValidDateOnly('2026-06-31')).toBe(false);
  });

  test('builds month ranges with the correct last day', () => {
    expect(getMonthRange('2026-06')).toEqual({ start: '2026-06-01', end: '2026-06-30' });
    expect(getMonthRange('2024-02')).toEqual({ start: '2024-02-01', end: '2024-02-29' });
    expect(getMonthRange('2026-13')).toBeNull();
  });
});
