const { describe, expect, test } = require('@jest/globals');
const { inventoryTransferMap } = require('../../src/utils/inventory/inventoryFieldMap');

describe('inventoryTransferMap.toApi', () => {
  test('normalizes transfer details and nested items to camelCase', () => {
    const result = inventoryTransferMap.toApi({
      id: 3,
      transfer_no: 'TF202609100001',
      transfer_date: '2026-09-10',
      from_location_id: 1,
      to_location_id: 2,
      from_location: '零部件库',
      to_location: '原材料库',
      status: 'completed',
      remark: 'test',
      creator: '陈成',
      items: [
        {
          id: 4,
          transfer_id: 3,
          material_id: 5,
          material_code: 'M-005',
          material_name: '测试物料',
          specification: '规格',
          quantity: '1',
          unit_id: 6,
          unit_name: '个',
        },
      ],
    });

    expect(result).toMatchObject({
      id: 3,
      transferNo: 'TF202609100001',
      transferDate: '2026-09-10',
      fromLocationId: 1,
      toLocationId: 2,
      fromLocationName: '零部件库',
      toLocationName: '原材料库',
      remarks: 'test',
      creator: '陈成',
    });
    expect(result.items[0]).toMatchObject({
      transferId: 3,
      materialId: 5,
      materialCode: 'M-005',
      materialName: '测试物料',
      specification: '规格',
      quantity: 1,
      unitName: '个',
    });
  });
});
