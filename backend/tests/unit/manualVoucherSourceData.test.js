/* global jest, beforeEach, test, expect */
jest.mock('../../src/config/db', () => ({ pool: { execute: jest.fn(), query: jest.fn(), getConnection: jest.fn() } }));
jest.mock('../../src/models/ar', () => ({ createInvoice: jest.fn(async () => 91) }));
jest.mock('../../src/models/ap', () => ({ createInvoice: jest.fn(async () => 92) }));
jest.mock('../../src/models/finance', () => ({ createEntry: jest.fn(async () => 88) }));
jest.mock('../../src/models/tax', () => ({}));
jest.mock('../../src/services/business/DocumentLinkService', () => ({ tryAutoLink: jest.fn() }));
jest.mock('../../src/services/InventoryPostingService', () => ({ requireApprovedForTransaction: jest.fn() }));
jest.mock('../../src/utils/userUtils', () => ({ resolveActorUserId: jest.fn(async () => 8) }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } }));
jest.mock('../../src/config/accountingConfig', () => ({ accountingConfig: { getAccountCode: jest.fn(key => key) } }));

const db = require('../../src/config/db');
const finance = require('../../src/models/finance');
const ar = require('../../src/models/ar');
const Integration = require('../../src/services/external/FinanceIntegrationService');
const Manual = require('../../src/services/finance/ManualVoucherService');
let outbound;
let orders;
let valuedItems;
let connection;

beforeEach(() => {
  jest.clearAllMocks();
  outbound = { id: 4, outbound_no: 'OUT-4', status: 'completed', order_id: 5, customer_id: 100 };
  orders = [{ id: 5, order_no: 'SO-5', customer_id: 12, customer_name: '美元客户', currency: 'USD', exchange_rate: 7.2, department_id: 9 }];
  valuedItems = [
    { id: 1, material_id: 3, quantity: 2, unit_price: 10, unit_name: '个', tax_percent: 0.13, source_order_id: 5 },
    { id: 2, material_id: 4, quantity: 1, unit_price: 30, unit_name: '箱', tax_percent: 0, source_order_id: 5 },
  ];
  db.pool.execute.mockImplementation(async sql => {
    if (sql.includes('FROM ar_invoices')) return [[]];
    if (sql.includes('FROM gl_accounts')) return [[
      { id: 1, account_code: 'ACCOUNTS_RECEIVABLE', account_name: '应收' },
      { id: 2, account_code: 'SALES_REVENUE', account_name: '收入' },
      { id: 3, account_code: 'VAT_OUTPUT_TAX', account_name: '税' },
    ]];
    throw new Error(`Unexpected preview query: ${sql}`);
  });
  db.pool.query.mockResolvedValue([valuedItems]);
  connection = {
    beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
    query: jest.fn(async () => [valuedItems]),
    execute: jest.fn(async sql => {
      if (sql.includes('FROM sales_orders so')) return [orders];
      if (sql.includes('FROM gl_periods')) return [[{ id: 6 }]];
      if (sql.includes('SELECT entry_number')) return [[{ entry_number: 'GL-88' }]];
      throw new Error(`Unexpected generation query: ${sql}`);
    }),
  };
  db.pool.getConnection.mockResolvedValue(connection);
  jest.spyOn(Manual, 'loadSalesOutbound').mockResolvedValue(outbound);
  jest.spyOn(Manual, 'loadSalesOrdersForOutbound').mockImplementation(async () => orders);
  jest.spyOn(Integration, 'requireApprovedInventoryPosting').mockResolvedValue({});
  jest.spyOn(Integration, 'lockSourceDocument').mockResolvedValue(undefined);
  jest.spyOn(Integration, 'findExistingInvoiceBySource').mockResolvedValue(null);
  jest.spyOn(Integration, 'releaseStaleInactiveSource').mockResolvedValue(undefined);
  jest.spyOn(Integration, 'resolveAccountIds').mockResolvedValue({ ACCOUNTS_RECEIVABLE: 1, SALES_REVENUE: 2, VAT_OUTPUT_TAX: 3 });
  jest.spyOn(Integration, 'loadConfigurations').mockResolvedValue(undefined);
  jest.spyOn(Integration, 'generateInvoiceNumber').mockResolvedValue('AR-91');
  jest.spyOn(Integration, 'getCurrentPeriod').mockResolvedValue({ id: 6 });
  jest.spyOn(Integration, 'resolvePartyPaymentTermDays').mockResolvedValue(30);
  jest.spyOn(Integration, 'refreshSalesOrderInvoiceStatus').mockResolvedValue(undefined);
});

test('sales preview and generator share actual outbound prices and per-line tax, preserving source USD', async () => {
  const preview = await Manual.previewSalesOutbound(4);
  expect(preview).toMatchObject({ subtotal: 50, taxAmount: 2.6, totalAmount: 52.6, currencyCode: 'USD', exchangeRate: 7.2, partyId: 12 });
  expect(preview.entryLines.find(line => line.role === 'income').quantity).toBeUndefined();
  expect(preview.entryLines.every(line => line.department_id === 9)).toBe(true);
  expect(db.pool.query.mock.calls[0][0]).toContain('u.id=i.unit_id');
  const generated = await Integration.generateARInvoiceFromSalesOutbound(outbound, [{ id: 5, currency: 'CNY' }], 8, { force: true, connection });
  const [invoice, invoiceConnection] = ar.createInvoice.mock.calls[0];
  expect(invoiceConnection).toBe(connection);
  expect(invoice).toMatchObject({ customer_id: 12, currency_code: 'USD', exchange_rate: 7.2, subtotal: 50, tax_amount: 2.6, total_amount: 52.6 });
  expect(invoice.items.map(item => item.unit_name)).toEqual(['个', '箱']);
  expect(invoice.gl_entry.department_id).toBe(9);
  expect(generated.voucherSource).toMatchObject({ partyId: 12, subtotal: 50, taxAmount: 2.6 });
});

test('legacy order-level invoices are checked against authoritative orders even if event payload omitted them', async () => {
  Integration.findExistingInvoiceBySource.mockImplementation(async (conn, table, type) => type === 'sales_order' ? { id: 20, invoice_number: 'OLD-20', status: '已确认' } : null);
  const result = await Integration.generateARInvoiceFromSalesOutbound(outbound, [], 8, { force: true, connection });
  expect(result).toMatchObject({ skipped: true, legacyInvoiceId: 20 });
  expect(ar.createInvoice).not.toHaveBeenCalled();
});

test('USD generation without source rate fails before invoice creation', async () => {
  delete orders[0].exchange_rate;
  await expect(Integration.generateARInvoiceFromSalesOutbound(outbound, orders, 8, { force: true, connection })).rejects.toThrow('美元必须填写实际汇率');
  expect(ar.createInvoice).not.toHaveBeenCalled();
});

test('missing source customer cannot fall back to a stale outbound payload customer', async () => {
  delete orders[0].customer_id;
  await expect(Manual.previewSalesOutbound(4)).rejects.toThrow('缺少客户信息');
  await expect(Integration.generateARInvoiceFromSalesOutbound(outbound, orders, 8, { force: true, connection })).rejects.toThrow('缺少客户信息');
  expect(ar.createInvoice).not.toHaveBeenCalled();
});

test('merged GL uses final invoice tax, quantity, unit and party and converts original USD once', async () => {
  const result = await Manual.createMergedGlEntry({
    businessType: 'sales_outbound', entryDate: '2026-10-17', userId: 8, connection, partyId: 99,
    entryLines: [
      { role: 'receivable', account_id: 1, debit_amount: 52.6, credit_amount: 0, customer_id: 99 },
      { role: 'income', account_id: 2, debit_amount: 0, credit_amount: 50, quantity: 99, unit_price: 1, unit_name: '旧', department_id: 7 },
      { role: 'tax', account_id: 3, debit_amount: 0, credit_amount: 2.6 },
    ],
    invoiceLinks: [{ invoiceId: 91, invoiceNumber: 'AR-91', amount: 56.5, currencyCode: 'USD', exchangeRate: 7.2,
      voucherSource: { partyId: 12, subtotal: 50, taxAmount: 6.5, items: [{ material_id: 3, quantity: 2, unit_price: 25, unit_name: '个' }] } }],
  });
  const [header, items, suppliedConnection, options] = finance.createEntry.mock.calls[0];
  expect(result).toMatchObject({ entryId: 88, debit: 406.8, credit: 406.8 });
  expect(suppliedConnection).toBe(connection);
  expect(options.allowFxRoundingAdjustment).toBe(true);
  expect(header.is_posted).toBe(1);
  expect(items[0]).toMatchObject({ customer_id: 12, debit_amount: 406.8, foreign_amount: 56.5, invoice_number: 'AR-91' });
  expect(items[1]).toMatchObject({ credit_amount: 360, foreign_amount: 50, quantity: 2, unit_price: 25, unit_name: '个', department_id: 7 });
  expect(items[2]).toMatchObject({ credit_amount: 46.8, foreign_amount: 6.5 });
});

test('merged source currency or party conflict fails before writing GL', async () => {
  const args = { businessType: 'sales_outbound', connection,
    entryLines: [{ role: 'receivable', account_id: 1, debit_amount: 20 }, { role: 'income', account_id: 2, credit_amount: 20 }],
    invoiceLinks: [
      { amount: 10, currencyCode: 'USD', exchangeRate: 7, voucherSource: { partyId: 12 } },
      { amount: 10, currencyCode: 'CNY', exchangeRate: 1, voucherSource: { partyId: 12 } },
    ],
  };
  await expect(Manual.createMergedGlEntry(args)).rejects.toThrow('不同币种或汇率');
  args.invoiceLinks[1].currencyCode = 'USD';
  args.invoiceLinks[1].exchangeRate = 7;
  await expect(Manual.createMergedGlEntry(args)).rejects.toThrow('美元来源请逐单生成凭证，以保留原单核销金额');
  args.invoiceLinks[0].currencyCode = 'CNY';
  args.invoiceLinks[0].exchangeRate = 1;
  args.invoiceLinks[1].currencyCode = 'CNY';
  args.invoiceLinks[1].exchangeRate = 1;
  args.invoiceLinks[1].voucherSource.partyId = 13;
  await expect(Manual.createMergedGlEntry(args)).rejects.toThrow('不同往来单位');
  expect(finance.createEntry).not.toHaveBeenCalled();
});

test.each(['sales_outbound', 'purchase_receipt'])('%s single-source USD merge leaves the final control line unadjusted', async businessType => {
  const isAp = businessType === 'purchase_receipt';
  await Manual.createMergedGlEntry({
    businessType, entryDate: '2026-10-17', connection, userId: 8,
    entryLines: [
      { role: isAp ? 'cost' : 'income', account_id: 2, debit_amount: isAp ? 100.01 : 0, credit_amount: isAp ? 0 : 100.01 },
      { role: 'tax', account_id: 3, debit_amount: isAp ? 13.01 : 0, credit_amount: isAp ? 0 : 13.01 },
      { role: isAp ? 'payable' : 'receivable', account_id: 1, debit_amount: isAp ? 0 : 113.02, credit_amount: isAp ? 113.02 : 0 },
    ],
    invoiceLinks: [{ invoiceId: 91, invoiceNumber: 'FX-91', amount: 113.02, currencyCode: 'USD', exchangeRate: 7.5,
      voucherSource: { partyId: 12, subtotal: 100.01, taxAmount: 13.01, items: [{ material_id: 3, quantity: 2, unit_price: 50.005, unit_name: '个' }] } }],
  });
  const items = finance.createEntry.mock.calls[0][1];
  const control = items.find(line => line.account_id === 1);
  expect(control).toMatchObject({ foreign_amount: 113.02, base_rounding_adjustment: 0 });
  expect(control[isAp ? 'credit_amount' : 'debit_amount']).toBe(847.65);
  expect(items.find(line => line.account_id === 3)).toMatchObject({ foreign_amount: 13.01, base_rounding_adjustment: -0.01 });
});
