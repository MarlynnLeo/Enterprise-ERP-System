jest.mock('../../src/config/db', () => ({
  pool: {
    query: jest.fn(),
    execute: jest.fn(),
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../src/utils/softDelete', () => ({
  softDelete: jest.fn(),
}));

jest.mock('../../src/services/business/DLQService', () => ({}));

const bomService = require('../../src/services/bomService');
const { pool } = require('../../src/config/db');

describe('bomService list filters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('accepts the controller-normalized product_id filter', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);

    await bomService.getAllBoms(1, 10, { product_id: 42 });

    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(pool.query.mock.calls[0][0]).toContain('bm.product_id = ?');
    expect(pool.query.mock.calls[0][1]).toEqual([42]);
    expect(pool.query.mock.calls[1][0]).toContain('bm.product_id = ?');
    expect(pool.query.mock.calls[1][1]).toEqual([42]);
  });

  test('honors include_history after query keys are normalized to snake case', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);

    await bomService.getAllBoms(1, 10, { include_history: 'true' });

    expect(pool.query.mock.calls[0][0]).not.toContain('bm.status != 2');
  });

  test('matches product keywords across code, name, specs, drawing number, and version', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);

    await bomService.getAllBoms(1, 10, { keyword: 'M5' });

    const expectedParams = ['%M5%', '%M5%', '%M5%', '%M5%', '%M5%'];
    expect(pool.query.mock.calls[0][0]).toContain('m.code LIKE ?');
    expect(pool.query.mock.calls[0][0]).toContain('m.name LIKE ?');
    expect(pool.query.mock.calls[0][0]).toContain('m.specs LIKE ?');
    expect(pool.query.mock.calls[0][0]).toContain('m.drawing_no LIKE ?');
    expect(pool.query.mock.calls[0][0]).toContain('bm.version LIKE ?');
    expect(pool.query.mock.calls[0][1]).toEqual(expectedParams);
    expect(pool.query.mock.calls[1][1]).toEqual(expectedParams);
  });

  test('returns lightweight BOM options without loading BOM details', async () => {
    pool.query.mockResolvedValueOnce([[
      {
        id: 8,
        version: 'A',
        status: 1,
        product_code: '100199007',
        product_name: '开关电源安装支架',
        product_specs: 'EQ-DB1-150(HQ)',
      },
    ]]);

    await expect(bomService.getBomOptions({ keyword: '100199007' })).resolves.toEqual([
      {
        id: 8,
        version: 'A',
        status: 1,
        productCode: '100199007',
        productName: '开关电源安装支架',
        productSpecs: 'EQ-DB1-150(HQ)',
      },
    ]);

    expect(pool.query.mock.calls[0][0]).not.toContain('bom_details');
    expect(pool.query.mock.calls[0][1]).toEqual([
      '%100199007%',
      '%100199007%',
      '%100199007%',
      '%100199007%',
    ]);
  });
});

describe('bomService referenced BOM display tree', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('expands ref_bom_id children beneath the referenced material', async () => {
    pool.query.mockResolvedValueOnce([[
      {
        id: 201,
        bom_id: 20,
        material_id: 2001,
        material_code: '3005999023',
        material_name: '单联底板',
        specification: 'HRF-HD6',
        quantity: 1,
        unit_id: 1,
        unit_name: '个',
        level: 1,
        parent_id: 0,
        has_sub_bom: 0,
        ref_bom_id: null,
      },
    ]]);

    const tree = await bomService.buildReferencedBomTree([
      {
        id: 101,
        bom_id: 10,
        material_id: 1001,
        material_code: '30059990231502',
        material_name: '单联底板',
        quantity: 1,
        unit_id: 1,
        unit_name: '个',
        level: 1,
        parent_id: 0,
        has_sub_bom: 1,
        ref_bom_id: 20,
      },
    ], 10);

    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0]).toMatchObject({
      material_code: '3005999023',
      material_specs: 'HRF-HD6',
      bom_id: 20,
    });
    expect(tree[0].tree_key).not.toBe(tree[0].children[0].tree_key);
  });

  test('caches repeated referenced BOM reads and generates unique tree keys per branch', async () => {
    pool.query.mockResolvedValueOnce([[
      {
        id: 201,
        bom_id: 20,
        material_id: 2001,
        material_code: 'CHILD',
        quantity: 1,
        level: 1,
        parent_id: 0,
        has_sub_bom: 0,
      },
    ]]);

    const tree = await bomService.buildReferencedBomTree([
      { id: 101, bom_id: 10, material_id: 1001, quantity: 1, level: 1, parent_id: 0, has_sub_bom: 1, ref_bom_id: 20 },
      { id: 102, bom_id: 10, material_id: 1001, quantity: 1, level: 1, parent_id: 0, has_sub_bom: 1, ref_bom_id: 20 },
    ], 10);

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(tree[0].children[0].tree_key).not.toBe(tree[1].children[0].tree_key);
  });

  test('stops when a referenced BOM points back to an ancestor BOM', async () => {
    pool.query.mockResolvedValueOnce([[
      {
        id: 201,
        bom_id: 20,
        material_id: 2001,
        material_code: 'CYCLE',
        quantity: 1,
        level: 1,
        parent_id: 0,
        has_sub_bom: 1,
        ref_bom_id: 10,
      },
    ]]);

    const tree = await bomService.buildReferencedBomTree([
      { id: 101, bom_id: 10, material_id: 1001, quantity: 1, level: 1, parent_id: 0, has_sub_bom: 1, ref_bom_id: 20 },
    ], 10);

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(tree[0].children[0].children).toEqual([]);
  });
});
