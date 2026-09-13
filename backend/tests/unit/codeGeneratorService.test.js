/* global jest, beforeEach, afterEach, describe, test, expect */
jest.mock('../../src/config/db', () => ({ pool: { query: jest.fn() } }));

const { pool } = require('../../src/config/db');
const CodeGeneratorService = require('../../src/services/business/CodeGeneratorService');
const { mapKeysToCamel } = require('../../src/utils/fieldMap');

const makeRule = (overrides = {}) => ({
  id: 10,
  business_type: 'inventory_outbound',
  name: '出库单',
  prefix: 'OUT',
  date_format: 'YYMMDD',
  separator: '',
  sequence_length: 3,
  reset_cycle: 'daily',
  initial_value: 1,
  step: 1,
  is_active: 1,
  ...overrides,
});

beforeEach(() => {
  pool.query.mockReset();
  jest.useFakeTimers().setSystemTime(new Date(2026, 8, 12, 10, 0, 0));
});

afterEach(() => jest.useRealTimers());

describe('compact document numbering', () => {
  test.each([
    ['YYMMDD', 'daily', '20260912', 'OUT260912001'],
    ['YYMM', 'monthly', '202609', 'OUT2609001'],
    ['YY', 'yearly', '2026', 'OUT26001'],
    ['', 'none', 'default', 'OUT001'],
  ])('previews %s without changing the existing counter period', async (dateFormat, cycle, period, code) => {
    pool.query
      .mockResolvedValueOnce([[makeRule({ date_format: dateFormat, reset_cycle: cycle })]])
      .mockResolvedValueOnce([[]]);

    await expect(CodeGeneratorService.previewCode('inventory_outbound')).resolves.toBe(code);
    expect(pool.query).toHaveBeenLastCalledWith(expect.stringContaining('SELECT current_value'), ['inventory_outbound', period]);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  test('continues the allocated sequence and returns the atomic result without reading another pool connection', async () => {
    pool.query
      .mockResolvedValueOnce([[makeRule()]])
      .mockResolvedValueOnce([{ affectedRows: 2, insertId: 2 }]);

    await expect(CodeGeneratorService.nextCode('inventory_outbound')).resolves.toBe('OUT260912002');
    expect(pool.query).toHaveBeenLastCalledWith(expect.stringContaining('LAST_INSERT_ID(current_value + ?)'), ['inventory_outbound', '20260912', 1, 1]);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  test('uses the configured start for a new period, not the sequence table primary key', async () => {
    const rule = makeRule({ initial_value: 7, step: 2 });
    pool.query
      .mockResolvedValueOnce([[rule]])
      .mockResolvedValueOnce([{ affectedRows: 1, insertId: 412 }])
      .mockResolvedValueOnce([[rule]])
      .mockResolvedValueOnce([[]]);

    await expect(CodeGeneratorService.nextCode('inventory_outbound')).resolves.toBe('OUT260912007');
    await expect(CodeGeneratorService.previewCode('inventory_outbound')).resolves.toBe('OUT260912007');
  });

  test('previews the next value from the existing counter', async () => {
    pool.query
      .mockResolvedValueOnce([[makeRule({ initial_value: 7, step: 2 })]])
      .mockResolvedValueOnce([[{ current_value: 9 }]]);

    await expect(CodeGeneratorService.previewCode('inventory_outbound')).resolves.toBe('OUT260912011');
  });

  test('retains overflow digits instead of wrapping or truncating to a duplicate code', async () => {
    pool.query
      .mockResolvedValueOnce([[makeRule()]])
      .mockResolvedValueOnce([{ affectedRows: 2, insertId: 1000 }]);

    await expect(CodeGeneratorService.nextCode('inventory_outbound')).resolves.toBe('OUT2609121000');
  });

  test('keeps the date and counter period consistent when allocation crosses midnight', async () => {
    jest.setSystemTime(new Date(2026, 8, 12, 23, 59, 59));
    pool.query.mockResolvedValueOnce([[makeRule()]]).mockImplementationOnce(async () => {
      jest.setSystemTime(new Date(2026, 8, 13, 0, 0, 0));
      return [{ affectedRows: 2, insertId: 2 }];
    });

    await expect(CodeGeneratorService.nextCode('inventory_outbound')).resolves.toBe('OUT260912002');
    expect(pool.query.mock.calls[1][1][1]).toBe('20260912');
  });

  test('uses the caller transaction when supplied', async () => {
    const connection = {
      query: jest.fn().mockResolvedValueOnce([[makeRule()]]).mockResolvedValueOnce([{ affectedRows: 1, insertId: 20 }]),
    };

    await expect(CodeGeneratorService.nextCode('inventory_outbound', connection)).resolves.toBe('OUT260912001');
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('does not allocate when the rule is missing or disabled', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    await expect(CodeGeneratorService.nextCode('inventory_outbound')).rejects.toThrow('编码规则未配置');
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});

describe('coding rule configuration and API previews', () => {
  test('creates compact daily rules by default', async () => {
    pool.query.mockResolvedValueOnce([{ insertId: 10 }]).mockResolvedValueOnce([[makeRule()]]);

    await CodeGeneratorService.createRule({ business_type: 'inventory_outbound', name: '出库单', prefix: 'OUT' });

    expect(pool.query.mock.calls[0][1]).toEqual(['inventory_outbound', '出库单', 'OUT', 'YYMMDD', '', 3, 'daily', 1, 1, null, 1]);
  });

  test('preserves an empty separator, no date and a zero start on save', async () => {
    const rule = makeRule({ date_format: '', initial_value: 0, reset_cycle: 'none' });
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([[rule]]);

    await CodeGeneratorService.updateRule(10, rule);

    expect(pool.query.mock.calls[0][1]).toEqual(['出库单', 'OUT', '', '', 3, 'none', 0, 1, null, 1, 10]);
  });

  test('returns visible previews across the HTTP field mapping and honors the requested page size', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 57 }]])
      .mockResolvedValueOnce([[
        makeRule({ _seq_current: 1 }),
        makeRule({ id: 11, prefix: 'CT', date_format: 'YY', _seq_current: null, initial_value: 7, step: 2 }),
      ]]);

    const response = mapKeysToCamel(await CodeGeneratorService.getRules({ page: 1, page_size: 100 }));

    expect(response.total).toBe(57);
    expect(response.pageSize).toBe(100);
    expect(response.list.map(rule => rule.preview)).toEqual(['OUT260912002', 'CT26007']);
    expect(response.list[0]).not.toHaveProperty('_seq_current');
    expect(pool.query.mock.calls[1][0]).toContain('LIMIT 100 OFFSET 0');
  });
});
