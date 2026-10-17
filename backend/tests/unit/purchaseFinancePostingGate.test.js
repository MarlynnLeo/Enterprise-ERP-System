/* global afterEach, beforeEach, describe, expect, jest, test */
jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/models/ar', () => ({}));
jest.mock('../../src/models/ap', () => ({}));
jest.mock('../../src/models/finance', () => ({}));
jest.mock('../../src/models/tax', () => ({}));
jest.mock('../../src/services/system/SystemConfigService', () => ({}));
jest.mock('../../src/services/business/DocumentLinkService', () => ({}));
jest.mock('../../src/services/InventoryPostingService', () => ({
  getApprovalBySource: jest.fn(), requireApprovedForTransaction: jest.fn(),
}));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

const db = require('../../src/config/db');
const Posting = require('../../src/services/InventoryPostingService');
const Finance = require('../../src/services/external/FinanceIntegrationService');
const { hashSnapshot } = require('../../src/utils/inventoryPostingSnapshot');

describe('purchase finance exact posting gate', () => {
  let connection;
  let movement;

  beforeEach(() => {
    connection = {
      execute: jest.fn(), beginTransaction: jest.fn(), rollback: jest.fn(), release: jest.fn(),
    };
    db.pool.getConnection.mockResolvedValue(connection);
    movement = {
      id: 70, source_type: 'purchase_receipt', source_id: 12, source_no: 'RCV-12',
      finance_status: 'approved', locked: 1,
    };
    Posting.getApprovalBySource.mockReset().mockImplementation(async () => ({ movement }));
    Posting.requireApprovedForTransaction.mockReset().mockImplementation(async () => movement);
  });

  afterEach(() => jest.restoreAllMocks());

  test('canonical receipt approval is locked by exact posting ID and tied to the receipt ID', async () => {
    await expect(Finance.requireApprovedInventoryPosting(connection, 'purchase_receipt', 'RCV-12', 12))
      .resolves.toBe(movement);

    expect(Posting.getApprovalBySource).toHaveBeenCalledWith({
      sourceType: 'purchase_receipt', sourceId: 12, sourceNo: 'RCV-12',
    }, connection);
    expect(Posting.requireApprovedForTransaction).toHaveBeenCalledWith(connection, {
      posting_document_id: 70, reference_no: 'RCV-12',
    });
  });

  test.each(['inbound', 'purchase_inbound', 'batch_create'])(
    'historical %s can pass only with matching frozen receipt evidence', async (sourceType) => {
      movement.source_type = sourceType;
      movement.source_id = null;
      const payload = {
        transactionType: 'purchase_inbound', referenceNo: 'RCV-12', referenceType: sourceType,
        signedQuantity: 2, unitCost: 10, receiptId: 12,
      };
      connection.execute.mockResolvedValue([[{
        id: 101, transaction_type: 'purchase_inbound', reference_no: 'RCV-12', reference_type: sourceType,
        signed_quantity: 2, unit_cost: 10, payload_json: JSON.stringify(payload), snapshot_hash: hashSnapshot(payload),
      }]]);

      await expect(Finance.requireApprovedInventoryPosting(connection, 'purchase_receipt', 'RCV-12', 12))
        .resolves.toBe(movement);
      expect(Posting.requireApprovedForTransaction).toHaveBeenCalledWith(connection, {
        posting_document_id: 70, reference_no: 'RCV-12',
      });
    }
  );

  test.each(['pending', 'rejected', 'reversed'])(
    'a %s receipt posting cannot authorize finance generation', async (status) => {
      movement.finance_status = status;
      await expect(Finance.requireApprovedInventoryPosting(connection, 'purchase_receipt', 'RCV-12', 12))
        .rejects.toMatchObject({ code: 'INVENTORY_POSTING_REQUIRED' });
      expect(Posting.requireApprovedForTransaction).not.toHaveBeenCalled();
    }
  );

  test('a stale approval lookup is rejected by the locked posting recheck', async () => {
    const error = Object.assign(new Error('posting reversed during retry'), { code: 'INVENTORY_POSTING_REQUIRED' });
    Posting.requireApprovedForTransaction.mockRejectedValue(error);
    await expect(Finance.requireApprovedInventoryPosting(connection, 'purchase_receipt', 'RCV-12', 12)).rejects.toBe(error);
  });

  test('a same-number posting owned by another receipt cannot pass the finance gate', async () => {
    movement.source_id = 99;
    await expect(Finance.requireApprovedInventoryPosting(connection, 'purchase_receipt', 'RCV-12', 12))
      .rejects.toMatchObject({ code: 'POSTING_SOURCE_CHANGED' });
  });

  test.each(['generateAPInvoiceFromPurchaseReceipt', 'generateInputTaxInvoiceFromPurchaseReceipt'])(
    '%s invokes the canonical gate with the actual receipt ID', async (method) => {
      const afterGate = new Error('stop before finance writes');
      jest.spyOn(Finance, 'lockSourceDocument').mockRejectedValue(afterGate);

      await expect(Finance[method]({ id: 12, receipt_no: 'RCV-12' }, 60, { force: true })).rejects.toBe(afterGate);

      expect(Posting.getApprovalBySource).toHaveBeenCalledWith({
        sourceType: 'purchase_receipt', sourceId: 12, sourceNo: 'RCV-12',
      }, connection);
      expect(Posting.requireApprovedForTransaction).toHaveBeenCalledWith(connection, {
        posting_document_id: 70, reference_no: 'RCV-12',
      });
      expect(connection.rollback).toHaveBeenCalledTimes(1);
    }
  );

  test('the optional order AP path verifies each completed receipt by ID before any invoice writes', async () => {
    const afterGate = new Error('stop before finance writes');
    jest.spyOn(Finance, 'lockSourceDocument').mockRejectedValue(afterGate);
    connection.execute.mockResolvedValue([[{ id: 12, receipt_no: 'RCV-12' }]]);

    await expect(Finance.generateAPInvoiceFromPurchaseOrder({ id: 4 }, 60, { force: true, allowOrderLevel: true }))
      .rejects.toBe(afterGate);

    expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('SELECT id, receipt_no'), [4]);
    expect(Posting.getApprovalBySource).toHaveBeenCalledWith({
      sourceType: 'purchase_receipt', sourceId: 12, sourceNo: 'RCV-12',
    }, connection);
    expect(Posting.requireApprovedForTransaction).toHaveBeenCalledWith(connection, {
      posting_document_id: 70, reference_no: 'RCV-12',
    });
  });
});
