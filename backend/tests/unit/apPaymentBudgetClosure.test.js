jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn(), execute: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } }));
const Service = require('../../src/services/finance/APPaymentBudgetService');
const Budget = require('../../src/services/business/BudgetControlService');

function setup({ budgetAmount = 100, used = 100, reserved = 0, departmentId = 8, budgetDepartment = 8, noBudget = false, entries = [{ id: 90, entry_date: '2026-09-15' }] } = {}) {
  const connection = { execute: jest.fn(async (sql, args) => {
    if (sql.includes('FROM budgets')) return [noBudget ? [] : [{ budget_id: 2, detail_id: 5, budget_amount: budgetAmount, actual_used: used, reserved_amount: reserved, effective_department_id: budgetDepartment, warning_threshold: 90 }]];
    if (sql.includes('FROM gl_entries')) return [entries];
    if (sql.includes('FROM gl_entry_items')) return [[{ account_id: 1405, department_id: departmentId, recognized_amount: 100 }]];
    throw new Error(`Unexpected budget write/query ${sql} ${args}`);
  }) };
  return connection;
}

test('payment checks trusted posted cost dimensions and does not occupy invoice cost twice', async () => {
  const connection = setup();
  await Service.assertInvoiceWithinBudget(connection, { invoice_number: 'AP-01', budget_account_id: 999 });
  const budgetCall = connection.execute.mock.calls.find(([sql]) => sql.includes('FROM budgets'));
  expect(budgetCall[1]).toEqual([1405, '2026-09-15', '2026-09-15', 8]);
  expect(budgetCall[0]).toContain('FOR UPDATE');
  expect(budgetCall[0]).not.toContain('ge.id <>');
  expect(connection.execute.mock.calls.every(([sql]) => sql.trim().startsWith('SELECT'))).toBe(true);
});

test('configured budget overrun blocks settlement even if client supplies another account', async () => {
  const connection = setup({ used: 101 });
  await expect(Service.assertInvoiceWithinBudget(connection, { invoice_number: 'AP-01', budget_account_id: 777 })).rejects.toThrow(/预算余额不足/);
});

test('unposted or duplicate voucher cannot bypass budget dimensions', async () => {
  for (const entries of [[], [{ id: 1 }, { id: 2 }]]) {
    await expect(Service.assertInvoiceWithinBudget(setup({ entries }), { invoice_number: 'AP-01' })).rejects.toThrow(/唯一有效/);
  }
});

test('department budget requires trusted cost center instead of accepting client department', async () => {
  await expect(Service.assertInvoiceWithinBudget(setup({ departmentId: null }), { invoice_number: 'AP-01', department_id: 8 })).rejects.toThrow(/成本中心/);
});

test('existing unrelated reservations remain part of the available budget', async () => {
  await expect(Service.assertInvoiceWithinBudget(setup({ used: 90, reserved: 11 }), { invoice_number: 'AP-01' })).rejects.toThrow(/预算余额不足/);
});

test('absence of applicable budget preserves existing unrestricted-account policy', async () => {
  await expect(Service.assertInvoiceWithinBudget(setup({ noBudget: true }), { invoice_number: 'AP-01' })).resolves.toBeUndefined();
});

test('zero requests stay invalid for new budget reservation paths', async () => {
  const connection = setup();
  expect(await Budget.checkBudgetAvailability(1405, 8, 0, '2026-09-15', connection)).toMatchObject({ available: false, reason: '预算占用金额必须大于0' });
  expect(connection.execute).not.toHaveBeenCalled();
});
