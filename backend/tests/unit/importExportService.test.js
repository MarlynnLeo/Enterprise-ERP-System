/* global beforeEach, describe, expect, jest, test */
jest.mock('../../src/utils/excelHelper', () => ({
  exportData: jest.fn((data, columns, sheetName) => ({ data, columns, sheetName })),
}));

jest.mock('../../src/services/categoryService', () => ({}));
jest.mock('../../src/services/bomService', () => ({
  ...jest.requireActual('../../src/services/bomService'),
  getAllBoms: jest.fn(),
}));
jest.mock('../../src/services/supplierService', () => ({}));
jest.mock('../../src/services/customerService', () => ({}));
jest.mock('../../src/services/unitService', () => ({}));
jest.mock('../../src/services/locationService', () => ({}));
jest.mock('../../src/services/processTemplateService', () => ({ getAll: jest.fn() }));
jest.mock('../../src/config/db', () => ({
  pool: {
    query: jest.fn(),
  },
}));

const ExcelHelper = require('../../src/utils/excelHelper');
const bomService = require('../../src/services/bomService');
const ImportExportService = require('../../src/services/importExportService');
const processTemplateService = require('../../src/services/processTemplateService');
const { pool } = require('../../src/config/db');

describe('ImportExportService product process export', () => {
  test('exports versions, six-decimal per-unit hours and snapshot execution metadata', async () => {
    processTemplateService.getAll.mockResolvedValue({ list: [{
      code: 'PR1', name: '产品工艺', product_code: 'P1', version: 'V2', status: 1,
      details: [{ name: '装配', order_num: 1, standard_hours: '0.000123', station_name: '一号工位', sop_content: '按顺序装配',
        instruction_docs: [{ name: '指导书', url: '/uploads/sop.pdf' }],
        materials: JSON.stringify([{ material_code: 'M1', material_name: '螺丝', quantity: 2, is_scan_required: true }]) }],
    }, { name: '空草稿', version: 'V3', status: 0, details: [] }] });
    const result = await ImportExportService.exportProcessTemplates({ productId: 8 });
    expect(processTemplateService.getAll).toHaveBeenCalledWith(1, null, { productId: 8 });
    expect(result.sheetName).toBe('产品工艺路线');
    expect(result.data[0]).toMatchObject({ version: 'V2', standard_hours: 0.000123, station_name: '一号工位', sop_content: '按顺序装配',
      materials: 'M1 螺丝 × 2（需扫码）', instruction_docs: '指导书: /uploads/sop.pdf' });
    expect(result.data[1]).toMatchObject({ version: 'V3', status_text: '草稿', process_name: '(无工序)' });
    expect(result.columns.some(column => column.header === '标准工时(h/件)')).toBe(true);
  });
});

describe('ImportExportService BOM export', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockReset();
  });

  test('exports product and component specifications and omits the redundant BOM code', async () => {
    bomService.getAllBoms.mockResolvedValue({
      data: [
        {
          id: 10,
          code: 'BOM001',
          product_code: 'P001',
          product_name: '成品',
          product_specs: '型号-A / 规格-100',
          version: 'V1.0',
          details: [
            {
              id: 101,
              material_code: 'M001',
              material_name: '物料',
              material_specs: '零部件型号-B / 规格-20',
              quantity: 2,
              unit_name: '件',
            },
          ],
        },
      ],
    });

    await ImportExportService.exportBoms();

    const [rows, columns] = ExcelHelper.exportData.mock.calls[0];
    expect(columns).toEqual(
      expect.arrayContaining([
        { header: '产品规格型号', key: 'product_specs', width: 20 },
        { header: '规格型号', key: 'material_specs', width: 20 },
      ])
    );
    expect(columns).not.toEqual(expect.arrayContaining([{ header: 'BOM编码', key: 'code', width: 20 }]));
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          product_code: 'P001',
          product_specs: '型号-A / 规格-100',
          material_code: 'M001',
          material_specs: '零部件型号-B / 规格-20',
        }),
      ])
    );
  });

  test('exports only the BOMs requested by selected IDs', async () => {
    bomService.getAllBoms.mockResolvedValue({
      data: [
        {
          id: 10,
          product_code: 'P001',
          product_name: '产品一',
          details: [{ id: 101, material_code: 'M001', material_name: '物料一', quantity: 1 }],
        },
        {
          id: 20,
          product_code: 'P002',
          product_name: '产品二',
          details: [{ id: 201, material_code: 'M002', material_name: '物料二', quantity: 1 }],
        },
      ],
    });

    await ImportExportService.exportBoms({ ids: '20' });

    const [rows] = ExcelHelper.exportData.mock.calls[0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({ product_code: 'P002' }));
  });

  test('exports the selected BOM with inline children and referenced descendants in a real workbook', async () => {
    bomService.getAllBoms.mockResolvedValue({
      data: [
        {
          id: 10,
          product_code: 'P001',
          product_name: '成品',
          product_specs: '成品规格',
          version: 'V2.0',
          details: [
            { id: 102, material_code: 'M10', quantity: 5, parent_id: 0 },
            {
              id: 101, material_code: 'M2', material_name: '组件', material_specs: '组件规格',
              quantity: 2, parent_id: 0, has_sub_bom: 1, ref_bom_id: 20,
            },
            { id: 103, material_code: 'M1', quantity: 3, parent_id: 101, level: 2 },
          ],
        },
        {
          id: 40,
          product_code: 'P004',
          details: [{ id: 401, material_code: 'UNSELECTED', quantity: 1 }],
        },
      ],
    });
    const referencedDetails = {
      20: [
        { id: 202, bom_id: 20, material_code: 'M10', quantity: 6, parent_id: 0, level: 1 },
        {
          id: 201, bom_id: 20, material_code: 'M2', quantity: 4, parent_id: 0,
          level: 1, has_sub_bom: 1, ref_bom_id: 30,
        },
      ],
      30: [
        {
          id: 301, bom_id: 30, material_code: 'M1', material_name: '底层物料',
          specification: '底层规格', quantity: '0.25', base_quantity: '10',
          is_critical: 1, unit_name: '个', position: 'R1', remark: '底层备注',
          parent_id: 0, level: 1,
        },
      ],
    };
    pool.query.mockImplementation(async (sql, [bomId]) => {
      expect(sql).toContain('FROM bom_details bd');
      if (!referencedDetails[bomId]) throw new Error(`Unexpected BOM: ${bomId}`);
      return [referencedDetails[bomId]];
    });
    ExcelHelper.exportData.mockImplementationOnce(
      jest.requireActual('../../src/utils/excelHelper').exportData
    );

    const filters = { ids: '10', keyword: 'P001', version: 'V2.0' };
    const workbook = await ImportExportService.exportBoms(filters);

    expect(bomService.getAllBoms).toHaveBeenCalledWith(1, null, filters);
    const [rows, columns] = ExcelHelper.exportData.mock.calls[0];
    expect(columns).toContainEqual({ header: '结构', key: 'wbs', width: 18 });
    expect(rows.map(({ material_code, wbs }) => [material_code, wbs])).toEqual([
      ['M2', '1'],
      ['M1', '1.1'],
      ['M2', '1.2'],
      ['M1', '1.2.1'],
      ['M10', '1.3'],
      ['M10', '2'],
    ]);
    expect(rows.every(row => row.product_code === 'P001' && row.version === 'V2.0')).toBe(true);
    expect(rows[3]).toMatchObject({
      product_specs: '成品规格', material_name: '底层物料', material_specs: '底层规格',
      quantity: 0.25, base_quantity: 10, is_critical: '是', unit: '个',
      position: 'R1', remarks: '底层备注',
    });
    expect(pool.query).toHaveBeenCalledTimes(2);

    const ExcelJS = require('exceljs');
    const savedWorkbook = await new ExcelJS.Workbook().xlsx.load(await workbook.xlsx.writeBuffer());
    const worksheet = savedWorkbook.getWorksheet('BOM列表');
    const headers = worksheet.getRow(1).values;
    expect(worksheet.rowCount).toBe(7);
    expect(worksheet.getRow(5).getCell(headers.indexOf('结构')).value).toBe('1.2.1');
    expect(worksheet.getRow(5).getCell(headers.indexOf('规格型号')).value).toBe('底层规格');
    expect(worksheet.getRow(5).getCell(headers.indexOf('用量')).value).toBe(0.25);
  });

  test('keeps a shared sub-BOM under every referencing branch without duplicate database reads', async () => {
    bomService.getAllBoms.mockResolvedValue({
      data: [{
        id: 10,
        product_code: 'P001',
        details: [
          { id: 101, material_code: 'A', quantity: 2, has_sub_bom: 1, ref_bom_id: 20 },
          { id: 102, material_code: 'B', quantity: 3, has_sub_bom: 1, ref_bom_id: 20 },
        ],
      }],
    });
    pool.query.mockResolvedValueOnce([[
      { id: 201, bom_id: 20, material_code: 'CHILD', specification: '子件规格', quantity: 4 },
    ]]);

    const result = await ImportExportService.exportBoms({ ids: '10' });

    expect(result.data.map(({ material_code, wbs, quantity }) => [material_code, wbs, quantity])).toEqual([
      ['A', '1', 2],
      ['CHILD', '1.1', 4],
      ['B', '2', 3],
      ['CHILD', '2.1', 4],
    ]);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('stops cyclic sub-BOM references while exporting the reachable details', async () => {
    bomService.getAllBoms.mockResolvedValue({
      data: [{
        id: 10,
        details: [{ id: 101, material_code: 'A', quantity: 1, has_sub_bom: 1, ref_bom_id: 20 }],
      }],
    });
    pool.query.mockResolvedValueOnce([[
      { id: 201, material_code: 'B', quantity: 1, has_sub_bom: 1, ref_bom_id: 10 },
    ]]);

    const result = await ImportExportService.exportBoms();

    expect(result.data.map(({ material_code, wbs }) => [material_code, wbs])).toEqual([
      ['A', '1'],
      ['B', '1.1'],
    ]);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});
