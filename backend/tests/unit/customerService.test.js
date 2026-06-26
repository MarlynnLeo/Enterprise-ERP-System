/**
 * customerService.test.js
 * @description 客户服务单元测试
 */

jest.mock('../../src/config/db', () => ({
  pool: {
    query: jest.fn(),
    execute: jest.fn(),
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

const customerService = require('../../src/services/customerService');
const { pool } = require('../../src/config/db');
const { softDelete } = require('../../src/utils/softDelete');

describe('customerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCustomerById', () => {
    test('应返回客户详情', async () => {
      const mockCustomer = { id: 1, code: 'KH001', name: '华为技术' };
      pool.query.mockResolvedValueOnce([[mockCustomer]]);

      const result = await customerService.getCustomerById(1);
      expect(result).toEqual(mockCustomer);
    });

    test('客户不存在时应返回 undefined', async () => {
      pool.query.mockResolvedValueOnce([[]]);
      const result = await customerService.getCustomerById(999);
      expect(result).toBeUndefined();
    });
  });

  describe('createCustomer', () => {
    test('有编码时应直接使用', async () => {
      pool.query
        .mockResolvedValueOnce([{ insertId: 10 }])  // INSERT
        .mockResolvedValueOnce([[{ id: 10, code: 'C001', name: '测试客户' }]]);  // SELECT

      const result = await customerService.createCustomer({
        code: 'C001',
        name: '测试客户',
      });

      expect(result.code).toBe('C001');
    });

    test('无编码时应自动生成 KH+年月+序号', async () => {
      pool.query
        .mockResolvedValueOnce([[{ max_seq: 5 }]])  // 查最大序号
        .mockResolvedValueOnce([{ insertId: 11 }])  // INSERT
        .mockResolvedValueOnce([[{ id: 11, code: 'KH26060006', name: '新客户' }]]);  // SELECT

      const result = await customerService.createCustomer({
        name: '新客户',
      });

      expect(result.id).toBe(11);
      // 验证 INSERT SQL 包含自动生成的编码
      const insertCall = pool.query.mock.calls[1];
      expect(insertCall[0]).toContain('INSERT INTO customers');
    });

    test('默认状态应为启用(1)', async () => {
      pool.query
        .mockResolvedValueOnce([{ insertId: 12 }])
        .mockResolvedValueOnce([[{ id: 12 }]]);

      await customerService.createCustomer({
        code: 'C002',
        name: '客户2',
      });

      const insertArgs = pool.query.mock.calls[0][1];
      // status 应在参数列表中为 1
      expect(insertArgs).toContain(1);
    });
  });

  describe('updateCustomer', () => {
    test('客户不存在时应抛出异常', async () => {
      pool.query.mockResolvedValueOnce([[]]);

      await expect(
        customerService.updateCustomer(999, { name: '新名称' })
      ).rejects.toThrow('客户不存在');
    });

    test('无变更字段时应返回原数据', async () => {
      const existing = { id: 1, code: 'KH001', name: '原客户' };
      pool.query.mockResolvedValueOnce([[existing]]);

      const result = await customerService.updateCustomer(1, {});
      expect(result).toEqual(existing);
      // 不应执行 UPDATE
      expect(pool.query).toHaveBeenCalledTimes(1);
    });

    test('应只更新传入的字段', async () => {
      pool.query
        .mockResolvedValueOnce([[{ id: 1, name: '旧名' }]])  // 存在性检查
        .mockResolvedValueOnce([{ affectedRows: 1 }])        // UPDATE
        .mockResolvedValueOnce([[{ id: 1, name: '新名' }]]); // 查询更新后

      const result = await customerService.updateCustomer(1, { name: '新名' });
      expect(result.name).toBe('新名');

      const updateSql = pool.query.mock.calls[1][0];
      expect(updateSql).toContain('name = ?');
    });
  });

  describe('deleteCustomer', () => {
    test('无关联订单时应软删除', async () => {
      pool.query.mockResolvedValueOnce([[{ count: 0 }]]);
      softDelete.mockResolvedValueOnce();

      const result = await customerService.deleteCustomer(1);
      expect(result).toBe(true);
      expect(softDelete).toHaveBeenCalledWith(pool, 'customers', 'id', 1);
    });

    test('有关联订单时应拒绝删除', async () => {
      pool.query.mockResolvedValueOnce([[{ count: 3 }]]);

      await expect(customerService.deleteCustomer(1))
        .rejects.toThrow('该客户有关联的销售订单，不能删除');
    });
  });

  describe('getCustomerStats', () => {
    test('应返回统计数据', async () => {
      pool.query.mockResolvedValueOnce([[{
        total: 100,
        active: 80,
        inactive: 20,
        totalCredit: 5000000,
      }]]);

      const stats = await customerService.getCustomerStats();
      expect(stats.total).toBe(100);
      expect(stats.active).toBe(80);
      expect(stats.totalCredit).toBe(5000000);
    });
  });

  describe('别名兼容', () => {
    test('所有别名方法应存在', () => {
      expect(typeof customerService.getAll).toBe('function');
      expect(typeof customerService.getById).toBe('function');
      expect(typeof customerService.create).toBe('function');
      expect(typeof customerService.update).toBe('function');
      expect(typeof customerService.delete).toBe('function');
    });
  });
});
