const {
  desensitizeData,
  classifySensitiveField,
  resolvePriceViewCapabilities,
} = require('../../src/utils/desensitizer');

describe('desensitizer field-level price', () => {
  test('classify material price fields', () => {
    expect(classifySensitiveField('price')).toBe('sales');
    expect(classifySensitiveField('salePrice')).toBe('sales');
    expect(classifySensitiveField('costPrice')).toBe('purchase');
    expect(classifySensitiveField('purchase_price')).toBe('purchase');
    expect(classifySensitiveField('taxRate')).toBe('general');
    expect(classifySensitiveField('name')).toBe(null);
  });

  test('采购/销售权限组都能看物料销售价和采购价', () => {
    const purchaseCaps = resolvePriceViewCapabilities(['purchase:price:view', 'basedata:materials:view']);
    expect(purchaseCaps.purchase).toBe(true);
    expect(purchaseCaps.sales).toBe(true);

    const salesCaps = resolvePriceViewCapabilities(['sales:price:view', 'basedata:materials:view']);
    expect(salesCaps.sales).toBe(true);
    expect(salesCaps.purchase).toBe(true);
  });

  test('warehouse: no price caps', () => {
    const caps = resolvePriceViewCapabilities(['basedata:materials:view', 'inventory:outbound:view']);
    expect(caps.sales).toBe(false);
    expect(caps.purchase).toBe(false);
    expect(caps.general).toBe(false);
  });

  test('desensitize material for purchaser', () => {
    const row = { id: 1, code: 'M1', name: '物料', price: 30, costPrice: 17.5, taxRate: 0.13 };
    const caps = resolvePriceViewCapabilities(['purchase:price:view']);
    desensitizeData(row, caps);
    expect(row.costPrice).toBe(17.5);
    expect(row.price).toBe(30);
    expect(row.taxRate).toBe(0.13);
    expect(row.name).toBe('物料');
  });

  test('desensitize material for salesperson', () => {
    const row = { id: 1, code: 'M1', name: '物料', price: 30, costPrice: 17.5, taxRate: 0.13 };
    const caps = resolvePriceViewCapabilities(['sales:price:view']);
    desensitizeData(row, caps);
    expect(row.price).toBe(30);
    expect(row.costPrice).toBe(17.5);
    expect(row.taxRate).toBe(0.13);
  });

  test('desensitize material for warehouse', () => {
    const row = { id: 1, code: 'M1', name: '物料', price: 30, costPrice: 17.5, taxRate: 0.13 };
    desensitizeData(row, false);
    expect(row.price).toBe('***');
    expect(row.costPrice).toBe('***');
    expect(row.taxRate).toBe('***');
    expect(row.name).toBe('物料');
  });

  test('boolean true keeps all (backward compatible)', () => {
    const row = { price: 1, costPrice: 2 };
    desensitizeData(row, true);
    expect(row.price).toBe(1);
    expect(row.costPrice).toBe(2);
  });

  test('admin wildcard sees all', () => {
    const row = { price: 30, costPrice: 17.5 };
    const caps = resolvePriceViewCapabilities(['*']);
    desensitizeData(row, caps);
    expect(row.price).toBe(30);
    expect(row.costPrice).toBe(17.5);
  });
});
