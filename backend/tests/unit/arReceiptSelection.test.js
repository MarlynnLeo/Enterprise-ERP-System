jest.mock('../../src/config/db', () => ({ pool: { execute: jest.fn() } }));
jest.mock('../../src/models/ar', () => ({}));
jest.mock('../../src/models/cash/Account', () => ({ getBankAccounts: jest.fn() }));
jest.mock('../../src/services/business/CodeGeneratorService', () => ({}));
jest.mock('../../src/authorization/ScopeGuard', () => ({}));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn() } }));
const { pool } = require('../../src/config/db');
const BankAccountModel = require('../../src/models/cash/Account');
const controller = require('../../src/controllers/business/finance/arController');
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
beforeEach(() => jest.clearAllMocks());

test('unpaid invoice paging filters both count and data and includes a stable tie-break order', async () => {
  pool.execute.mockResolvedValueOnce([[{ total: 51 }]]).mockResolvedValueOnce([
    [
      {
        id: 51,
        invoice_number: 'AR-51',
        customer_name: '客户甲',
        balance_amount: 10,
      },
    ],
  ]);
  const res = response();
  await controller.getUnpaidInvoices(
    { query: { page: '3', pageSize: '20', keyword: '客户甲', customerId: '8' } },
    res
  );
  const [count, rows] = pool.execute.mock.calls;
  expect(count[0]).toContain('COUNT(*)');
  expect(count[1]).toEqual([8, '%客户甲%', '%客户甲%']);
  expect(rows[1]).toEqual(count[1]);
  expect(rows[0]).toContain('ORDER BY i.due_date ASC, i.id ASC LIMIT 20 OFFSET 40');
  const payload = res.json.mock.calls[0][0];
  expect(payload.data.list[0]).toEqual(
    expect.objectContaining({ id: 51, customerName: '客户甲', balanceAmount: 10 })
  );
  expect(payload.data.total).toBe(51);
});
test('legacy unpaged PC calls retain an array response without a silent first-page cap', async () => {
  pool.execute.mockResolvedValueOnce([[{ id: 51, balance_amount: 10 }]]);
  const res = response();
  await controller.getUnpaidInvoices({ query: {} }, res);
  expect(pool.execute).toHaveBeenCalledTimes(1);
  expect(pool.execute.mock.calls[0][0]).not.toMatch(/LIMIT/);
  expect(Array.isArray(res.json.mock.calls[0][0].data)).toBe(true);
});
test('invalid selection filters do not execute queries', async () => {
  const res = response();
  await controller.getUnpaidInvoices({ query: { keyword: ['unexpected'] } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(pool.execute).not.toHaveBeenCalled();
});
test('receipt account choices are active, paginated and omit balances and personal contacts', async () => {
  BankAccountModel.getBankAccounts.mockResolvedValue({
    accounts: [
      {
        id: 8,
        account_name: '收款户',
        account_number: '1234',
        bank_name: '银行',
        current_balance: 9000,
        contact_phone: 'private',
      },
    ],
    total: 41,
  });
  const res = response();
  await controller.getReceiptAccounts(
    { query: { page: '3', pageSize: '20', keyword: '收款' } },
    res
  );
  expect(BankAccountModel.getBankAccounts).toHaveBeenCalledWith(
    expect.objectContaining({ is_active: true, page: 3, pageSize: 20, account_name: '收款' })
  );
  const payload = res.json.mock.calls[0][0];
  expect(payload.data.list[0]).toEqual(expect.objectContaining({ id: 8, accountName: '收款户' }));
  expect(JSON.stringify(payload)).not.toMatch(
    /current_balance|currentBalance|contact_phone|private|9000/
  );
  expect(payload.data.total).toBe(41);
});

test('unrepresentable account page offsets are rejected before database access', async () => {
  const res = response();
  await controller.getReceiptAccounts(
    { query: { page: '999999999999999999999', pageSize: '100' } },
    res
  );
  expect(res.status).toHaveBeenCalledWith(400);
  expect(BankAccountModel.getBankAccounts).not.toHaveBeenCalled();
});
