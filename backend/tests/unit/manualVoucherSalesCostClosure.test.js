/* global jest, beforeEach, test, expect */
jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/services/external/FinanceIntegrationService', () => ({
  generateARInvoiceFromSalesOutbound: jest.fn(),
  generateOutputTaxInvoiceFromSalesOutbound: jest.fn(),
  generateCostEntryFromSalesOutbound: jest.fn(),
}));
jest.mock('../../src/services/InventoryPostingService', () => ({ requireApprovedForTransaction: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } }));

const db = require('../../src/config/db');
const Integration = require('../../src/services/external/FinanceIntegrationService');
const Service = require('../../src/services/finance/ManualVoucherService');
let committed;
let working;
let connection;
let failedCostId;
const copy = value => JSON.parse(JSON.stringify(value));

beforeEach(() => {
  committed = { invoices: [], costs: [], tax: [], merged: [] };
  working = copy(committed);
  failedCostId = null;
  connection = {
    execute: jest.fn(async () => [working.merged.flatMap(entry => entry.invoiceIds.map(invoiceId => ({ invoice_id: invoiceId, entry_id: entry.id, entry_number: 'MERGED-AR' })))]),
    beginTransaction: jest.fn(async () => { working = copy(committed); }),
    commit: jest.fn(async () => { committed = copy(working); }),
    rollback: jest.fn(async () => { working = copy(committed); }),
    release: jest.fn(),
  };
  db.pool.getConnection.mockResolvedValue(connection);
  jest.spyOn(Service, 'loadSalesOutbound').mockImplementation(async id => ({ id, outbound_no: `SOB-${id}`, order_id: 7, status: 'completed' }));
  jest.spyOn(Service, 'loadSalesOrdersForOutbound').mockResolvedValue([{ id: 7 }]);
  jest.spyOn(Service, 'batchPreview').mockResolvedValue({ vouchers: [{
    entryDate: '2026-10-17', totalAmount: 700.6,
    entryLines: [{ account_id: 1, debit_amount: 700.6, credit_amount: 0 }, { account_id: 2, debit_amount: 0, credit_amount: 700.6 }],
  }] });
  jest.spyOn(Service, 'createMergedGlEntry').mockImplementation(async options => {
    expect(options.connection).toBe(connection);
    working.merged.push({ id: 90, invoiceIds: options.invoiceLinks.map(row => row.invoiceId) });
    return { entryId: 90, entryNumber: 'MERGED-AR' };
  });
  Integration.generateARInvoiceFromSalesOutbound.mockImplementation(async (outbound, orders, userId, options) => {
    expect(options.connection).toBe(connection);
    expect(options.skipGlEntry).toBe(true);
    const existing = working.invoices.find(row => row.sourceId === outbound.id);
    if (existing) return { skipped: true, invoiceId: existing.id, invoiceNumber: `AR-${outbound.id}`, amount: existing.amount };
    const row = { id: outbound.id + 100, sourceId: outbound.id, amount: outbound.id === 10 ? 271.2 : 429.4 };
    working.invoices.push(row);
    return { invoiceId: row.id, invoiceNumber: `AR-${outbound.id}`, amount: row.amount };
  });
  Integration.generateOutputTaxInvoiceFromSalesOutbound.mockImplementation(async (outbound, userId, options) => {
    expect(options.connection).toBe(connection);
    if (!working.tax.includes(outbound.id)) working.tax.push(outbound.id);
    return { success: true };
  });
  Integration.generateCostEntryFromSalesOutbound.mockImplementation(async (outbound, userId, options) => {
    expect(options.connection).toBe(connection);
    if (options.skipCostEntry) return { skipped: true };
    if (outbound.id === failedCostId) throw new Error('Sales cost source unavailable');
    const existing = working.costs.some(row => row.sourceId === outbound.id);
    if (!existing) working.costs.push({ sourceId: outbound.id, amount: outbound.id === 10 ? 44 : 73.5 });
    return { entryId: outbound.id + 200, entryNumber: `COST-${outbound.id}`, skipped: existing };
  });
});

const generate = () => Service.runMergedGenerate(Service.resolveGenerator('sales_outbound'), 'sales_outbound', [10, 11], 76, null);

test('merged receivables preserve separate costs for both deliveries in their shared transaction', async () => {
  const result = await generate();
  expect(result.successCount).toBe(2);
  expect(result.voucherCount).toBe(3);
  expect(result.recognitionVoucherCount).toBe(1);
  expect(result.costVoucherCount).toBe(2);
  expect(result.results).toEqual([
    expect.objectContaining({ id: 10, invoiceId: 110, invoiceNumber: 'AR-10', entryId: 90, entryNumber: 'MERGED-AR', skipped: false }),
    expect.objectContaining({ id: 11, invoiceId: 111, invoiceNumber: 'AR-11', entryId: 90, entryNumber: 'MERGED-AR', skipped: false }),
  ]);
  expect(committed.merged).toEqual([{ id: 90, invoiceIds: [110, 111] }]);
  expect(committed.costs).toEqual([{ sourceId: 10, amount: 44 }, { sourceId: 11, amount: 73.5 }]);
  expect(committed.tax).toEqual([10, 11]);
});

test('failure on the second delivery cost rolls back both invoices, tax and first cost', async () => {
  failedCostId = 11;
  await expect(generate()).rejects.toThrow('Sales cost source unavailable');
  expect(committed).toEqual({ invoices: [], costs: [], tax: [], merged: [] });
  expect(connection.rollback).toHaveBeenCalledTimes(1);
  expect(Service.createMergedGlEntry).not.toHaveBeenCalled();
});

test('repeating the generation preserves the two invoices and cost identities without a second merged voucher', async () => {
  await generate();
  const first = copy(committed);
  const result = await generate();
  expect(result.skippedCount).toBe(2);
  expect(result.voucherCount).toBe(0);
  expect(result.results).toEqual([
    expect.objectContaining({ id: 10, invoiceId: 110, entryId: 90, entryNumber: 'MERGED-AR', skipped: true }),
    expect.objectContaining({ id: 11, invoiceId: 111, entryId: 90, entryNumber: 'MERGED-AR', skipped: true }),
  ]);
  expect(committed).toEqual(first);
});

test('skipping individual AR vouchers alone never implicitly skips their sales cost', async () => {
  await connection.beginTransaction();
  await Service.generateFromSalesOutbound(10, 76, null, { connection, skipGlEntry: true });
  expect(working.costs).toEqual([{ sourceId: 10, amount: 44 }]);
});

test('existing AR invoices can regain missing cost vouchers without recreating recognition vouchers', async () => {
  await generate();
  committed.costs = [];
  const originalInvoices = copy(committed.invoices);
  const result = await generate();
  expect(result.skippedCount).toBe(2);
  expect(result.recognitionVoucherCount).toBe(0);
  expect(result.costVoucherCount).toBe(2);
  expect(result.voucherCount).toBe(2);
  expect(committed.invoices).toEqual(originalInvoices);
  expect(committed.merged).toHaveLength(1);
  expect(committed.costs).toHaveLength(2);
});
