/* global describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({
  pool: {},
}));

jest.mock('../../src/services/business/CodeGeneratorService', () => ({
  nextCode: jest.fn().mockResolvedValue('INV-NEW'),
}));

const InventoryPostingService = require('../../src/services/InventoryPostingService');
const { INVENTORY_TRANSFER_TRANSITIONS } = require('../../src/constants/statusRegistry');
const { hashSnapshot } = require('../../src/utils/inventoryPostingSnapshot');

describe('inventory posting lifecycle', () => {
  test('reuses the latest active posting instead of creating duplicate pending approvals', async () => {
    const pending = {
      id: 12,
      posting_no: 'INV-PENDING',
      posting_sequence: 2,
      finance_status: 'pending',
    };
    const connection = {
      execute: jest.fn().mockResolvedValueOnce([[pending]]),
    };

    const result = await InventoryPostingService._getOrCreateDocument(connection, {
      sourceType: 'inbound',
      sourceId: 8,
      sourceNo: 'IN-8',
      transactionDate: '2026-09-07',
      businessApprovedBy: 'warehouse',
    });

    expect(result).toBe(pending);
    expect(connection.execute).toHaveBeenCalledTimes(1);
    expect(connection.execute.mock.calls[0][0]).toContain(
      'ORDER BY posting_sequence DESC, id DESC LIMIT 1 FOR UPDATE'
    );
  });

  test('creates exactly the next sequence when the latest posting was rejected', async () => {
    const connection = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([[
          {
            id: 12,
            posting_no: 'INV-REJECTED',
            posting_sequence: 2,
            finance_status: 'rejected',
          },
        ]])
        .mockResolvedValueOnce([{ insertId: 13 }])
        .mockResolvedValueOnce([[
          {
            id: 13,
            posting_no: 'INV-NEW',
            posting_sequence: 3,
            finance_status: 'pending',
          },
        ]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };

    const result = await InventoryPostingService._getOrCreateDocument(connection, {
      sourceType: 'inbound',
      sourceId: 8,
      sourceNo: 'IN-8',
      transactionDate: '2026-09-07',
      businessApprovedById: 9,
      businessApprovedBy: 'warehouse',
    });

    expect(result.posting_sequence).toBe(3);
    const insertCall = connection.execute.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO inventory_posting_documents')
    );
    expect(insertCall).toBeTruthy();
    expect(insertCall[1][4]).toBe(3);
  });

  test('requires a transfer to be completed before its finance posting can be created', () => {
    expect(INVENTORY_TRANSFER_TRANSITIONS.pending).toEqual(['completed', 'cancelled']);
    expect(INVENTORY_TRANSFER_TRANSITIONS.pending).not.toContain('approved');
  });

  test('finds legacy batch-created purchase postings from a purchase receipt page', async () => {
    const payload = { materialId: 3, locationId: 1, signedQuantity: 2, unitId: 1,
      unitCost: 10, totalValue: 20, transactionType: 'purchase_inbound', referenceType: 'batch_create',
      referenceNo: 'RCV-20260909-0001', receiptId: 12, receiptNo: 'RCV-20260909-0001',
      batchNumber: 'BATCH-1', operator: 'Buyer', transactionDate: '2026-09-09' };
    const connection = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([[
          {
            id: 64,
            posting_kind: 'movement',
            source_type: 'batch_create',
            source_no: 'RCV-20260909-0001',
            finance_status: 'pending',
          },
        ]])
        .mockResolvedValueOnce([[{ id: 640, posting_document_id: 64, material_id: 3, location_id: 1,
          signed_quantity: 2, unit_id: 1, unit_cost: 10, total_value: 20,
          transaction_type: 'purchase_inbound', reference_type: 'batch_create',
          reference_no: 'RCV-20260909-0001', batch_number: 'BATCH-1', operator: 'Buyer',
          transaction_date: '2026-09-09', payload_json: JSON.stringify(payload), snapshot_hash: hashSnapshot(payload) }]])
        .mockResolvedValueOnce([[]]),
    };

    const result = await InventoryPostingService.getApprovalBySource(
      {
        sourceType: 'purchase_receipt',
        sourceId: 12,
        sourceNo: 'RCV-20260909-0001',
      },
      connection
    );

    expect(result.current.id).toBe(64);
    expect(result.current.source_context).toEqual({
      sourceType: 'purchase_receipt', sourceId: 12, sourceNo: 'RCV-20260909-0001',
    });
    expect(connection.execute.mock.calls[0][0]).toContain("d.source_type IN ('inbound', 'purchase_inbound', 'batch_create')");
    expect(connection.execute.mock.calls[1][0]).toContain('FROM inventory_posting_lines');
    expect(connection.execute.mock.calls[0][1]).toEqual([
      'purchase_receipt', 12, 'RCV-20260909-0001', 'RCV-20260909-0001', 12,
    ]);
  });
});
