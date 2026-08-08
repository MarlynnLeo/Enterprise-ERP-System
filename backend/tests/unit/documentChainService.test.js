/**
 * DocumentChainService — 业务链路写入契约（无库）
 */

jest.mock('../../src/services/business/DocumentLinkService', () => ({
  tryAutoLink: jest.fn().mockResolvedValue(undefined),
}));

const DocumentLinkService = require('../../src/services/business/DocumentLinkService');
const DocumentChainService = require('../../src/services/business/DocumentChainService');
const { DOCUMENT_LINK_TYPES: T } = require('../../src/constants/documentLinkTypes');

describe('DocumentChainService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('afterPurchaseReceiptCreated writes PO→receipt and inspection→receipt with SSOT types', async () => {
    await DocumentChainService.afterPurchaseReceiptCreated(
      {
        orderId: 10,
        orderNo: 'PO-1',
        receiptId: 20,
        receiptNo: 'RCV-1',
        inspectionId: 30,
        inspectionNo: 'QI-1',
      },
      99,
      {}
    );

    expect(DocumentLinkService.tryAutoLink).toHaveBeenCalledWith(
      T.PURCHASE_ORDER,
      10,
      'PO-1',
      T.PURCHASE_RECEIPT,
      20,
      'RCV-1',
      99,
      {}
    );
    expect(DocumentLinkService.tryAutoLink).toHaveBeenCalledWith(
      T.QUALITY_INSPECTION,
      30,
      'QI-1',
      T.PURCHASE_RECEIPT,
      20,
      'RCV-1',
      99,
      {}
    );
  });

  test('afterInventoryOutboundCompleted links production task and distinct reference', async () => {
    await DocumentChainService.afterInventoryOutboundCompleted(
      {
        id: 5,
        outbound_no: 'OUT-5',
        production_task_id: 7,
        reference_type: 'production_plan',
        reference_id: 3,
        reference_no: 'PL-3',
      },
      1,
      {}
    );

    expect(DocumentLinkService.tryAutoLink).toHaveBeenCalledWith(
      T.PRODUCTION_TASK,
      7,
      null,
      T.INVENTORY_OUTBOUND,
      5,
      'OUT-5',
      1,
      {}
    );
    expect(DocumentLinkService.tryAutoLink).toHaveBeenCalledWith(
      T.PRODUCTION_PLAN,
      3,
      'PL-3',
      T.INVENTORY_OUTBOUND,
      5,
      'OUT-5',
      1,
      {}
    );
  });

  test('afterInventoryInboundConfirmed links inspection and production task reference', async () => {
    await DocumentChainService.afterInventoryInboundConfirmed(
      {
        id: 11,
        inbound_no: 'IN-11',
        inspection_id: 22,
        inspection_no: 'QI-22',
        reference_type: 'production_task',
        reference_id: 33,
        reference_no: 'T-33',
      },
      2,
      {}
    );

    expect(DocumentLinkService.tryAutoLink).toHaveBeenCalledWith(
      T.QUALITY_INSPECTION,
      22,
      'QI-22',
      T.INVENTORY_INBOUND,
      11,
      'IN-11',
      2,
      {}
    );
    expect(DocumentLinkService.tryAutoLink).toHaveBeenCalledWith(
      T.PRODUCTION_TASK,
      33,
      'T-33',
      T.INVENTORY_INBOUND,
      11,
      'IN-11',
      2,
      {}
    );
  });

  test('rejects unknown inventory reference types (no dirty links)', async () => {
    await DocumentChainService.afterInventoryOutboundCompleted(
      {
        id: 1,
        outbound_no: 'OUT-1',
        reference_type: 'unknown_junk',
        reference_id: 99,
      },
      1,
      {}
    );
    expect(DocumentLinkService.tryAutoLink).not.toHaveBeenCalled();
  });
});

describe('documentLinkTypes SSOT', () => {
  const {
    DOCUMENT_LINK_TYPES,
    DOCUMENT_LINK_TYPE_LABELS,
    DOCUMENT_LINK_TYPE_PERMISSIONS,
    isKnownDocumentLinkType,
  } = require('../../src/constants/documentLinkTypes');

  test('every type has label and permission mapping', () => {
    for (const type of Object.values(DOCUMENT_LINK_TYPES)) {
      expect(DOCUMENT_LINK_TYPE_LABELS[type]).toBeTruthy();
      expect(DOCUMENT_LINK_TYPE_PERMISSIONS[type]?.length).toBeGreaterThan(0);
      expect(isKnownDocumentLinkType(type)).toBe(true);
    }
    expect(isKnownDocumentLinkType('not_a_real_type')).toBe(false);
  });
});
