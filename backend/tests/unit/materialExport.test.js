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
jest.mock('../../src/services/materialService', () => ({
  getAllMaterials: jest.fn(),
}));
jest.mock('../../src/utils/excelHelper', () => ({
  exportData: jest.fn(() => ({
    xlsx: {
      write: jest.fn().mockResolvedValue(true),
    },
  })),
}));

const materialService = require('../../src/services/materialService');
const ExcelHelper = require('../../src/utils/excelHelper');
const materialController = require('../../src/controllers/common/basedata/materialController');
const {
  buildMaterialExportRows,
  getMaterialExportFilters,
} = materialController;

describe('material export mapping', () => {
  test('maps the stored specs field into the 规格型号 export column', () => {
    const [row] = buildMaterialExportRows([
      {
        code: 'M001',
        name: '钢板',
        specs: '1000*2000*5mm',
        drawing_no: 'DWG-2026-001',
        material: 'Q235钢材',
        unit_name: '件',
        material_source_name: '采购',
        location_name: '原材料库',
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
      drawing_no: 'DWG-2026-001',
      material: 'Q235钢材',
      unit_name: '件',
      source_type: '采购',
      location_name: '原材料库',
      safety_stock: 10,
      stock_quantity: 12,
      remark: '测试物料',
    });
  });

  test('keeps compatibility with the historical specification alias', () => {
    expect(buildMaterialExportRows([{ specification: 'DN50' }])[0].specs).toBe('DN50');
  });

  test('maps drawing_no and falls back to camelCase / code aliases', () => {
    expect(buildMaterialExportRows([{ drawing_no: 'DWG-01' }])[0].drawing_no).toBe('DWG-01');
    expect(buildMaterialExportRows([{ drawingNo: 'DWG-02' }])[0].drawing_no).toBe('DWG-02');
    expect(buildMaterialExportRows([{ drawing_code: 'DWG-03' }])[0].drawing_no).toBe('DWG-03');
    expect(buildMaterialExportRows([{}])[0].drawing_no).toBe('');
  });

  test('maps location_name and falls back to camelCase / detail aliases', () => {
    expect(buildMaterialExportRows([{ location_name: '成品库' }])[0].location_name).toBe('成品库');
    expect(buildMaterialExportRows([{ locationName: '零部件库' }])[0].location_name).toBe('零部件库');
    expect(buildMaterialExportRows([{ location_detail: '0001' }])[0].location_name).toBe('0001');
    expect(buildMaterialExportRows([{ locationDetail: '0002' }])[0].location_name).toBe('0002');
    expect(buildMaterialExportRows([{}])[0].location_name).toBe('');
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

  test('exportMaterials includes 库位 and 物料号 columns in exported excel', async () => {
    materialService.getAllMaterials.mockResolvedValueOnce({
      data: [{ code: 'M001', name: '钢板', drawing_no: 'DWG-01', location_name: '原材料库' }],
    });

    const req = { body: {} };
    const res = {
      setHeader: jest.fn(),
      end: jest.fn(),
    };

    await materialController.exportMaterials(req, res);

    expect(ExcelHelper.exportData).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ code: 'M001', drawing_no: 'DWG-01', location_name: '原材料库' }),
      ]),
      expect.arrayContaining([
        { header: '物料号', key: 'drawing_no', width: 20 },
        { header: '库位', key: 'location_name', width: 15 },
      ]),
      '物料列表'
    );
    expect(res.end).toHaveBeenCalled();
  });
});
