const { purchaseOrderMap } = require('../../src/utils/purchase/purchaseFieldMap');

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
