/**
 * materialService.test.js
 * @description 物料服务单元测试
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

jest.mock('../../src/utils/softDelete', () => ({
  softDelete: jest.fn(),
}));

const materialService = require('../../src/services/materialService');
const { pool } = require('../../src/config/db');
const { softDelete } = require('../../src/utils/softDelete');

describe('materialService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllMaterials pagination', () => {
    test('filters and limits material IDs before loading dictionary, stock and BOM data', async () => {
      const rows = [{ id: 5, stock_quantity: 12, has_bom: 1, bom_id: 8 }];
      pool.query.mockResolvedValueOnce([[{ total: 230 }]]).mockResolvedValueOnce([rows]);

      const result = await materialService.getAllMaterials(2, 20, {
        search: ' bolt ', category_id: '7', material_type: 'steel', status: '1',
      });
      const [countSql, countParams] = pool.query.mock.calls[0];
      const [listSql, listParams] = pool.query.mock.calls[1];
      expect(countParams).toEqual(['%bolt%', '%bolt%', '%bolt%', '%bolt%', 7, 'steel', 1]);
      expect(listParams).toEqual(countParams);
      expect(countSql).not.toContain('JOIN');
      expect(listSql).toMatch(/SELECT m\.id FROM materials m\s+WHERE m\.deleted_at IS NULL/);
      expect(listSql.indexOf('LIMIT 20 OFFSET 20')).toBeLessThan(listSql.indexOf('LEFT JOIN categories'));
      expect(listSql).toContain('JOIN materials m ON m.id = page_material.id');
      expect(listSql).toContain('m.location_id IS NULL OR il.location_id = m.location_id');
      expect(listSql).toContain('m.code ASC, m.id ASC');
      expect(result).toEqual({ data: rows, pagination: { total: 230, page: 2, pageSize: 20, totalPages: 12 } });
      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    test('export still reads the entire filtered set without a page limit', async () => {
      pool.query.mockResolvedValueOnce([[{ total: 101 }]]).mockResolvedValueOnce([Array(101).fill({ id: 1 })]);
      const result = await materialService.getAllMaterials(1, null, { status: 0, code: 'M' });
      const [sql, params] = pool.query.mock.calls[1];
      expect(sql).not.toContain('LIMIT');
      expect(sql).not.toContain('page_material');
      expect(sql).toContain('m.deleted_at IS NULL');
      expect(params).toEqual(['%M%', 0]);
      expect(result.data).toHaveLength(101);
      expect(result.pagination).toEqual({ total: 101, page: 1, pageSize: 101, totalPages: 1 });
    });

    test('out-of-range pages preserve the count and return an empty page', async () => {
      pool.query.mockResolvedValueOnce([[{ total: 12 }]]).mockResolvedValueOnce([[]]);
      const result = await materialService.getAllMaterials(10, 20);
      expect(result).toEqual({ data: [], pagination: { total: 12, page: 10, pageSize: 20, totalPages: 1 } });
      expect(pool.query.mock.calls[1][0]).toContain('LIMIT 20 OFFSET 180');
    });

    test('public list page sizes stay capped at 100', async () => {
      pool.query.mockResolvedValueOnce([[{ total: 500 }]]).mockResolvedValueOnce([[]]);
      const result = await materialService.getAllMaterials(1, 10000);
      expect(result.pagination.pageSize).toBe(100);
      expect(pool.query.mock.calls[1][0]).toContain('LIMIT 100 OFFSET 0');
    });
  });

  describe('getMaterialById', () => {
    test('应返回物料详情', async () => {
      const mockMaterial = { id: 1, code: 'M001', name: '铝合金板' };
      pool.execute.mockResolvedValueOnce([[mockMaterial]]);

      const result = await materialService.getMaterialById(1);
      expect(result).toEqual(mockMaterial);
      expect(pool.execute).toHaveBeenCalledWith(
        expect.stringContaining('WHERE m.id = ?'),
        [1]
      );
    });

    test('物料不存在时应返回 null', async () => {
      pool.execute.mockResolvedValueOnce([[]]);
      const result = await materialService.getMaterialById(999);
      expect(result).toBeNull();
    });
  });

  describe('createMaterial', () => {
    test('应成功创建物料', async () => {
      pool.execute.mockResolvedValueOnce([{ insertId: 10 }]);

      const result = await materialService.createMaterial({
        code: 'M002',
        name: '不锈钢管',
        specs: 'DN50',
      });

      expect(result.id).toBe(10);
      expect(result.code).toBe('M002');
      expect(pool.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO materials'),
        expect.any(Array)
      );
    });

    test('空字符串字段应转为 null', async () => {
      pool.execute.mockResolvedValueOnce([{ insertId: 11 }]);

      const result = await materialService.createMaterial({
        code: 'M003',
        name: '测试',
        remark: '',
      });

      // remark 为空字符串应转 null
      const args = pool.execute.mock.calls[0][1];
      expect(args).toContain(null);
    });

    test('应阻止 SQL 注入字段名', async () => {
      await expect(
        materialService.createMaterial({
          'code; DROP TABLE materials': 'hack',
          name: 'test',
        })
      ).rejects.toThrow('非法字段名');
    });
  });

  describe('deleteMaterial', () => {
    test('无引用时应成功软删除', async () => {
      pool.query
        .mockResolvedValueOnce([[{ count: 0 }]])  // BOM details check
        .mockResolvedValueOnce([[{ count: 0 }]])  // BOM masters check
        .mockResolvedValueOnce([[{ count: 0 }]]); // Inventory check
      softDelete.mockResolvedValueOnce();

      const result = await materialService.deleteMaterial(1);
      expect(result).toBe(true);
      expect(softDelete).toHaveBeenCalledWith(pool, 'materials', 'id', 1);
      expect(pool.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE materials SET code = CONCAT'),
        [1]
      );
    });

    test('被 BOM 引用时应拒绝删除', async () => {
      pool.query.mockResolvedValueOnce([[{ count: 3 }]]);

      await expect(materialService.deleteMaterial(1))
        .rejects.toThrow('该物料被BOM引用，不能删除');
    });

    test('有库存时应拒绝删除', async () => {
      pool.query
        .mockResolvedValueOnce([[{ count: 0 }]])
        .mockResolvedValueOnce([[{ count: 0 }]])
        .mockResolvedValueOnce([[{ count: 5 }]]);

      await expect(materialService.deleteMaterial(1))
        .rejects.toThrow('该物料有库存记录，不能删除');
    });
  });

  describe('getLatestMaterialByCategory', () => {
    test('无分类ID时应返回 null', async () => {
      const result = await materialService.getLatestMaterialByCategory(null);
      expect(result).toBeNull();
      expect(pool.query).not.toHaveBeenCalled();
    });

    test('分类下有物料时应返回编码最大的一条', async () => {
      pool.query.mockResolvedValueOnce([[{ id: 12, code: '100104003', name: '开关电源' }]]);
      const result = await materialService.getLatestMaterialByCategory(120);
      expect(result).toEqual({ id: 12, code: '100104003', name: '开关电源' });
      expect(pool.query).toHaveBeenCalled();
    });
  });

  describe('getNextMaterialSequence', () => {
    test('无已有编码时应返回 1', async () => {
      pool.query.mockResolvedValueOnce([[]]);
      const result = await materialService.getNextMaterialSequence('M');
      expect(result).toBe(1);
    });

    test('已有编码时应返回下一个序号', async () => {
      pool.query.mockResolvedValueOnce([[{ code: 'M005' }]]);
      const result = await materialService.getNextMaterialSequence('M');
      expect(result).toBe(6);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at IS NULL'),
        expect.any(Array)
      );
    });
  });

  describe('updateStatus', () => {
    test('应更新物料状态', async () => {
      pool.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      const result = await materialService.updateStatus(1, 0);
      expect(result).toBe(true);
    });

    test('物料不存在时应返回 false', async () => {
      pool.execute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      const result = await materialService.updateStatus(999, 1);
      expect(result).toBe(false);
    });
  });

  describe('别名兼容', () => {
    test('getAll 应代理到 getAllMaterials', () => {
      expect(typeof materialService.getAll).toBe('function');
      expect(typeof materialService.getById).toBe('function');
      expect(typeof materialService.create).toBe('function');
    });
  });
});
