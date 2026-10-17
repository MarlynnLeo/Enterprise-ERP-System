/* global beforeEach, afterEach, describe, expect, jest, test */
jest.mock('../../src/config/db', () => ({ pool: {} }));
jest.mock('../../src/utils/logger', () => ({ logger: {
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
} }));
jest.mock('../../src/services/business/OutboundPostingGroupService', () => ({ assertWritable: jest.fn() }));
jest.mock('../../src/services/business/FinalInspectionReleaseService', () => ({ validate: jest.fn() }));
jest.mock('../../src/services/business/ProductionReturnService', () => ({ validate: jest.fn().mockResolvedValue({ records: [] }) }));
jest.mock('../../src/services/business/CostAccountingService', () => ({}));
jest.mock('../../src/services/business/DLQService', () => ({ runWithRetry: jest.fn(), registerHandler: jest.fn() }));
jest.mock('../../src/services/business/AsyncTaskService', () => ({}));
jest.mock('../../src/services/business/DocumentChainService', () => ({ afterInventoryInboundConfirmed: jest.fn() }));
jest.mock('../../src/services/business/PeriodValidationService', () => ({
  validateInventoryTransaction: jest.fn().mockResolvedValue({ allowed: true }),
}));

const { DatabaseSync } = require('node:sqlite');
const { createHash } = require('node:crypto');
const Inventory = require('../../src/services/InventoryService');
const Posting = require('../../src/services/InventoryPostingService');
const Inbound = require('../../src/services/business/InboundTransactionService');
const Traceability = require('../../src/services/business/InventoryTraceabilityService');
const { _insertInventoryLedgerLocal } = require('../../src/controllers/business/inventory/inventoryLedgerController');
const { issueOutboundItemFromDetail } = require('../../src/controllers/business/inventory/outbound/outboundHelpers');

let database;
let connection;
let inboundItems;
const header = { id: 11, inbound_no: 'IN-11', inbound_date: '2026-10-16', inbound_type: 'other', location_id: 2, status: 'completed' };
const movement = changes => ({
  materialId: 1, locationId: 2, quantity: 3, batchNumber: 'LOT-A', unitId: 1,
  transactionType: 'inbound', referenceType: 'inbound', referenceNo: 'IN-11',
  sourceId: 11, operator: '仓管', transactionDate: '2026-10-16', unitCost: 2, ...changes,
});
const lines = () => database.prepare('SELECT * FROM inventory_posting_lines ORDER BY id').all();
const totals = () => database.prepare('SELECT SUM(total_quantity) quantity, SUM(total_value) value FROM inventory_posting_documents').get();

beforeEach(() => {
  jest.clearAllMocks();
  database = new DatabaseSync(':memory:');
  database.function('NOW', () => '2026-10-16 00:00:00');
  database.function('CONCAT', { varargs: true }, (...values) => values.join(''));
  database.function('SHA2', (value, bits) => createHash(`sha${bits}`).update(String(value)).digest('hex'));
  database.exec(`
    CREATE TABLE inventory_posting_documents (
      id INTEGER PRIMARY KEY, posting_no TEXT, source_type TEXT, source_id INTEGER, source_no TEXT,
      posting_sequence INTEGER DEFAULT 1, posting_kind TEXT DEFAULT 'movement', finance_status TEXT DEFAULT 'pending',
      total_quantity NUMERIC DEFAULT 0, total_value NUMERIC DEFAULT 0, snapshot_hash TEXT, updated_at TEXT
    );
    CREATE TABLE inventory_posting_lines (
      id INTEGER PRIMARY KEY, posting_document_id INTEGER, line_no INTEGER, source_line_key TEXT,
      material_id INTEGER, location_id INTEGER, transaction_type TEXT, reference_type TEXT,
      reference_no TEXT, signed_quantity NUMERIC, unit_id INTEGER, batch_number TEXT, unit_cost NUMERIC,
      total_value NUMERIC, transaction_date TEXT, operator TEXT, payload_json TEXT, snapshot_hash TEXT,
      created_at TEXT, updated_at TEXT, UNIQUE (posting_document_id, source_line_key)
    );
  `);
  inboundItems = [1, 2].map(id => ({ id, material_id: 1, material_code: 'MAT-1', location_id: 2, quantity: 3, unit_id: 1, batch_number: 'LOT-A' }));
  const execute = async (sql, params = []) => {
    if (sql.includes('FROM inventory_inbound WHERE')) return [[header]];
    if (sql.includes('FROM inventory_inbound_items')) return [inboundItems];
    if (sql.includes('FROM users')) return [[{ id: 9, real_name: '仓管', username: 'warehouse' }]];
    if (sql.includes('FROM units')) return [[{ id: 1 }]];
    if (sql.includes('SUM(quantity)') && sql.includes('FROM inventory_ledger')) return [[{ batch_stock: 100 }]];
    if (sql.includes('SUM(l.signed_quantity)')) return [[{ batch_stock: 0 }]];
    const statement = database.prepare(sql.replace(/\s+FOR UPDATE\b/g, ''));
    if (/^\s*SELECT/i.test(sql)) return [statement.all(...params)];
    const result = statement.run(...params);
    return [{ insertId: Number(result.lastInsertRowid), affectedRows: Number(result.changes) }];
  };
  connection = { execute: jest.fn(execute), query: jest.fn(execute) };
  jest.spyOn(Posting, '_getOrCreateDocument').mockImplementation(async (_connection, source) => {
    let document = database.prepare('SELECT * FROM inventory_posting_documents WHERE source_type = ? AND source_no = ?').get(source.sourceType, source.sourceNo);
    if (!document) {
      database.prepare('INSERT INTO inventory_posting_documents (posting_no, source_type, source_id, source_no) VALUES (?, ?, ?, ?)')
        .run('PST-TEST', source.sourceType, source.sourceId || null, source.sourceNo);
      document = database.prepare('SELECT * FROM inventory_posting_documents WHERE source_type = ? AND source_no = ?').get(source.sourceType, source.sourceNo);
    }
    return document;
  });
  jest.spyOn(Inventory, '_findLedgerByIdempotencyKey').mockResolvedValue(null);
  jest.spyOn(Inventory, 'resolveTransactionDate').mockResolvedValue('2026-10-16');
  jest.spyOn(Inventory, '_lockStockLocation').mockResolvedValue(true);
  jest.spyOn(Inventory, 'getCurrentStock').mockResolvedValue(100);
  jest.spyOn(Inventory, 'getMaterialInfo').mockResolvedValue({ unitId: 1, locationId: 2, costPrice: 2 });
  jest.spyOn(Inventory, '_validateMaterialAndLocation').mockResolvedValue();
  jest.spyOn(Inventory, '_resolveUnitCost').mockResolvedValue(2);
  jest.spyOn(Inventory, 'clearStockCache').mockResolvedValue();
  jest.spyOn(Inbound, 'syncProductionCompletion').mockResolvedValue();
});
afterEach(() => { jest.restoreAllMocks(); database.close(); });

describe('stable business line identity through real inventory staging SQL', () => {
  test.each([[3, 3], [3, 7]])('warehouse inbound preserves both same-batch rows with quantities %s and %s', async (first, second) => {
    inboundItems[0].quantity = first;
    inboundItems[1].quantity = second;
    await Inbound.confirmInbound(connection, 11, '仓管', header, 9);
    expect(lines().map(line => line.signed_quantity)).toEqual([first, second]);
    expect(totals()).toMatchObject({ quantity: first + second, value: (first + second) * 2 });
    await Inbound.confirmInbound(connection, 11, '仓管', header, 9);
    expect(lines()).toHaveLength(2);
    expect(totals()).toMatchObject({ quantity: first + second, value: (first + second) * 2 });
  });

  test.each([[3, 3], [3, 7]])('purchase receipt preserves distinct receipt item IDs for quantities %s and %s', async (first, second) => {
    const receipt = {
      receipt_id: 11, receipt_no: 'RCV-11', operator: '仓管', receipt_date: '2026-10-16',
      items: [first, second].map((quantity, index) => ({
        receipt_item_id: index + 1, material_id: 1, material_code: 'MAT-1', material_name: '物料',
        batch_number: 'LOT-A', warehouse_id: 2, quantity, unit_cost: 2,
      })),
    };
    await Traceability.handlePurchaseReceipt(receipt, connection);
    expect(lines().map(line => line.signed_quantity)).toEqual([first, second]);
    expect(totals()).toMatchObject({ quantity: first + second, value: (first + second) * 2 });
    await Traceability.handlePurchaseReceipt(receipt, connection);
    expect(lines()).toHaveLength(2);
  });

  test('manual transaction bridge carries each business row identity into frozen lines', async () => {
    for (const id of [1, 2]) {
      await _insertInventoryLedgerLocal(connection, {
        material_id: 1, location_id: 2, transaction_type: 'manual_out', quantity: -3,
        batch_number: 'LOT-A', reference_no: 'MAN-11', reference_type: 'manual_transaction',
        operator: '仓管', unit_cost: 2, sourceLineKey: `manual_transaction:MAN-11:item:${id}`,
      });
    }
    expect(lines().map(line => line.signed_quantity)).toEqual([-3, -3]);
    expect(totals()).toMatchObject({ quantity: 6, value: 12 });
  });

  test.each([[3, 3], [3, 7]])('production issue preserves distinct source rows with quantities %s and %s', async (first, second) => {
    const issue = (id, quantity) => issueOutboundItemFromDetail({
      connection, item: { id, material_id: 1, actual_quantity: quantity }, locationId: 2,
      outboundNo: 'OUT-11', sourceId: 11, operator: '仓管', referenceType: 'production_task',
      unitId: 1, batchNumber: 'LOT-A',
    });
    await issue(1, first);
    await issue(2, second);
    expect(lines().map(line => line.signed_quantity)).toEqual([-first, -second]);
    await issue(1, first);
    expect(lines()).toHaveLength(2);
    expect(totals()).toMatchObject({ quantity: first + second, value: (first + second) * 2 });
  });

  test('transfer preserves both source rows and their separate inbound and outbound legs', async () => {
    for (const id of [1, 2]) {
      await Inventory.transferStock({
        materialId: 1, fromLocationId: 2, toLocationId: 3, quantity: 3, batchNumber: 'LOT-A',
        referenceNo: 'TR-11', referenceType: 'transfer', sourceId: 11,
        sourceLineKey: `transfer:11:item:${id}`, operator: '仓管',
      }, connection);
    }
    expect(lines()).toHaveLength(4);
    expect(lines().reduce((sum, line) => sum + line.signed_quantity, 0)).toBe(0);
    expect(lines().filter(line => line.location_id === 2).map(line => line.signed_quantity)).toEqual([-3, -3]);
    expect(lines().filter(line => line.location_id === 3).map(line => line.signed_quantity)).toEqual([3, 3]);
    expect(database.prepare('SELECT source_id FROM inventory_posting_documents').get().source_id).toBe(11);
  });

  test('legacy fallback and explicitly supplied keys remain stable despite unrelated request keys', async () => {
    await Inventory.updateStock(movement({ idempotencyKey: 'request-1' }), connection);
    await Inventory.updateStock(movement({ idempotencyKey: 'request-2' }), connection);
    expect(lines()).toHaveLength(1);
    expect(lines()[0].source_line_key).toBe('inbound:inbound:IN-11:1:2:LOT-A');
    await Inventory.updateStock(movement({ sourceLineKey: 'existing-explicit-line', idempotencyKey: 'request-3' }), connection);
    await Inventory.updateStock(movement({ sourceLineKey: 'existing-explicit-line', idempotencyKey: 'request-4' }), connection);
    expect(lines()).toHaveLength(2);
    expect(lines()[1].source_line_key).toBe('existing-explicit-line:2:LOT-A');
    expect(totals()).toMatchObject({ quantity: 6, value: 12 });
  });

  test('a changed quantity on the same stable line is rejected instead of silently appending a new version', async () => {
    await Inventory.updateStock(movement({ sourceLineKey: 'inbound:11:item:1' }), connection);
    await expect(Inventory.updateStock(movement({ sourceLineKey: 'inbound:11:item:1', quantity: 7 }), connection))
      .rejects.toMatchObject({ code: 'SNAPSHOT_IMMUTABLE' });
    expect(lines()).toHaveLength(1);
    expect(totals()).toMatchObject({ quantity: 3, value: 6 });
  });
});
