/**
 * unitPriceFields 单价字段统一约定单测
 */

const {
  UNIT_PRICE_DB_COLUMN,
  getUnitPriceColumn,
  getTaxRateColumn,
  resolveUnitPrice,
  resolveTaxRate,
  sqlUnitPriceExpr,
  sqlTaxRateExpr,
  sqlNonZeroUnitPrice,
  sqlSelectUnitPricePair,
  normalizeItemUnitPrice,
  normalizeItemsUnitPrice,
  toDbUnitPrice,
} = require('../../src/utils/unitPriceFields');

describe('unitPriceFields', () => {
  test('库列名约定：采购用 price，销售订单用 unit_price，出库用 price', () => {
    expect(getUnitPriceColumn('purchase_order_items')).toBe('price');
    expect(getUnitPriceColumn('purchase_receipt_items')).toBe('price');
    expect(getUnitPriceColumn('purchase_return_items')).toBe('price');
    expect(getUnitPriceColumn('sales_order_items')).toBe('unit_price');
    expect(getUnitPriceColumn('sales_quotation_items')).toBe('unit_price');
    expect(getUnitPriceColumn('sales_outbound_items')).toBe('price');
    expect(getUnitPriceColumn('ap_invoice_items')).toBe('unit_price');
    expect(getUnitPriceColumn('ar_invoice_items')).toBe('unit_price');
  });

  test('未登记表应抛错', () => {
    expect(() => getUnitPriceColumn('unknown_table')).toThrow(/未登记/);
  });

  test('resolveUnitPrice 兼容 price / unit_price / unitPrice', () => {
    expect(resolveUnitPrice({ price: 12.5 })).toBe(12.5);
    expect(resolveUnitPrice({ unit_price: 8 })).toBe(8);
    expect(resolveUnitPrice({ unitPrice: 9.1 })).toBe(9.1);
    // unit_price 优先于 price（常见：发票行）
    expect(resolveUnitPrice({ unit_price: 3, price: 99 })).toBe(3);
    expect(resolveUnitPrice(null)).toBe(0);
    expect(resolveUnitPrice({}, { fallback: -1 })).toBe(-1);
    expect(resolveUnitPrice('15.2')).toBe(15.2);
  });

  test('SQL 表达式只生成登记列', () => {
    expect(sqlUnitPriceExpr('poi', 'purchase_order_items')).toBe('poi.price');
    expect(sqlUnitPriceExpr('soi', 'sales_order_items')).toBe('soi.unit_price');
    expect(sqlUnitPriceExpr('sobi', 'sales_outbound_items')).toBe('sobi.price');
    expect(sqlNonZeroUnitPrice('poi', 'purchase_order_items')).toBe(
      'COALESCE(NULLIF(poi.price, 0), 0)'
    );
    expect(sqlSelectUnitPricePair('poi', 'purchase_order_items')).toBe(
      'poi.price AS price, poi.price AS unit_price'
    );
  });

  test('非法 alias 应拒绝', () => {
    expect(() => sqlUnitPriceExpr('poi;drop', 'purchase_order_items')).toThrow(/非法/);
  });

  test('normalize 双写 price 与 unit_price', () => {
    const one = normalizeItemUnitPrice({ material_id: 1, price: 10, quantity: 2 });
    expect(one.price).toBe(10);
    expect(one.unit_price).toBe(10);
    expect(one.unitPrice).toBe(10);

    const list = normalizeItemsUnitPrice([{ unit_price: 7 }, { price: 4 }]);
    expect(list[0].price).toBe(7);
    expect(list[0].unit_price).toBe(7);
    expect(list[1].price).toBe(4);
    expect(list[1].unit_price).toBe(4);
  });

  test('toDbUnitPrice 按表输出权威列', () => {
    expect(toDbUnitPrice('purchase_order_items', { unit_price: 5 })).toEqual({
      column: 'price',
      value: 5,
    });
    expect(toDbUnitPrice('sales_order_items', { price: 6 })).toEqual({
      column: 'unit_price',
      value: 6,
    });
  });

  test('登记表清单完整覆盖核心单据', () => {
    const required = [
      'purchase_order_items',
      'purchase_receipt_items',
      'sales_order_items',
      'sales_outbound_items',
      'ap_invoice_items',
      'ar_invoice_items',
    ];
    required.forEach((t) => {
      expect(UNIT_PRICE_DB_COLUMN[t]).toBeTruthy();
    });
  });

  test('税率列：销售明细 tax_percent，采购/表头 tax_rate', () => {
    expect(getTaxRateColumn('sales_order_items')).toBe('tax_percent');
    expect(getTaxRateColumn('sales_orders')).toBe('tax_rate');
    expect(getTaxRateColumn('purchase_order_items')).toBe('tax_rate');
    expect(getTaxRateColumn('purchase_receipts')).toBeNull();
    expect(sqlTaxRateExpr('soi', 'sales_order_items')).toBe('soi.tax_percent');
    expect(sqlTaxRateExpr('po', 'purchase_orders')).toBe('po.tax_rate');
    expect(resolveTaxRate({ tax_percent: 0.13 })).toBe(0.13);
    expect(resolveTaxRate({ tax_rate: 0.06 })).toBe(0.06);
    expect(resolveTaxRate({ tax_rate: 0.13, tax_percent: 0.06 })).toBe(0.13);
  });
});
