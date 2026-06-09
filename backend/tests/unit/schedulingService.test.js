const SchedulingService = require('../../src/services/business/SchedulingService');

function formatLocalMinute(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

describe('SchedulingService calendar handling', () => {
  const calendar = {
    work_start: '08:00:00',
    work_end: '17:00:00',
    break_start: '12:00:00',
    break_end: '13:00:00',
    dinner_start: null,
    dinner_end: null,
    exclude_weekends: 1,
  };

  test('skips an override rest day when advancing work minutes', () => {
    const overrides = new Map([
      ['2026-06-09', { is_workday: 0 }],
    ]);

    const end = SchedulingService._advanceWorkMinutes(
      new Date(2026, 5, 9, 8, 0, 0),
      60,
      calendar,
      overrides
    );

    expect(formatLocalMinute(end)).toBe('2026-06-10 09:00');
  });

  test('uses custom work hours from a workday override', () => {
    const overrides = new Map([
      ['2026-06-09', {
        is_workday: 1,
        work_start: '10:00:00',
        work_end: '12:00:00',
        break_start: null,
        break_end: null,
        dinner_start: null,
        dinner_end: null,
      }],
    ]);

    const end = SchedulingService._advanceWorkMinutes(
      new Date(2026, 5, 9, 8, 0, 0),
      90,
      calendar,
      overrides
    );

    expect(formatLocalMinute(end)).toBe('2026-06-09 11:30');
  });

  test('parses SQL date-only and datetime values as local calendar time', () => {
    expect(formatLocalMinute(SchedulingService._parseScheduleDateTime('2026-06-09'))).toBe('2026-06-09 00:00');
    expect(formatLocalMinute(SchedulingService._parseScheduleDateTime('2026-06-09 08:30:00'))).toBe('2026-06-09 08:30');
    expect(SchedulingService._parseScheduleDateTime('2026-02-30')).toBeNull();
  });
});
