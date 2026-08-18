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
