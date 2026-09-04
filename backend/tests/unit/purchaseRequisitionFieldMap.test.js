const {
  purchaseRequisitionMap,
  purchaseRequisitionItemMap,
} = require('../../src/utils/purchase/purchaseFieldMap');

describe('purchase requisition API contract', () => {
  test('maps a database requisition and its materials to camelCase', () => {
    const result = purchaseRequisitionMap.toApi({
      id: 42,
      requisition_number: 'PR-0042',
      request_date: '2026-09-04T00:00:00.000Z',
      requester: 'alice',
      user_real_name: 'Alice',
      status: 'approved',
      created_at: '2026-09-04T01:02:03.000Z',
      updated_at: '2026-09-04T02:03:04.000Z',
      materials: [
        {
          id: 7,
          material_id: 9,
          material_code: 'MAT-9',
          material_name: '铝板',
          specification: '1mm',
          unit: '张',
          unit_id: 3,
          quantity: '12.50',
          ordered_quantity: '2.5',
        },
      ],
    });

    expect(result).toMatchObject({
      id: 42,
      requisitionNo: 'PR-0042',
      requisitionNumber: 'PR-0042',
      requester: 'alice',
      realName: 'Alice',
      status: 'approved',
      materialsCount: 1,
    });
    expect(result.materials).toEqual([
      expect.objectContaining({
        materialId: 9,
        materialCode: 'MAT-9',
        materialName: '铝板',
        specification: '1mm',
        unit: '张',
        unitId: 3,
        quantity: 12.5,
        orderedQuantity: 2.5,
      }),
    ]);
    expect(result.items).toBe(result.materials);
  });

  test('accepts items as the canonical detail alias', () => {
    const result = purchaseRequisitionMap.toApi({
      requisition_no: 'PR-1',
      items: [{ material_code: 'M-1', quantity: 1 }],
    });

    expect(result.requisitionNumber).toBe('PR-1');
    expect(result.items).toHaveLength(1);
    expect(result.materials).toEqual(result.items);
  });

  test('maps a requisition item without leaking snake_case keys', () => {
    const result = purchaseRequisitionItemMap.toApi({
      material_id: 1,
      material_code: 'M-1',
      estimated_price: '3.20',
      ordered_quantity: '0',
    });

    expect(result).toEqual(expect.objectContaining({
      materialId: 1,
      materialCode: 'M-1',
      estimatedPrice: 3.2,
      orderedQuantity: 0,
    }));
    expect(result).not.toHaveProperty('material_code');
    expect(result).not.toHaveProperty('estimated_price');
  });
});
