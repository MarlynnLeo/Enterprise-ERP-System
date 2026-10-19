jest.mock('../../src/config/db', () => ({ pool: { execute: jest.fn(), query: jest.fn() } }));
jest.mock('../../src/models/finance', () => ({}));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
const db = require('../../src/config/db');
const apModel = require('../../src/models/ap');
const { fromInvoiceListQuery } = require('../../src/utils/finance/invoiceFieldMap');

describe('AP payable invoice search and pagination', () => {
  beforeEach(() => {
    db.pool.execute.mockReset().mockResolvedValue([[{ total: 21 }]]);
    db.pool.query.mockReset().mockResolvedValue([[{
      id: 21, invoice_number: 'AP-21', balance_amount: 25, status: '已确认', supplier_name: '甲'
    }]]);
  });

  test('applies eligible states, positive balance, keyword and caller scope before counting and paging', async () => {
    const filters = fromInvoiceListQuery({ payableOnly: 'true', keyword: "  AP-'21  " }, 'ap');
    filters.scopeClause = { where: ' AND a.created_by = ?', params: [7] };
    const result = await apModel.getInvoices(filters, 2, 20);
    const [countSql, countParams] = db.pool.execute.mock.calls[0];
    const [dataSql, dataParams] = db.pool.query.mock.calls[0];
    for (const sql of [countSql, dataSql]) {
      expect(sql).toContain('a.status IN (?, ?, ?) AND a.balance_amount > 0');
      expect(sql).toContain('(a.invoice_number LIKE ? OR s.name LIKE ? OR a.supplier_invoice_number LIKE ?)');
      expect(sql).toContain('AND a.created_by = ?');
      expect(sql).not.toContain("AP-'21");
    }
    expect(countParams).toEqual(['已确认', '部分付款', '已逾期', "%AP-'21%", "%AP-'21%", "%AP-'21%", 7]);
    expect(dataParams).toEqual(countParams);
    expect(dataSql).toContain('LIMIT 20 OFFSET 20');
    expect(result).toMatchObject({ total: 21, page: 2, pageSize: 20, data: [{ id: 21, invoiceNumber: 'AP-21', balanceAmount: 25 }] });
  });

  test('ordinary invoice lists retain all statuses when payableOnly is absent or false', async () => {
    await apModel.getInvoices(fromInvoiceListQuery({ payableOnly: 'false', status: '草稿' }, 'ap'));
    const [sql, params] = db.pool.execute.mock.calls[0];
    expect(sql).not.toContain('balance_amount > 0');
    expect(params).toEqual(['草稿']);
  });

  test('returns an empty page without fetching records when no payable invoices match', async () => {
    db.pool.execute.mockResolvedValueOnce([[{ total: 0 }]]);
    expect(await apModel.getInvoices(fromInvoiceListQuery({ payableOnly: true }, 'ap'))).toEqual({ data: [], total: 0, page: 1, pageSize: 20 });
    expect(db.pool.query).not.toHaveBeenCalled();
  });

  test('invoice list selects and maps the stored USD currency and eight-digit rate for payment forms', async () => {
    db.pool.query.mockImplementation(async sql => {
      const row = { id: 21, invoice_number: 'AP-21', total_amount: 0.03, paid_amount: 0.01, balance_amount: 0.02 };
      if (sql.includes('a.currency_code')) row.currency_code = 'USD';
      if (sql.includes('a.exchange_rate')) row.exchange_rate = '6.50000001';
      if (sql.includes('a.created_by')) row.created_by = 75;
      if (sql.includes('a.updated_by')) row.updated_by = 76;
      return [[row]];
    });
    const result = await apModel.getInvoices();
    expect(result.data).toEqual([expect.objectContaining({ currencyCode: 'USD', exchangeRate: 6.50000001, totalAmount: 0.03, paidAmount: 0.01, balanceAmount: 0.02, createdBy: 75, updatedBy: 76 })]);
  });
});
