/* global describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({
  pool: {},
}));

const InventoryPostingService = require('../../src/services/InventoryPostingService');
const { INVENTORY_TRANSFER_TRANSITIONS } = require('../../src/constants/statusRegistry');

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
    const connection = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([[
          {
            id: 64,
            posting_kind: 'movement',
            source_type: 'batch_create',
            finance_status: 'pending',
          },
        ]])
        .mockResolvedValueOnce([[]]),
    };

    const result = await InventoryPostingService.getApprovalBySource(
      {
        sourceType: 'inbound',
        sourceId: 12,
        sourceNo: 'RCV-20260909-0001',
      },
      connection
    );

    expect(result.current.id).toBe(64);
    expect(connection.execute.mock.calls[0][0]).toContain("d.source_type = 'batch_create'");
    expect(connection.execute.mock.calls[0][0]).toContain("transaction_type = 'purchase_inbound'");
  });
});
