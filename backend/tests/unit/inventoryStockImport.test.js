jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/utils/codeGenerator', () => ({
  CodeGenerators: { generateAdjustmentCode: jest.fn() },
}));
jest.mock('../../src/services/InventoryService', () => ({ updateStock: jest.fn() }));
jest.mock('../../src/services/BusinessTypeService', () => ({}));
jest.mock('../../src/utils/userHelper', () => ({
  getCurrentUserName: jest.fn().mockResolvedValue('importer'),
}));

const ExcelJS = require('exceljs');
const db = require('../../src/config/db');
const { CodeGenerators } = require('../../src/utils/codeGenerator');
const InventoryService = require('../../src/services/InventoryService');
const {
  importStock,
  downloadStockTemplate,
} = require('../../src/controllers/business/inventory/inventoryStockController');

function response() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
    send: jest.fn(),
  };
}

async function upload(rows, batchHeader = '批次号') {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('库存数据');
  sheet.addRow(['物料编码', '库位编码', '库存数量', batchHeader]);
  rows.forEach((row) => sheet.addRow(row));
  const res = response();
  await importStock({ file: { buffer: await workbook.xlsx.writeBuffer() }, user: { id: 1 } }, res);
  return res;
}

describe('inventory stock import batches', () => {
  let currentStock;
  let connection;

  beforeEach(() => {
    jest.clearAllMocks();
    currentStock = [];
    connection = {
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
      query: jest.fn(async (sql) => {
        if (/FROM materials\b/.test(sql))
          return [
            [
              { id: 1, code: 'M1', name: '原料1', status: 1, unit_id: 1 },
              { id: 2, code: 'M2', name: '原料2', status: 1, unit_id: 1 },
            ],
          ];
        if (/FROM locations\b/.test(sql))
          return [[{ id: 7, code: 'L1', name: '原料仓', status: 1 }]];
        if (/FROM inventory_stock_balances\b/.test(sql)) return [currentStock];
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    };
    db.pool.getConnection.mockResolvedValue(connection);
    CodeGenerators.generateAdjustmentCode.mockResolvedValue('ADJ-IMPORT');
    InventoryService.updateStock.mockResolvedValue({ success: true });
  });

  it('assigns one import timestamp to rows without batches and returns the generated numbers', async () => {
    const res = await upload([
      ['M1', 'L1', 100],
      ['M2', 'L1', 50],
    ]);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(InventoryService.updateStock).toHaveBeenCalledTimes(2);
    const [first, second] = InventoryService.updateStock.mock.calls.map(([input]) => input);
    expect(first.batchNumber).toMatch(/^IMP-\d{17}-1-7$/);
    expect(second.batchNumber).toMatch(/^IMP-\d{17}-2-7$/);
    expect(first.batchNumber.split('-')[1]).toBe(second.batchNumber.split('-')[1]);
    expect(res.json.mock.calls[0][0].data.successData.map((row) => row.batchNumber)).toEqual([
      first.batchNumber,
      second.batchNumber,
    ]);
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it.each(['批次号', 'batch_number', 'batchNumber'])(
    'preserves an original batch from the %s column',
    async (header) => {
      await upload([['M1', 'L1', 100, '  OLD-ERP-BATCH  ']], header);
      expect(InventoryService.updateStock).toHaveBeenCalledWith(
        expect.objectContaining({
          quantity: 100,
          batchNumber: 'OLD-ERP-BATCH',
          transactionType: 'initial_import',
        }),
        connection
      );
    }
  );

  it('generates a batch when the spreadsheet contains only whitespace', async () => {
    await upload([['M1', 'L1', 100, '   ']]);
    expect(InventoryService.updateStock.mock.calls[0][0].batchNumber).toMatch(/^IMP-\d{17}-1-7$/);
  });

  it('leaves decreases without an explicit batch on FIFO instead of inventing a new batch', async () => {
    currentStock = [{ material_id: 1, location_id: 7, quantity: 100 }];
    await upload([['M1', 'L1', 50]]);
    expect(InventoryService.updateStock).toHaveBeenCalledWith(
      expect.objectContaining({
        quantity: -50,
        batchNumber: '',
      }),
      connection
    );
  });

  it('does not alter existing stock batches when the imported balance is unchanged', async () => {
    currentStock = [{ material_id: 1, location_id: 7, quantity: 100 }];
    await upload([['M1', 'L1', 100]]);
    expect(InventoryService.updateStock).not.toHaveBeenCalled();
  });

  it('documents the optional batch column in the downloadable template', async () => {
    const res = response();
    await downloadStockTemplate({}, res);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.send.mock.calls[0][0]);
    expect(workbook.getWorksheet('库存数据').getRow(1).values).toContain('批次号');
    expect(JSON.stringify(workbook.getWorksheet('导入说明').getSheetValues())).toContain(
      '按导入时间自动生成'
    );
  });
});
