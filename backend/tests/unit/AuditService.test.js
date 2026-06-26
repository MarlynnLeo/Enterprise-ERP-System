/**
 * AuditService.test.js
 * @description 审计日志服务单元测试
 */

const mockConnection = {
  query: jest.fn(),
  release: jest.fn(),
};

jest.mock('../../src/config/db', () => ({
  getConnection: jest.fn().mockResolvedValue(mockConnection),
  pool: { query: jest.fn(), execute: jest.fn() },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const { AuditService, AuditAction, AuditModule } = require('../../src/services/AuditService');
const { getConnection } = require('../../src/config/db');

describe('AuditService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getConnection.mockResolvedValue(mockConnection);
  });

  describe('AuditAction / AuditModule 枚举', () => {
    test('AuditAction 应包含核心操作类型', () => {
      expect(AuditAction.CREATE).toBe('create');
      expect(AuditAction.UPDATE).toBe('update');
      expect(AuditAction.DELETE).toBe('delete');
      expect(AuditAction.LOGIN).toBe('login');
    });

    test('AuditModule 应包含核心业务模块', () => {
      expect(AuditModule.SYSTEM).toBe('system');
      expect(AuditModule.PRODUCTION).toBe('production');
      expect(AuditModule.FINANCE).toBe('finance');
      expect(AuditModule.MATERIAL).toBe('material');
    });
  });

  describe('log', () => {
    test('应成功记录审计日志', async () => {
      mockConnection.query.mockResolvedValueOnce([{ insertId: 1 }]);

      await AuditService.log({
        userId: 1,
        username: 'admin',
        module: 'system',
        action: 'update',
        entityType: 'role',
        entityId: '5',
        oldValue: { status: 0 },
        newValue: { status: 1 },
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0',
      });

      expect(mockConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_logs'),
        expect.arrayContaining([1, 'admin', 'system', 'update', 'role', '5'])
      );
      expect(mockConnection.release).toHaveBeenCalled();
    });

    test('审计失败不应抛出异常（静默降级）', async () => {
      mockConnection.query.mockRejectedValueOnce(new Error('DB connection lost'));

      // 不应抛出
      await expect(
        AuditService.log({
          module: 'system',
          action: 'update',
        })
      ).resolves.toBeUndefined();
    });

    test('应正确序列化 JSON 值', async () => {
      mockConnection.query.mockResolvedValueOnce([{}]);

      await AuditService.log({
        userId: 1,
        username: 'admin',
        module: 'material',
        action: 'update',
        entityType: 'material',
        entityId: '10',
        oldValue: { price: 100 },
        newValue: { price: 200 },
      });

      const args = mockConnection.query.mock.calls[0][1];
      expect(args[6]).toBe('{"price":100}');
      expect(args[7]).toBe('{"price":200}');
    });
  });

  describe('logFromRequest', () => {
    test('应从请求对象提取用户信息', async () => {
      mockConnection.query.mockResolvedValueOnce([{}]);

      const mockReq = {
        user: { id: 3, username: 'testuser' },
        ip: '10.0.0.1',
        headers: { 'user-agent': 'Jest Test' },
        connection: {},
      };

      await AuditService.logFromRequest(
        mockReq,
        'material',
        'create',
        'material',
        '100'
      );

      const args = mockConnection.query.mock.calls[0][1];
      expect(args[0]).toBe(3);  // userId
      expect(args[1]).toBe('testuser');
      expect(args[8]).toBe('10.0.0.1');
    });
  });

  describe('query', () => {
    test('应支持分页查询', async () => {
      mockConnection.query
        .mockResolvedValueOnce([[{ id: 1 }, { id: 2 }]])
        .mockResolvedValueOnce([[{ total: 50 }]]);

      const result = await AuditService.query({ page: 1, pageSize: 20 });

      expect(result.list).toHaveLength(2);
      expect(result.total).toBe(50);
      expect(result.page).toBe(1);
    });

    test('应正确拼接过滤条件', async () => {
      mockConnection.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ total: 0 }]]);

      await AuditService.query({
        module: 'system',
        action: 'update',
        userId: 1,
      });

      const sql = mockConnection.query.mock.calls[0][0];
      expect(sql).toContain('module = ?');
      expect(sql).toContain('action = ?');
      expect(sql).toContain('user_id = ?');
    });
  });
});
