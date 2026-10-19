/* global afterEach, beforeEach, describe, expect, jest, test */
jest.mock('../../src/config/db', () => ({ pool: { execute: jest.fn() } }));
jest.mock('../../src/events/EventBus', () => ({ on: jest.fn() }));
jest.mock('../../src/services/business/SalesOrderStatusService', () => ({ checkAndReleasePendingOrders: jest.fn() }));
jest.mock('../../src/services/business/DLQService', () => ({ registerHandler: jest.fn(), recordSideEffectFailure: jest.fn() }));
jest.mock('../../src/services/InventoryPostingService', () => ({
  STATUS: { APPROVED: 'approved' }, get: jest.fn(), getApprovalBySource: jest.fn(),
  findApprovedForTransaction: jest.fn(),
}));
jest.mock('../../src/services/external/FinanceIntegrationService', () => ({
  generateAPInvoiceFromPurchaseReceipt: jest.fn(), generateInputTaxInvoiceFromPurchaseReceipt: jest.fn(),
}));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

const db = require('../../src/config/db');
const Posting = require('../../src/services/InventoryPostingService');
const Finance = require('../../src/services/external/FinanceIntegrationService');
const SalesStatus = require('../../src/services/business/SalesOrderStatusService');
const { hashSnapshot } = require('../../src/utils/inventoryPostingSnapshot');
const subscriber = require('../../src/events/subscribers/FinanceSubscriber');

describe('finance purchase event source evidence', () => {
  let document;
  let receipt;
  let replay;

  function frozenLine(referenceType, receiptId = 12) {
    const payload = {
      materialId: 7, locationId: 3, signedQuantity: 2, unitCost: 10, totalValue: 20,
      transactionType: 'purchase_inbound', referenceType, referenceNo: 'SHARED-12',
      receiptId, receiptNo: receiptId == null ? null : 'SHARED-12',
    };
    return {
      id: 101, posting_document_id: 70, material_id: 7, location_id: 3,
      signed_quantity: 2, unit_cost: 10, total_value: 20,
      transaction_type: 'purchase_inbound', reference_type: referenceType, reference_no: 'SHARED-12',
      payload_json: JSON.stringify(payload), snapshot_hash: hashSnapshot(payload),
    };
  }

  beforeEach(() => {
    document = {
      id: 70, source_type: 'purchase_receipt', source_id: 12, source_no: 'SHARED-12',
      posting_kind: 'movement', finance_status: 'approved', locked: 1, finance_approved_by: 60,
      lines: [frozenLine('purchase_receipt')],
    };
    receipt = { id: 12, receipt_no: 'SHARED-12', status: 'completed' };
    Posting.get.mockImplementation(async () => document);
    Posting.getApprovalBySource.mockImplementation(async () => ({ movement: document }));
    Posting.findApprovedForTransaction.mockReset();
    db.pool.execute.mockReset().mockImplementation(async (sql, params) => {
      if (sql.includes('FROM inventory_posting_lines')) return [document.lines];
      if (sql.includes('FROM inventory_inbound')) return [[]];
      if (sql.includes('FROM purchase_receipts')) {
        expect(params).toEqual([12]);
        return [[receipt]];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    replay = jest.spyOn(subscriber, 'replayInventoryPostingCosts').mockResolvedValue(undefined);
    jest.spyOn(subscriber, 'existsBySource').mockResolvedValue(false);
    jest.spyOn(subscriber, 'taxInvoiceExistsByRelatedDocument').mockResolvedValue(false);
    Finance.generateAPInvoiceFromPurchaseReceipt.mockReset().mockResolvedValue({ invoiceId: 1 });
    Finance.generateInputTaxInvoiceFromPurchaseReceipt.mockReset().mockResolvedValue({ invoiceId: 2 });
    SalesStatus.checkAndReleasePendingOrders.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  test.each(['purchase_receipt', 'inbound', 'purchase_inbound', 'batch_create'])(
    '%s purchase evidence reaches both canonical receipt finance gates', async (sourceType) => {
      document.source_type = sourceType;
      document.source_id = sourceType === 'purchase_receipt' ? 12 : null;
      document.lines = [frozenLine(sourceType)];

      await subscriber.handleInventoryPostingApproved({ postingDocumentId: 70, sourceNo: 'WRONG-EVENT-NUMBER' });

      expect(Posting.getApprovalBySource).toHaveBeenCalledWith({
        sourceType: 'purchase_receipt', sourceId: 12, sourceNo: 'SHARED-12',
      }, db.pool);
      expect(Finance.generateAPInvoiceFromPurchaseReceipt).toHaveBeenCalledWith(receipt, 60);
      expect(Finance.generateInputTaxInvoiceFromPurchaseReceipt).toHaveBeenCalledWith(receipt, 60);
      expect(replay).toHaveBeenCalledWith(document);
      expect(Posting.findApprovedForTransaction).not.toHaveBeenCalled();
    }
  );

  test('a same-number warehouse inbound without purchase evidence cannot generate AP or input tax', async () => {
    document.source_type = 'inbound';
    document.source_id = 99;
    document.lines = [{ transaction_type: 'manual_in', signed_quantity: 2, payload_json: '{}' }];

    await subscriber.handleInventoryPostingApproved({ postingDocumentId: 70, sourceNo: 'SHARED-12' });

    expect(Finance.generateAPInvoiceFromPurchaseReceipt).not.toHaveBeenCalled();
    expect(Finance.generateInputTaxInvoiceFromPurchaseReceipt).not.toHaveBeenCalled();
    expect(db.pool.execute.mock.calls.some(([sql]) => sql.includes('FROM purchase_receipts'))).toBe(false);
    expect(replay).toHaveBeenCalledWith(document);
  });

  test.each(['missing', 'renumbered', 'reversed', 'draft'])(
    'a %s receipt cannot fall through to another finance flow', async (state) => {
      if (state === 'missing') receipt = undefined;
      else if (state === 'renumbered') receipt.receipt_no = 'OTHER';
      else receipt.status = state;

      await expect(subscriber.handleInventoryPostingApproved({ postingDocumentId: 70, sourceNo: 'SHARED-12' }))
        .rejects.toThrow('采购收货单');

      expect(Finance.generateAPInvoiceFromPurchaseReceipt).not.toHaveBeenCalled();
      expect(replay).not.toHaveBeenCalled();
    }
  );

  test('the purchase completion gate cannot borrow a same-number warehouse approval', async () => {
    document.source_type = 'inbound';
    document.source_id = 99;
    document.lines = [{ transaction_type: 'manual_in', signed_quantity: 2, payload_json: '{}' }];

    await subscriber.handlePurchaseReceiptCompleted({ receiptId: 12, currentUserId: 60 });

    expect(Finance.generateAPInvoiceFromPurchaseReceipt).not.toHaveBeenCalled();
    expect(Finance.generateInputTaxInvoiceFromPurchaseReceipt).not.toHaveBeenCalled();
    expect(Posting.findApprovedForTransaction).not.toHaveBeenCalled();
  });

  test('an unrelated sales reservation failure cannot block purchase AP, tax or cost and remains retryable', async () => {
    const payload = { postingDocumentId: 70, sourceNo: 'SHARED-12', __domainEvent: { id: 35 } };
    SalesStatus.checkAndReleasePendingOrders.mockRejectedValueOnce(new Error('old order reservation failed'));
    await expect(subscriber.handleInventoryPostingApproved(payload)).rejects.toThrow('old order reservation failed');
    expect(Finance.generateAPInvoiceFromPurchaseReceipt).toHaveBeenCalledTimes(1);
    expect(Finance.generateInputTaxInvoiceFromPurchaseReceipt).toHaveBeenCalledTimes(1);
    expect(replay).toHaveBeenCalledTimes(1);
    expect(replay.mock.invocationCallOrder[0]).toBeLessThan(SalesStatus.checkAndReleasePendingOrders.mock.invocationCallOrder[0]);

    // The persisted AP/tax documents are found on the domain-event retry.
    subscriber.existsBySource.mockResolvedValue(true);
    subscriber.taxInvoiceExistsByRelatedDocument.mockResolvedValue(true);
    await expect(subscriber.handleInventoryPostingApproved(payload)).resolves.toBeUndefined();
    expect(Finance.generateAPInvoiceFromPurchaseReceipt).toHaveBeenCalledTimes(1);
    expect(Finance.generateInputTaxInvoiceFromPurchaseReceipt).toHaveBeenCalledTimes(1);
    expect(SalesStatus.checkAndReleasePendingOrders).toHaveBeenCalledTimes(2);
  });
});
