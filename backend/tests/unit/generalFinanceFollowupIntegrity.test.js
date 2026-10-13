jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn(), query: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/utils/userUtils', () => ({ resolveActorUserId: jest.fn().mockResolvedValue(2), resolveActorLabel: jest.fn() }));
jest.mock('../../src/services/external/FinanceIntegrationService', () => ({ resolveAccountIds: jest.fn().mockResolvedValue({ ADMIN_EXPENSE: 1, EMPLOYEE_PAYABLE: 2 }) }));
jest.mock('../../src/services/finance/GLService', () => ({ getPeriodIdByDate: jest.fn().mockResolvedValue(1) }));
jest.mock('../../src/models/finance', () => ({ createEntry: jest.fn().mockResolvedValue(70) }));
jest.mock('../../src/services/business/DocumentLinkService', () => ({}));
jest.mock('../../src/config/accountingConfig', () => ({ accountingConfig: {} }));

const db = require('../../src/config/db');
const finance = require('../../src/models/finance');
const SalaryService = require('../../src/services/business/hr/salaryService');
const cip = require('../../src/models/cip');
const budget = require('../../src/models/budget');
const budgetSql = require('../../src/utils/finance/budgetUsageSql');

describe('salary accrual reuse verifies source, posting and amounts', () => {
  const salaryBase = { id: 7, employee_id: 9, period: '2026-09', calculated_by: 1, status: 'draft', gross_salary: '100.00' };
  const entryBase = { id: 70, entry_number: 'JV70', document_type: 'adjustment', document_number: 'SAL-7', transaction_type: 'salary', transaction_id: 7, is_posted: 1, is_reversed: 0, status: 'posted' };
  const lines = [
    { account_id: 1, debit_amount: 100, credit_amount: 0, employee_id: 9 },
    { account_id: 2, debit_amount: 0, credit_amount: 100, employee_id: 9 },
  ];
  function setup({ salary = salaryBase, entries = [entryBase], items = lines } = {}) {
    const connection = {
      beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
      execute: jest.fn(async (sql) => {
        if (sql.includes('FROM hr_salary_records')) return [[salary]];
        if (sql.includes('FROM gl_entry_items')) return [items];
        if (sql.includes('FROM gl_entries')) return [entries];
        return [{ affectedRows: 1 }];
      }),
    };
    db.pool.getConnection.mockResolvedValue(connection);
    return connection;
  }

  test.each([
    ['unrelated voucher type', { document_type: 'manual' }, '来源不匹配'],
    ['wrong salary source', { transaction_id: 8 }, '来源不匹配'],
    ['unbound legacy voucher', { transaction_type: 'adjustment', transaction_id: null }, '来源不匹配'],
    ['draft voucher', { is_posted: 0, status: 'draft' }, '必须已过账'],
    ['reversed voucher', { is_reversed: 1 }, '必须已过账'],
  ])('rejects %s without approving salary', async (_name, override, message) => {
    const connection = setup({ entries: [{ ...entryBase, ...override }] });
    await expect(SalaryService.confirmAndPostSalary(7, 2)).rejects.toThrow(message);
    expect(connection.execute.mock.calls.some(([sql]) => /^UPDATE hr_salary_records/.test(sql.trim()))).toBe(false);
    expect(connection.rollback).toHaveBeenCalled();
    expect(finance.createEntry).not.toHaveBeenCalled();
  });

  test.each([
    ['wrong employee', lines.map((line) => ({ ...line, employee_id: 8 })), '员工'],
    ['missing employee', lines.map((line) => ({ ...line, employee_id: null })), '员工'],
    ['wrong gross amount', lines.map((line) => ({ ...line, debit_amount: line.debit_amount / 2, credit_amount: line.credit_amount / 2 })), '金额'],
  ])('rejects %s', async (_name, items, message) => {
    setup({ items });
    await expect(SalaryService.confirmAndPostSalary(7, 2)).rejects.toThrow(message);
  });

  test('a source-matched posted voucher with exact employee and gross amount is reused', async () => {
    const connection = setup();
    await expect(SalaryService.confirmAndPostSalary(7, 2)).resolves.toMatchObject({ skipped: true, entryId: 70 });
    expect(finance.createEntry).not.toHaveBeenCalled();
    expect(connection.execute.mock.calls.find(([sql]) => sql.includes('UPDATE hr_salary_records'))[1]).toEqual([70, 2, 7]);
  });

  test('already approved salary is revalidated, including a reversed linked voucher', async () => {
    setup({ salary: { ...salaryBase, status: 'approved', gl_entry_id: 70 }, entries: [{ ...entryBase, is_reversed: 1 }] });
    await expect(SalaryService.confirmAndPostSalary(7, 2)).rejects.toThrow('必须已过账');
  });

  test('a linked historical posted accrual remains reusable without historical employee dimensions', async () => {
    setup({ salary: { ...salaryBase, status: 'approved', gl_entry_id: 70 }, entries: [{ ...entryBase, transaction_type: 'adjustment', transaction_id: null }], items: lines.map((line) => ({ ...line, employee_id: null })) });
    await expect(SalaryService.confirmAndPostSalary(7, 2)).resolves.toMatchObject({ skipped: true, entryId: 70 });
  });

  test('a missing linked voucher cannot silently create another accrual', async () => {
    setup({ salary: { ...salaryBase, status: 'approved', gl_entry_id: 70 }, entries: [] });
    await expect(SalaryService.confirmAndPostSalary(7, 2)).rejects.toThrow('缺少有效关联凭证');
    expect(finance.createEntry).not.toHaveBeenCalled();
  });

  test('new accruals persist salary identity and employee dimensions', async () => {
    setup({ entries: [] });
    await expect(SalaryService.confirmAndPostSalary(7, 2)).resolves.toMatchObject({ entryId: 70 });
    const [header, items] = finance.createEntry.mock.calls[0];
    expect(header).toMatchObject({ transaction_type: 'salary', transaction_id: 7, document_number: 'SAL-7', is_posted: 1 });
    expect(items).toHaveLength(2);
    expect(items.every((item) => item.employee_id === 9)).toBe(true);
  });
});

describe('budget and CIP safeguards', () => {
  test('department budget SQL follows cost center department rather than comparing unrelated IDs', () => {
    for (const sql of [budgetSql.budgetDetailActualAmountSql(), budgetSql.budgetTotalActualAmountSql()]) {
      expect(sql).toMatch(/cc_budget(?:_usage)?\.department_id = COALESCE/);
      expect(sql).not.toMatch(/gei\.cost_center_id = COALESCE/);
    }
  });

  test('budget remaining cache is assigned before used amount changes', async () => {
    const connection = { execute: jest.fn().mockResolvedValue([{ affectedRows: 1 }]) };
    await budget.updateBudgetDetailUsedAmount(3, 10, connection);
    const [sql, params] = connection.execute.mock.calls[0];
    expect(sql.indexOf('SET remaining_amount')).toBeLessThan(sql.indexOf('used_amount ='));
    expect(params).toEqual([10, 10, 3]);
  });

  function cipConnection(project, affectedRows = 1) {
    const connection = { beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(), query: jest.fn().mockResolvedValueOnce([project ? [project] : []]).mockResolvedValue([{ affectedRows }]) };
    db.pool.getConnection.mockResolvedValue(connection);
    return connection;
  }
  test('CIP deletion locks the same project row as cost collection and deletes conditionally', async () => {
    const connection = cipConnection({ id: 1, status: '建设中', accumulated_amount: 0 });
    await expect(cip.deleteCipProject(1)).resolves.toBe(true);
    expect(connection.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(connection.query.mock.calls[1][0]).toContain("status = '建设中' AND COALESCE(accumulated_amount, 0) = 0");
    expect(connection.beginTransaction).toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalled();
    expect(db.pool.query).not.toHaveBeenCalled();
  });
  test('cost collected before the deletion lock is acquired prevents deletion', async () => {
    const connection = cipConnection({ id: 1, status: '建设中', accumulated_amount: 100 });
    await expect(cip.deleteCipProject(1)).rejects.toThrow('已有发生成本');
    expect(connection.query).toHaveBeenCalledTimes(1);
    expect(connection.rollback).toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
  });
  test('failed conditional deletion rolls back instead of reporting success', async () => {
    const connection = cipConnection({ id: 1, status: '建设中', accumulated_amount: 0 }, 0);
    await expect(cip.deleteCipProject(1)).rejects.toThrow('不能删除');
    expect(connection.rollback).toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
  });
});
