const migration = require('../../migrations/20260906000001_seed_missing_manufacturing_account_mappings');

function account(account_code, account_name, type, is_debit = 1) {
  return { account_code, account_name, type, is_debit, is_active: 1 };
}

function database(initialCodes, accounts) {
  const state = { row: initialCodes === undefined ? undefined : { value: initialCodes }, writes: 0 };
  const update = jest.fn(async (row) => {
    state.row = row;
    state.writes += 1;
  });
  const insert = jest.fn(async (row) => {
    state.row = row;
    state.writes += 1;
  });
  const knex = jest.fn((table) => {
    if (table === 'gl_accounts') return { select: jest.fn(async () => accounts) };
    if (table === 'system_settings') {
      return {
        where: jest.fn(() => ({ first: jest.fn(async () => state.row), update })),
        insert,
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });
  knex.schema = { hasTable: jest.fn(async () => true) };
  return { knex, state, codes: () => JSON.parse(state.row.value) };
}

describe('manufacturing account mapping forward migration', () => {
  const environment = { ...process.env };
  beforeEach(() => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('ACCOUNT_')) delete process.env[key];
    }
  });
  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('ACCOUNT_')) delete process.env[key];
    }
    Object.assign(process.env, environment);
  });

  it('completes the fresh seeded chart for production, payroll, distinct WIP and sales cost', async () => {
    const db = database(JSON.stringify({ SALES_REVENUE: '6001', VAT_INPUT_TAX: '222101' }), [
      account('5001', '生产成本', 'expense'),
      account('5101', '制造费用', 'expense'),
      account('1409', '期末在制品', 'asset'),
      account('2201', '应付职工薪酬', 'liability', 0),
      account('6401', '主营业务成本', 'expense'),
      account('5401', '营业外收入', 'revenue', 0),
    ]);

    await migration.up(db.knex);

    expect(db.codes()).toEqual({
      SALES_REVENUE: '6001', VAT_INPUT_TAX: '222101',
      PRODUCTION_COST: '5001', MANUFACTURING_EXPENSE: '5101',
      WORK_IN_PROCESS: '1409', WIP: '1409', EMPLOYEE_PAYABLE: '2201',
      SALES_COST: '6401', COST_OF_GOODS_SOLD: '6401', NON_OPERATING_INCOME: '5401',
    });
    await migration.up(db.knex);
    expect(db.state.writes).toBe(1);
  });

  it('preserves explicitly configured customer mappings and unrelated settings verbatim', async () => {
    const existing = { PRODUCTION_COST: 'customer-cost', SALES_COST: '', WIP: null, CUSTOM: '9901' };
    const db = database(JSON.stringify(existing), [
      account('5001', '生产成本', 'expense'), account('6401', '主营业务成本', 'expense'),
      account('1409', '期末在制品', 'asset'),
    ]);

    await migration.up(db.knex);

    expect(db.codes()).toMatchObject(existing);
    expect(db.codes().PRODUCTION_COST).toBe('customer-cost');
  });

  it('does not override explicit environment mappings with newly persisted database keys', async () => {
    process.env.ACCOUNT_PRODUCTION_COST = 'custom-production';
    process.env.ACCOUNT_WIP = 'custom-wip';
    const db = database('{}', [
      account('5001', '生产成本', 'expense'), account('1409', '期末在制品', 'asset'),
      account('6401', '主营业务成本', 'expense'),
    ]);

    await migration.up(db.knex);

    expect(db.codes()).not.toHaveProperty('PRODUCTION_COST');
    expect(db.codes()).not.toHaveProperty('WORK_IN_PROCESS');
    expect(db.codes()).not.toHaveProperty('WIP');
    expect(db.codes().SALES_COST).toBe('6401');
  });

  it.each([
    { account_name: '客户自定义科目' },
    { type: 'revenue' },
    { is_debit: 0 },
    { is_active: 0 },
  ])('does not assign a same-code account with incompatible attributes: %j', async (difference) => {
    const db = database('{}', [{ ...account('5001', '生产成本', 'expense'), ...difference }]);

    await migration.up(db.knex);

    expect(db.codes()).toEqual({});
    expect(db.state.writes).toBe(0);
  });

  it('creates the mapping setting when absent', async () => {
    const db = database(undefined, [account('5001', '生产成本', 'expense')]);
    await migration.up(db.knex);
    expect(db.codes()).toEqual({ PRODUCTION_COST: '5001' });
    expect(db.state.row.key).toBe('accounting.account_codes');
  });

  it.each(['{broken', '[]', 'null'])('rejects damaged configuration without overwriting it: %s', async (raw) => {
    const db = database(raw, [account('5001', '生产成本', 'expense')]);
    await expect(migration.up(db.knex)).rejects.toThrow(/Cannot complete accounting.account_codes/);
    expect(db.state.row.value).toBe(raw);
    expect(db.state.writes).toBe(0);
  });
});
