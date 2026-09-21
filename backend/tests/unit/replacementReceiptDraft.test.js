/* global beforeEach, describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/models/purchase', () => ({
  generateReceiptNo: jest.fn(async () => 'PR-REPLACE-1'),
}));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/services/InventoryService', () => ({ getBatchMaterialInfo: jest.fn() }));
jest.mock('../../src/services/business/InventoryTraceabilityService', () => ({
  handlePurchaseReceipt: jest.fn(),
}));
jest.mock('../../src/services/business/DocumentLinkService', () => ({ tryAutoLink: jest.fn() }));
jest.mock('../../src/services/business/DomainEventService', () => ({
  enqueue: jest.fn(),
  dispatchSoon: jest.fn(),
}));
jest.mock('../../src/utils/codeGenerator', () => ({
  CodeGenerators: { generateReplacementOrderCode: jest.fn(async () => 'NEW-REPLACEMENT-BATCH') },
}));
jest.mock('../../src/config/financeConfig', () => ({
  financeConfig: { get: jest.fn(() => 0.13) },
}));

const db = require('../../src/config/db');
const controller = require('../../src/controllers/business/quality/replacementOrderController');
const QualityIntegrationService = require('../../src/services/business/QualityIntegrationService');
const InventoryService = require('../../src/services/InventoryService');
const InventoryTraceabilityService = require('../../src/services/business/InventoryTraceabilityService');
const DocumentLinkService = require('../../src/services/business/DocumentLinkService');
const DomainEventService = require('../../src/services/business/DomainEventService');

const replacement = {
  id: 10,
  replacement_no: 'RP-10',
  ncp_id: 11,
  ncp_no: 'NCP-11',
  return_no: 'RT-12',
  purchase_order_no: 'PO-2',
  material_id: 3,
  material_code: 'M-3',
  material_name: 'Material',
  supplier_id: 5,
  supplier_name: 'Supplier',
  quantity: 10,
  received_quantity: 0,
  status: 'pending',
  created_by: 8,
};
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
function replacementConnection() {
  return {
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
    query: jest.fn(async (sql) => {
      if (sql.includes('FROM replacement_orders')) return [[{ ...replacement }]];
      if (sql.includes('FROM locations')) return [[{ id: 6, name: 'Warehouse' }]];
      if (sql.includes('FROM units')) return [[{ name: '个' }]];
      if (sql.includes('FROM purchase_orders'))
        return [
          [
            {
              order_id: 2,
              order_no: 'PO-2',
              order_item_id: 4,
              price: 20,
              tax_rate: 0.13,
              unit_id: 1,
            },
          ],
        ];
      if (sql.includes('FROM nonconforming_products'))
        return [[{ id: 11, ncp_no: 'NCP-11', inspection_id: 7, inspection_no: 'OLD-FAILED-QI' }]];
      if (sql.includes('FROM purchase_returns')) return [[{ id: 12, return_no: 'RT-12' }]];
      if (sql.includes('FROM document_links')) return [[{ count: 0 }]];
      if (sql.includes('INSERT INTO purchase_receipts')) return [{ insertId: 9 }];
      if (
        sql.includes('INSERT INTO purchase_receipt_items') ||
        sql.includes('INSERT INTO nonconforming_product_actions') ||
        sql.includes('UPDATE replacement_orders')
      )
        return [{ affectedRows: 1 }];
      throw new Error(`Unexpected query: ${sql}`);
    }),
  };
}
const inserted = (connection, table) => {
  const call = connection.query.mock.calls.find(([sql]) => sql.includes(`INSERT INTO ${table} (`));
  const columns = call[0]
    .match(/INSERT INTO \w+\s*\(([^)]+)\)/)[1]
    .split(',')
    .map((value) => value.trim());
  return Object.fromEntries(columns.map((column, index) => [column, call[1][index]]));
};

describe('replacement deliveries await their own quality decision', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    InventoryService.getBatchMaterialInfo.mockResolvedValue(
      new Map([
        [
          3,
          {
            code: 'M-3',
            name: 'Material',
            locationId: 6,
            unitId: 1,
            costPrice: 20,
          },
        ],
      ])
    );
  });

  test('confirmation creates a draft with zero released quantity and does not post stock or completion events', async () => {
    const connection = replacementConnection();
    db.pool.getConnection.mockResolvedValue(connection);
    const res = response();
    await controller.confirmReceipt(
      {
        params: { id: '10' },
        body: { receivedQuantity: 6, actualDate: '2026-09-20' },
        user: { id: 8, real_name: 'Receiver' },
      },
      res
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(inserted(connection, 'purchase_receipts')).toMatchObject({
      status: 'draft',
      inspection_id: null,
      from_inspection: 0,
      total_amount: 0,
      total_tax_amount: 0,
    });
    expect(inserted(connection, 'purchase_receipt_items')).toMatchObject({
      order_item_id: 4,
      received_quantity: 6,
      qualified_quantity: 0,
      batch_number: 'NEW-REPLACEMENT-BATCH',
      total_amount: 0,
    });
    expect(InventoryTraceabilityService.handlePurchaseReceipt).not.toHaveBeenCalled();
    expect(DomainEventService.enqueue).not.toHaveBeenCalled();
    expect(DomainEventService.dispatchSoon).not.toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(
      DocumentLinkService.tryAutoLink.mock.calls.some(
        (call) => call[0] === 'nonconforming_product' && call[3] === 'purchase_receipt'
      )
    ).toBe(false);
    expect(DocumentLinkService.tryAutoLink).toHaveBeenCalledWith(
      'replacement_order',
      10,
      'RP-10',
      'purchase_receipt',
      9,
      'PR-REPLACE-1',
      8,
      connection
    );
  });

  test('missing purchase source aborts before inserting a replacement receipt', async () => {
    const connection = replacementConnection();
    await expect(
      QualityIntegrationService.createReplacementReceipt(
        {
          replacementOrder: { ...replacement, purchase_order_no: null },
          receivedQuantity: 6,
          user: { id: 8, real_name: 'Receiver' },
        },
        connection
      )
    ).rejects.toThrow('换货收货必须关联原采购订单');
    expect(
      connection.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO purchase_receipts'))
    ).toBe(false);
  });
});
