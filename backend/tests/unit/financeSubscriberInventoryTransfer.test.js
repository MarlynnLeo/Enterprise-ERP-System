/* global beforeAll, beforeEach, describe, expect, jest, test */

const mockRegisteredHandlers = new Map();
const mockExecute = jest.fn();
const mockGenerateInboundCostEntry = jest.fn();
const mockGenerateOutboundCostEntry = jest.fn();
const mockGenerateOutsourcedIssueEntry = jest.fn();
const mockGenerateOutsourcedReceiptEntry = jest.fn();
const mockResolvePurchaseReceipt = jest.fn();
const mockReleaseOrders = jest.fn();
let subscriber;
const mockPosting = {
  id: 91,
  source_type: 'transfer',
  posting_kind: 'movement',
  finance_status: 'approved',
  locked: 1,
  finance_approved_by: 60,
  lines: [
    { transaction_type: 'transfer_out', signed_quantity: -2 },
    { transaction_type: 'transfer_in', signed_quantity: 2 },
  ],
};

jest.mock('../../src/services/business/DLQService', () => ({
  registerHandler: jest.fn((name, handler) => mockRegisteredHandlers.set(name, handler)),
  recordSideEffectFailure: jest.fn(),
}));

jest.mock('../../src/events/EventBus', () => ({
  on: jest.fn(),
}));

jest.mock('../../src/config/db', () => ({
  pool: { execute: mockExecute },
}));

jest.mock('../../src/services/InventoryPostingService', () => ({
  STATUS: { APPROVED: 'approved' },
  get: jest.fn(async () => mockPosting),
}));
jest.mock('../../src/services/business/PurchaseReceiptPostingSourceService', () => ({
  resolve: mockResolvePurchaseReceipt,
}));
jest.mock('../../src/services/business/SalesOrderStatusService', () => ({
  checkAndReleasePendingOrders: mockReleaseOrders,
}));

jest.mock('../../src/services/business/InventoryCostService', () => ({
  generateInboundCostEntry: mockGenerateInboundCostEntry,
  generateOutboundCostEntry: mockGenerateOutboundCostEntry,
}));

jest.mock('../../src/services/external/FinanceIntegrationService', () => ({
  generateOutsourcedIssueEntry: mockGenerateOutsourcedIssueEntry,
  generateOutsourcedReceiptEntry: mockGenerateOutsourcedReceiptEntry,
}));
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('FinanceSubscriber transfer posting', () => {
  beforeAll(() => {
    jest.resetModules();
    subscriber = require('../../src/events/subscribers/FinanceSubscriber');
  });

  beforeEach(() => {
    mockExecute.mockReset();
    mockGenerateInboundCostEntry.mockReset();
    mockGenerateOutboundCostEntry.mockReset();
    mockGenerateOutsourcedIssueEntry.mockReset();
    mockGenerateOutsourcedReceiptEntry.mockReset();
    mockResolvePurchaseReceipt.mockReset().mockResolvedValue(null);
    mockReleaseOrders.mockReset().mockResolvedValue(undefined);
    Object.assign(mockPosting, {
      source_type: 'transfer',
      posting_kind: 'movement',
      finance_status: 'approved',
      locked: 1,
      finance_approved_by: 60,
      lines: [
        { transaction_type: 'transfer_out', signed_quantity: -2 },
        { transaction_type: 'transfer_in', signed_quantity: 2 },
      ],
    });
  });

  test('does not generate a cost voucher for an internal transfer', async () => {
    const handler = mockRegisteredHandlers.get('Finance:InventoryPostingApproved');
    expect(handler).toEqual(expect.any(Function));

    await handler({ postingDocumentId: mockPosting.id, sourceNo: 'DB20260908001' });

    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockReleaseOrders).not.toHaveBeenCalled();
  });

  test('production supplements do not create a second generic issue cost voucher', async () => {
    await subscriber.replayInventoryPostingCosts({
      id: 92,
      source_type: 'outbound_supplement',
      lines: [{ transaction_type: 'production_outbound', signed_quantity: -5 }],
    });
    expect(mockGenerateOutboundCostEntry).not.toHaveBeenCalled();
    expect(mockGenerateInboundCostEntry).not.toHaveBeenCalled();
  });

  test('routes a manual posting directly to generic cost replay', async () => {
    Object.assign(mockPosting, {
      source_type: 'manual_transaction',
      lines: [
        {
          id: 101,
          material_id: 7,
          location_id: 3,
          transaction_type: 'in',
          reference_type: 'manual_transaction',
          reference_no: 'MT260909001',
          signed_quantity: 1,
          unit_cost: 10,
          total_value: 10,
          posted_value: '10.123456',
          transaction_date: '2026-09-09',
        },
      ],
    });

    const handler = mockRegisteredHandlers.get('Finance:InventoryPostingApproved');
    await handler({ postingDocumentId: mockPosting.id, sourceNo: 'MT260909001' });

    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockGenerateInboundCostEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        reference_no: 'MT260909001',
        posting_line_id: 101,
        total_value: '10.123456',
      }),
      { userId: 60 }
    );
  });

  test('queries outsourced tables using only columns present in the runtime schema', async () => {
    Object.assign(mockPosting, {
      source_type: 'outsourced_processing_material',
      lines: [{ transaction_type: 'outsourced_outbound', signed_quantity: -1 }],
    });
    mockExecute
      .mockResolvedValueOnce([[{ id: 12, processing_no: 'OSP260909001' }]])
      .mockResolvedValueOnce([
        [{ id: 22, material_id: 7, material_name: 'Material', quantity: 1, unit_price: 10 }],
      ]);

    const handler = mockRegisteredHandlers.get('Finance:InventoryPostingApproved');
    await handler({ postingDocumentId: mockPosting.id, sourceNo: 'OSP260909001' });

    expect(mockExecute.mock.calls[0][0]).not.toContain('created_by');
    expect(mockGenerateOutsourcedIssueEntry).toHaveBeenCalledWith(
      expect.objectContaining({ id: 12, created_by: 60 }),
      expect.any(Array)
    );
  });

  test('routes legacy batch-created purchase postings through the purchase receipt flow', async () => {
    Object.assign(mockPosting, {
      source_type: 'batch_create',
      lines: [{ transaction_type: 'purchase_inbound', signed_quantity: 40 }],
    });
    mockResolvePurchaseReceipt.mockResolvedValueOnce({ receiptId: 12, receiptNo: 'RCV-20260909-0001' });
    mockExecute.mockResolvedValueOnce([[{ id: 12, receipt_no: 'RCV-20260909-0001', status: 'completed' }]]);
    const purchaseReceiptHandler = jest
      .spyOn(subscriber, 'handlePurchaseReceiptCompleted')
      .mockResolvedValue(undefined);
    const postingCostReplay = jest
      .spyOn(subscriber, 'replayInventoryPostingCosts')
      .mockResolvedValue(undefined);

    const handler = mockRegisteredHandlers.get('Finance:InventoryPostingApproved');
    await handler({ postingDocumentId: mockPosting.id, sourceNo: 'RCV-20260909-0001' });

    expect(purchaseReceiptHandler).toHaveBeenCalledWith({ receiptId: 12, currentUserId: 60 });
    expect(mockReleaseOrders).toHaveBeenCalledWith(null, { throwOnError: true });
    expect(postingCostReplay).toHaveBeenCalledWith(mockPosting);
    purchaseReceiptHandler.mockRestore();
    postingCostReplay.mockRestore();
  });

  test('production approval and its replay recheck stock after completing source cost work', async () => {
    Object.assign(mockPosting, {
      source_type: 'inbound',
      lines: [{ transaction_type: 'production_inbound', signed_quantity: 5 }],
    });
    mockExecute.mockResolvedValue([[{ task_id: 13, task_code: 'PT-13' }]]);
    const production = jest.spyOn(subscriber, 'handleProductionTaskCompleted').mockResolvedValue(undefined);
    try {
      await subscriber.handleInventoryPostingApproved({ postingDocumentId: 91, sourceNo: 'IN-91' });
      await subscriber.handleInventoryPostingApproved({ postingDocumentId: 91, sourceNo: 'IN-91' });
      expect(mockReleaseOrders).toHaveBeenCalledTimes(2);
      expect(production.mock.invocationCallOrder[0]).toBeLessThan(mockReleaseOrders.mock.invocationCallOrder[0]);
    } finally { production.mockRestore(); }
  });

  test.each(['pending', 'rejected'])('%s stock cannot release a sales order', async (status) => {
    Object.assign(mockPosting, {
      finance_status: status, source_type: 'inbound',
      lines: [{ transaction_type: 'production_inbound', signed_quantity: 5 }],
    });
    await expect(subscriber.handleInventoryPostingApproved({ postingDocumentId: 91, sourceNo: 'IN-91' }))
      .rejects.toMatchObject({ code: 'INVENTORY_POSTING_NOT_APPROVED' });
    expect(mockReleaseOrders).not.toHaveBeenCalled();
  });

  test('reversals do not release stock through the normal approval handler', async () => {
    Object.assign(mockPosting, {
      posting_kind: 'reversal', source_type: 'inbound',
      lines: [{ transaction_type: 'production_inbound', signed_quantity: 5 }],
    });
    await subscriber.handleInventoryPostingApproved({ postingDocumentId: 91, sourceNo: 'REV-91' });
    expect(mockReleaseOrders).not.toHaveBeenCalled();
  });

  test('reservation errors remain retryable after the source financial work has run', async () => {
    Object.assign(mockPosting, {
      source_type: 'inbound',
      lines: [{ transaction_type: 'production_inbound', signed_quantity: 5 }],
    });
    mockExecute.mockResolvedValue([[{ task_id: 13, task_code: 'PT-13' }]]);
    const production = jest.spyOn(subscriber, 'handleProductionTaskCompleted').mockResolvedValue(undefined);
    mockReleaseOrders.mockRejectedValue(new Error('reservation unavailable'));
    const handler = mockRegisteredHandlers.get('EventBus:INVENTORY_POSTING_APPROVED');
    try {
      await expect(handler({ args: [{ postingDocumentId: 91, sourceNo: 'IN-91' }] }))
        .rejects.toThrow('reservation unavailable');
      expect(production).toHaveBeenCalledTimes(1);
      expect(production.mock.invocationCallOrder[0]).toBeLessThan(mockReleaseOrders.mock.invocationCallOrder[0]);
    } finally { production.mockRestore(); }
  });

  test('registers a retry handler for the EventBus inventory approval dead letter task', async () => {
    const handler = mockRegisteredHandlers.get('EventBus:INVENTORY_POSTING_APPROVED');
    expect(handler).toEqual(expect.any(Function));
    await handler({ args: [{ postingDocumentId: mockPosting.id, sourceNo: 'DB20260908001' }] });
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
