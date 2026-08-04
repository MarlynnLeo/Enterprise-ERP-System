/**
 * ManualVoucherService 单元测试
 */

const ManualVoucherService = require('../../src/services/finance/ManualVoucherService');

describe('ManualVoucherService', () => {
  test('专业主路径：入库 + 出库', () => {
    expect(ManualVoucherService.PRIMARY_BUSINESS_TYPES).toEqual([
      'purchase_receipt',
      'sales_outbound',
    ]);
    expect(ManualVoucherService.BUSINESS_TYPES.PURCHASE_RECEIPT).toBe('purchase_receipt');
    expect(ManualVoucherService.BUSINESS_TYPES.SALES_OUTBOUND).toBe('sales_outbound');
  });

  test('例外类型仍登记（订单级）', () => {
    expect(ManualVoucherService.SUPPORTED_BUSINESS_TYPES).toEqual(
      expect.arrayContaining([
        'purchase_receipt',
        'sales_outbound',
        'sales_order',
        'purchase_order',
      ])
    );
  });

  test('作废状态与批量上限', () => {
    expect(ManualVoucherService.INACTIVE_INVOICE_STATUSES).toEqual(
      expect.arrayContaining(['cancelled', '已取消', 'void', '作废'])
    );
    expect(ManualVoucherService.BATCH_MAX_IDS).toBe(50);
  });

  test('resolveGenerator 覆盖主路径与例外', () => {
    expect(ManualVoucherService.resolveGenerator('purchase_receipt')).toEqual(
      expect.any(Function)
    );
    expect(ManualVoucherService.resolveGenerator('sales_outbound')).toEqual(
      expect.any(Function)
    );
    expect(ManualVoucherService.resolveGenerator('sales_order')).toEqual(expect.any(Function));
    expect(ManualVoucherService.resolveGenerator('purchase_order')).toEqual(expect.any(Function));
    expect(ManualVoucherService.resolveGenerator('other')).toBeNull();
  });

  test('batchGenerate 非法业务类型', async () => {
    await expect(
      ManualVoucherService.batchGenerate('unknown', [1], null)
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', statusCode: 400 });
  });

  test('batchGenerate 空 ids', async () => {
    await expect(
      ManualVoucherService.batchGenerate('purchase_receipt', [], null)
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', statusCode: 400 });
  });

  test('batchGenerate 超过上限', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => i + 1);
    await expect(
      ManualVoucherService.batchGenerate('sales_outbound', ids, null)
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', statusCode: 400 });
  });

  test('batchPreview 非法业务类型', async () => {
    await expect(
      ManualVoucherService.batchPreview('sales_order', [1])
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', statusCode: 400 });
  });

  test('batchPreview 空 ids', async () => {
    await expect(
      ManualVoucherService.batchPreview('purchase_receipt', [])
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', statusCode: 400 });
  });

  test('batchPreview 超过上限', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => i + 1);
    await expect(
      ManualVoucherService.batchPreview('sales_outbound', ids)
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', statusCode: 400 });
  });
});
