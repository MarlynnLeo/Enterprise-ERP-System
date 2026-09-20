/* global beforeEach, describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn() } }));

const { pool } = require('../../src/config/db');
const SalaryService = require('../../src/services/business/hr/salaryService');

describe('salary calculation preserves configured amounts and full attendance rules', () => {
  let connection;
  let attendance;
  let rules;
  const calculatedRow = () => connection.query.mock.calls.find(([sql]) => /INSERT INTO hr_salary_records/.test(sql))[1][0][0];

  beforeEach(() => {
    attendance = {
      id: 1, employee_id: 10, base_salary: 3000, days_in_month: 30,
      overtime_rate: 0, position_allowance: 0, housing_allowance: 0, meal_allowance: 0,
      split_base_salary: 0, insurance_type: '无社无公', overtime_hours: 2,
      late_count: 0, missing_punch_count: 0, leave_days: 0,
    };
    rules = [];
    connection = {
      beginTransaction: jest.fn().mockResolvedValue(), commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(), release: jest.fn(),
      query: jest.fn(async (sql) => {
        if (/FROM hr_attendance_rules/.test(sql)) return [rules];
        if (/FROM hr_attendance a/.test(sql)) return [[attendance]];
        if (/SELECT employee_id FROM hr_salary_records/.test(sql)) return [[]];
        return [{ affectedRows: 1 }];
      }),
    };
    pool.getConnection.mockResolvedValue(connection);
  });

  test('zero allowances, overtime rate and split base are real configuration values', async () => {
    await SalaryService.calculatePeriodSalary('2026-09');
    const row = calculatedRow();
    expect(row.slice(5, 8)).toEqual([0, 0, 0]);
    expect(row.slice(10, 13)).toEqual([0, 0, 0]);
    expect(row[20]).toBe(3100);
    expect(JSON.parse(row[22])['基本工资.1']).toBe('0.00');
  });

  test('leave disqualifies full attendance even when minor lateness is permitted', async () => {
    attendance.leave_days = 1;
    attendance.late_count = 1;
    rules = [{ rule_key: 'late_cancel_allowance', rule_value: '{"cancel":false}' }];
    await SalaryService.calculatePeriodSalary('2026-09');
    expect(calculatedRow()[13]).toBe(0);
  });

  test('a configured zero late fine stays zero', async () => {
    attendance.late_count = 1;
    rules = [{ rule_key: 'late_fine_tier1', rule_value: '{"fine":0}' }];
    await SalaryService.calculatePeriodSalary('2026-09');
    expect(calculatedRow()[15]).toBeCloseTo(0);
  });
});
