/**
 * 物料导出字段映射回归测试。
 */

jest.mock('../../src/config/db', () => ({
  pool: {
    query: jest.fn(),
    execute: jest.fn(),
    getConnection: jest.fn(),
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../src/services/FileAccessService', () => ({}));
jest.mock('../../src/utils/desensitizer', () => ({
  desensitizeDataForUser: jest.fn(async (value) => value),
}));

const {
  buildMaterialExportRows,
  getMaterialExportFilters,
} = require('../../src/controllers/common/basedata/materialController');

describe('material export mapping', () => {
  test('maps the stored specs field into the 规格型号 export column', () => {
    const [row] = buildMaterialExportRows([
      {
        code: 'M001',
        name: '钢板',
        specs: '1000*2000*5mm',
        unit_name: '件',
        material_source_name: '采购',
        safety_stock: 10,
        min_stock: 5,
        max_stock: 100,
        stock_quantity: 12,
        status: 1,
        remark: '测试物料',
      },
    ]);

    expect(row).toMatchObject({
      specs: '1000*2000*5mm',
      unit_name: '件',
      source_type: '采购',
      safety_stock: 10,
      stock_quantity: 12,
      remark: '测试物料',
    });
  });

  test('keeps compatibility with the historical specification alias', () => {
    expect(buildMaterialExportRows([{ specification: 'DN50' }])[0].specs).toBe('DN50');
  });

  test('accepts direct frontend filters as well as the legacy nested shape', () => {
    expect(getMaterialExportFilters({ keyword: '钢板', materialType: 'raw', status: 1 })).toEqual({
      keyword: '钢板',
      material_type: 'raw',
      status: 1,
    });
    expect(getMaterialExportFilters({ filters: { materialType: 'finished' } })).toEqual({
      material_type: 'finished',
    });
  });
});
