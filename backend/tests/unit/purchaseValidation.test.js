/* global describe, expect, jest, test */

const {
  normalizeRequisitionMaterials,
} = require('../../src/utils/purchase/purchaseValidation');

describe('采购申请物料校验提示', () => {
  test('物料 ID 对应停用记录时使用物料编码提示', async () => {
    const connection = {
      query: jest.fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ code: '3006004012_del_17238' }]]),
    };

    await expect(normalizeRequisitionMaterials(connection, [
      { material_id: 17238, quantity: 1 },
    ])).rejects.toThrow('申请单中的物料编码“3006004012_del_17238”已不存在或已停用，请编辑申请单后重新选择有效物料。');
  });
});
