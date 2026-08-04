const SupplierMetalRangePriceService = require('../../src/services/business/SupplierMetalRangePriceService');

describe('supplier metal range pricing', () => {
  test('matches inclusive metal price bands and clamps outside range', () => {
    const bands = [
      { band_index: 0, metal_price_min: 22000, metal_price_max: 23000, label: '22000-23000' },
      { band_index: 1, metal_price_min: 23001, metal_price_max: 24000, label: '23001-24000' },
      { band_index: 2, metal_price_min: 24001, metal_price_max: 25000, label: '24001-25000' },
    ];

    expect(SupplierMetalRangePriceService.findMatchingBand(bands, 22500).label).toBe('22000-23000');
    expect(SupplierMetalRangePriceService.findMatchingBand(bands, 23001).label).toBe('23001-24000');
    expect(SupplierMetalRangePriceService.findMatchingBand(bands, 21000).label).toBe('22000-23000');
    expect(SupplierMetalRangePriceService.findMatchingBand(bands, 26000).label).toBe('24001-25000');
  });

  test('builds autofill result from scheme item and metal snapshot', () => {
    const result = SupplierMetalRangePriceService.buildPriceResult({
      request: { materialId: 11, materialCode: '3003004012', supplierId: 8 },
      scheme: { id: 3, supplier_id: 8, name: '铝价区间', metal_symbol: 'ALUMINUM' },
      item: { id: 99, material_id: 11, material_code: '3003004012', processing_fee: 1.2, price_step: 0.3 },
      band: { id: 5, metal_price_min: 23001, metal_price_max: 24000, label: '23001-24000' },
      metal: { price: 23200, source: 'metal_prices', last_update_at: '2026-07-28' },
      unitPrice: 19.2,
    });

    expect(result).toMatchObject({
      source: 'supplier_metal_range',
      auto_fill: true,
      price: 19.2,
      metal_price: 23200,
      metal_price_band_label: '23001-24000',
      metal_price_scheme_id: 3,
      metal_price_item_id: 99,
    });
  });
});
