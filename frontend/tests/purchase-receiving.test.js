import { describe, expect, test } from 'vitest';
import { normalizePurchaseReceivingItems } from '@/utils/purchaseReceiving';

describe('normalizePurchaseReceivingItems', () => {
  test('只保留物料和正数到货数量，不透传价格字段', () => {
    const result = normalizePurchaseReceivingItems([
      {
        materialId: 101,
        receiveQuantity: 3,
        price: '***',
        unitPrice: '***',
        totalAmount: '***',
        taxRate: '***',
      },
      { materialId: 102, receiveQuantity: 0, price: '***' },
    ]);

    expect(result).toEqual([{ materialId: 101, receiveQuantity: 3 }]);
  });

  test('兼容旧的 snake_case 字段并过滤无效明细', () => {
    const result = normalizePurchaseReceivingItems([
      { material_id: '201', receive_quantity: '2.5' },
      null,
      { materialId: 0, receiveQuantity: 4 },
      { materialId: 202, receiveQuantity: 'not-a-number' },
    ]);

    expect(result).toEqual([{ materialId: '201', receiveQuantity: '2.5' }]);
  });
});
