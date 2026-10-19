jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/utils/userUtils', () => ({ resolveActorUserId: jest.fn().mockResolvedValue(99) }));

const GLService = require('../../src/services/finance/GLService');
const { normalizeEntryMetadata, normalizeEntryItems, assertEntryAuxiliaries } = require('../../src/utils/finance/entryDataIntegrity');
const migration = require('../../migrations/20261017000200_complete_gl_voucher_fields');

const pair = (patch = {}) => [
  { account_id: 1, debit_amount: '678.09', currency_code: 'USD', exchange_rate: '6.78090000', foreign_amount: '100.00', ...patch },
  { account_id: 2, credit_amount: '678.09' },
];

describe('voucher original and base currency integrity', () => {
  test('preserves USD amount/rate and decimal-exact CNY amounts', () => {
    const items = normalizeEntryItems(pair());
    expect(items[0]).toMatchObject({ exchange_rate: '6.78090000', foreign_amount: '100.00', debit_amount: 678.09 });
    expect(items[1]).toMatchObject({ currency_code: 'CNY', exchange_rate: 1, foreign_amount: null });
    expect(normalizeEntryItems([
      { account_id: 1, debit_amount: '1.005' }, { account_id: 2, credit_amount: '1.01' },
    ])[0].debit_amount).toBe(1.01);
  });

  test.each([
    { currency_code: 'EUR' }, { exchange_rate: null }, { exchange_rate: 0 },
    { exchange_rate: '6.780900001' }, { exchange_rate: '10000000000' },
    { exchange_rate: 'NaN' }, { exchange_rate: {} }, { foreign_amount: null },
    { foreign_amount: '100.001' }, { foreign_amount: 0 }, { foreign_amount: -100 },
    { foreign_amount: 99.99 }, { debit_amount: 678.08 },
  ])('rejects incomplete or inconsistent USD data before posting: %p', (patch) => {
    expect(() => normalizeEntryItems(pair(patch))).toThrow();
  });

  test('rejects non-unit CNY rates and fabricated CNY original amounts', () => {
    expect(() => normalizeEntryItems(pair({ currency_code: 'CNY' }))).toThrow('人民币汇率');
    expect(() => normalizeEntryItems(pair({ currency_code: 'CNY', exchange_rate: 1 }))).toThrow('不一致');
  });

  test('strictly balances decimal cents after half-up conversion', () => {
    expect(() => normalizeEntryItems([
      ...pair(), { account_id: 2, debit_amount: 0.01 },
    ])).toThrow('借贷不平衡');
  });

  test('only a trusted invoice generator can record a bounded rounding residual', () => {
    const items = [
      ...pair({ foreign_amount: '99.99', debit_amount: '678.03', base_rounding_adjustment: '0.01' }).slice(0, 1),
      { account_id: 2, credit_amount: '678.03' },
    ];
    expect(() => normalizeEntryItems(items)).toThrow('只允许由外币业务单据生成');
    expect(normalizeEntryItems(items, { allowFxRoundingAdjustment: true })[0].base_rounding_adjustment).toBe('0.01');
    items[0].base_rounding_adjustment = '0.02';
    expect(() => normalizeEntryItems(items, { allowFxRoundingAdjustment: true })).toThrow('不超过0.01');
  });

  test('metadata distinguishes unknown from zero and never reads attachment count from source number', () => {
    expect(normalizeEntryMetadata({ document_number: '9' })).toEqual({ attachment_count: null, approval_comment: null });
    expect(normalizeEntryMetadata({ attachment_count: 0, approval_comment: '已核对' })).toEqual({ attachment_count: 0, approval_comment: '已核对' });
    for (const value of [-1, '2.1', true, '4294967296']) {
      expect(() => normalizeEntryMetadata({ attachment_count: value })).toThrow('附件数');
    }
    const item = normalizeEntryItems(pair({ quantity: '2.500001', unit_price: 0, unit_name: '箱', project_name: '设备采购' }))[0];
    expect(item).toMatchObject({ quantity: '2.500001', unit_price: '0.000000', unit_name: '箱', project_name: '设备采购' });
    expect(() => normalizeEntryItems(pair({ quantity: '2.5000001' }))).toThrow('数量');
  });

  test('employee identity is source-qualified and old unknown values survive only controlled reversals', () => {
    expect(() => normalizeEntryItems(pair({ employee_id: 8 }))).toThrow('明确来源');
    expect(() => normalizeEntryItems(pair({ employee_id: 8, employee_source: 'anything' }))).toThrow('来源');
    expect(normalizeEntryItems(pair({ employee_id: 8 }), { allowHistoricalAuxiliaries: true })[0]).toMatchObject({ employee_id: 8, employee_source: null });
  });
});

describe('voucher master data references', () => {
  test.each([
    ['has_customer', '客户'], ['has_supplier', '供应商'], ['has_department', '部门'],
    ['has_employee', '员工'], ['has_project', '项目名称'],
  ])('enforces the account required dimension %s', async (flag, label) => {
    await expect(assertEntryAuxiliaries({ query: jest.fn() }, normalizeEntryItems(pair()), [{ id: 1, [flag]: 1 }])).rejects.toThrow(label);
  });

  test('department and cost center are validated independently and employee IDs cannot cross sources', async () => {
    const connection = { query: jest.fn(async (sql, ids) => [ids.map((id) => ({ id }))]) };
    const items = normalizeEntryItems(pair({ department_id: 7, cost_center_id: 8, customer_id: 9, supplier_id: 10, employee_id: 11, employee_source: 'hr' }));
    await assertEntryAuxiliaries(connection, items, [{ id: 1 }]);
    expect(connection.query.mock.calls.map(([sql]) => sql.match(/FROM (\w+)/)[1])).toEqual(['departments', 'cost_centers', 'customers', 'suppliers', 'hr_employees']);
    expect(connection.query.mock.calls.every(([sql]) => sql.includes('LOCK IN SHARE MODE'))).toBe(true);
    expect(connection.query.mock.calls[0][1]).toEqual([7]);
    expect(connection.query.mock.calls[1][1]).toEqual([8]);
    connection.query.mockResolvedValue([[]]);
    await expect(assertEntryAuxiliaries(connection, items, [{ id: 1 }])).rejects.toThrow('部门不存在');
  });

  test('persists the header and every original detail field together', async () => {
    const connection = {
      execute: jest.fn(async (sql) => sql.includes('INSERT INTO gl_entries') ? [{ insertId: 20 }] : [[]]),
      query: jest.fn(async (sql, ids) => sql.includes('INSERT') ? [{ affectedRows: 2 }] : [ids.map((id) => ({ id }))]),
    };
    await GLService.createEntry({ entry_date: '2026-10-17', entry_number: 'TEST-USD', voucher_number: 1, attachment_count: 2, approval_comment: '已核对' }, pair({
      department_id: 7, cost_center_id: 8, employee_id: 11, employee_source: 'user',
      quantity: 2, unit_name: '箱', unit_price: 50, settlement_method: '银行转账', invoice_number: 'INV-USD-001', project_name: '设备采购',
    }), connection);
    const [headerSql, headerValues] = connection.execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO gl_entries'));
    expect(headerSql).toContain('attachment_count, approval_comment');
    expect(headerValues.slice(-2)).toEqual([2, '已核对']);
    const [itemSql, [values]] = connection.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO gl_entry_items'));
    const columns = itemSql.match(/\(([^)]+)\)/)[1].split(',').map((column) => column.trim());
    const saved = Object.fromEntries(columns.map((column, i) => [column, values[0][i]]));
    expect(saved).toMatchObject({ department_id: 7, cost_center_id: 8, exchange_rate: '6.78090000', foreign_amount: '100.00', quantity: '2.000000', unit_name: '箱', unit_price: '50.000000', settlement_method: '银行转账', invoice_number: 'INV-USD-001', project_name: '设备采购', employee_source: 'user' });
  });
});

describe('voucher schema migration', () => {
  test('adds nullable evidence fields without fabricating historical values and can roll back', async () => {
    const first = jest.fn().mockResolvedValue(undefined);
    const knex = Object.assign(jest.fn(() => ({ whereRaw: jest.fn(() => ({ first })) })), {
      schema: { hasColumn: jest.fn().mockResolvedValue(false) }, raw: jest.fn(),
    });
    await migration.up(knex);
    expect(knex.raw.mock.calls.some(([sql]) => /exchange_rate DECIMAL\(18,8\)/.test(sql))).toBe(true);
    expect(knex.raw.mock.calls.some(([sql]) => /UPDATE|INSERT/.test(sql))).toBe(false);
    knex.schema.hasColumn.mockResolvedValue(true);
    await migration.down(knex);
    expect(knex.raw.mock.calls.some(([sql]) => sql.includes('DROP COLUMN `attachment_count`'))).toBe(true);
    knex.raw.mockClear();
    first.mockResolvedValue({ id: 1 });
    await expect(migration.down(knex)).rejects.toThrow('不能无损回滚');
    expect(knex.raw).not.toHaveBeenCalled();
  });
});
