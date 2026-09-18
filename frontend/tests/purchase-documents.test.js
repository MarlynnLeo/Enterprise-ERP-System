import { describe, expect, test, vi } from 'vitest';
import { normalizePurchaseReceiptPayload } from '@/utils/purchaseReceipts';
import { buildPurchaseReturnItems, purchaseReturnLineAmount, purchaseReturnTotal } from '@/utils/purchaseReturns';
import { purchaseApi } from '@/api/purchase';

const mocks = vi.hoisted(() => ({ post: vi.fn(), put: vi.fn() }));
vi.mock('@/services/axiosInstance', () => ({ api: mocks, fastApi: {} }));
vi.mock('@/api/baseData', () => ({ baseDataApi: {} }));

const receipt = {
  orderId: 4, warehouseId: '2', receiptDate: '2026-09-15', receiver: '测试员',
  items: [{ id: 7, orderItemId: 41, materialId: 8, receivedQuantity: 3, qualifiedQuantity: 2,
    unitPrice: 10, taxRate: 0, batchNumber: 'BATCH-1' }],
};

describe('purchase receipt requests', () => {
  test('editing preserves receipt/source IDs, batch, zero tax and quantities', async () => {
    await purchaseApi.updateReceipt(1, receipt);
    expect(mocks.put).toHaveBeenLastCalledWith('/purchase/receipts/1', expect.objectContaining({
      warehouseId: 2,
      items: [expect.objectContaining({ id: 7, orderItemId: 41, materialId: 8, price: 10,
        receivedQuantity: 3, qualifiedQuantity: 2, taxRate: 0, batchNumber: 'BATCH-1' })],
    }));
  });
  test('missing or masked prices are omitted instead of becoming zero', () => {
    const data = { ...receipt, items: [{ materialId: 8, receivedQuantity: 3, qualifiedQuantity: 0, unitPrice: null, taxRate: null }] };
    const original = structuredClone(data);
    const result = normalizePurchaseReceiptPayload(data);
    expect(result.items[0]).not.toHaveProperty('price');
    expect(result.items[0]).not.toHaveProperty('taxRate');
    expect(result.items[0].qualifiedQuantity).toBe(0);
    expect(data).toEqual(original);
  });
  test('creating sends an idempotency key and supports reusing it after a retry', async () => {
    await purchaseApi.createReceipt(receipt);
    expect(mocks.post.mock.lastCall[2].headers['Idempotency-Key']).toMatch(/^purchase-receipt:/);
    await purchaseApi.createReceipt({ ...receipt, idempotencyKey: 'stable-key' });
    expect(mocks.post.mock.lastCall[2].headers['Idempotency-Key']).toBe('stable-key');
  });
  test('rejects invalid warehouse and empty lines before making a request', () => {
    expect(() => normalizePurchaseReceiptPayload({ ...receipt, warehouseId: '2abc' })).toThrow('有效仓库');
    expect(() => normalizePurchaseReceiptPayload({ ...receipt, items: [] })).toThrow('物料明细');
  });
});

describe('purchase returns', () => {
  test('matches repeated materials by receipt line and restores the current draft allowance', () => {
    const result = buildPurchaseReturnItems([
      { id: 1, materialId: 8, qualifiedQuantity: 4, receivedQuantity: 6, returnedQuantity: 3, unitPrice: 10, taxRate: 0.13 },
      { id: 2, materialId: 8, qualifiedQuantity: 0, receivedQuantity: 6, returnedQuantity: 0, unitPrice: 20, taxRate: 0 },
    ], [{ receiptItemId: 1, returnQuantity: 2, returnReason: '质量问题' }]);
    expect(result[0]).toMatchObject({ receiptItemId: 1, receivedQuantity: 4, returnableQuantity: 3, returnQuantity: 2, price: 10, returnReason: '质量问题' });
    expect(result[1]).toMatchObject({ receiptItemId: 2, receivedQuantity: 0, returnableQuantity: 0, returnQuantity: 0, price: 20 });
  });
  test('form and print amounts include original tax, rounded by line', () => {
    expect(purchaseReturnLineAmount({ returnQuantity: 3, price: 10, taxRate: 0.13 })).toBe(33.9);
    expect(purchaseReturnTotal([{ returnQuantity: 3, price: 10, taxRate: 0.13 }, { returnQuantity: 2, price: 10, taxRate: 0 }])).toBe(53.9);
  });
  test('masked prices and tax remain unknown in amounts', () => {
    const [item] = buildPurchaseReturnItems([{ id: 1, qualifiedQuantity: 2, unitPrice: null, taxRate: null }]);
    expect(item.price).toBeNull();
    expect(purchaseReturnTotal([{ ...item, returnQuantity: 1 }])).toBeNull();
  });
});
