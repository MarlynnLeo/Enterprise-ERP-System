const { purchaseOrderMap, purchaseReceiptMap } = require('../../src/utils/purchase/purchaseFieldMap');

describe('purchase order field map', () => {
  test('keeps linked requisition fields in API responses', () => {
    expect(purchaseOrderMap.toApi({
      id: 42,
      order_no: 'PO-42',
      requisition_id: 10,
      requisition_number: 'PR202608240001',
    })).toMatchObject({
      requisitionId: 10,
      requisitionNumber: 'PR202608240001',
    });
  });
});

describe('purchase receipt field map', () => {
  test('keeps incoming inspection status in API responses', () => {
    expect(purchaseReceiptMap.toApi({
      id: 7,
      status: 'draft',
      inspection_id: 12,
      inspection_status: 'passed',
    })).toMatchObject({
      inspectionId: 12,
      inspectionStatus: 'passed',
    });
  });
});
