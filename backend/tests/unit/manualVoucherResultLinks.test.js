/* global jest, beforeEach, afterEach, test, expect */
jest.mock('../../src/config/db', () => ({ pool: {} }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } }));
const { DatabaseSync } = require('node:sqlite');
const Service = require('../../src/services/finance/ManualVoucherService');
let fixture;
let connection;

beforeEach(() => {
  fixture = new DatabaseSync(':memory:');
  fixture.exec(`
    CREATE TABLE gl_entries (id INTEGER PRIMARY KEY, entry_number TEXT, is_reversed INTEGER);
    CREATE TABLE document_links (source_type TEXT, source_id INTEGER, target_type TEXT, target_id INTEGER);
    INSERT INTO gl_entries VALUES (90, 'GL-AR', 0), (91, 'GL-AP', 0), (99, 'GL-REVERSED', 1), (100, 'UNRELATED', 0);
    INSERT INTO document_links VALUES
      ('ar_invoice', 10, 'finance_voucher', 90),
      ('finance_voucher', 90, 'ar_invoice', 11),
      ('ap_invoice', 10, 'finance_voucher', 91),
      ('finance_voucher', 91, 'ap_invoice', 11),
      ('ar_invoice', 10, 'finance_voucher', 99),
      ('sales_outbound', 10, 'finance_voucher', 100),
      ('ar_invoice', 12, 'finance_voucher', 100);
  `);
  connection = { execute: jest.fn(async (sql, params) => [fixture.prepare(sql).all(...params)]) };
});
afterEach(() => fixture.close());

test.each([['sales_outbound', 90, 'GL-AR'], ['purchase_receipt', 91, 'GL-AP']])('%s results resolve both link directions using exact invoice type and ignore reversed or unrelated vouchers', async (businessType, entryId, entryNumber) => {
  const results = [{ id: 1, invoiceId: 10 }, { id: 2, invoiceId: 11 }, { id: 3, invoiceId: 50 }, { id: 4, invoiceId: 12, entryId: 70, entryNumber: 'KNOWN' }];
  await Service.attachRecognitionEntries(results, businessType, connection);
  expect(results).toEqual([
    { id: 1, invoiceId: 10, entryId, entryNumber },
    { id: 2, invoiceId: 11, entryId, entryNumber },
    { id: 3, invoiceId: 50 },
    { id: 4, invoiceId: 12, entryId: 70, entryNumber: 'KNOWN' },
  ]);
  expect(connection.execute).toHaveBeenCalledTimes(1);
});

test('new vouchers with known identities need no additional read', async () => {
  await Service.attachRecognitionEntries([{ id: 1, invoiceId: 10, entryId: 90 }], 'sales_outbound', connection);
  expect(connection.execute).not.toHaveBeenCalled();
});
