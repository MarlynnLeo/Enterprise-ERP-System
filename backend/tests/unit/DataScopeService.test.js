/**
 * DataScopeService.test.js
 * @description 数据范围服务单测：SELF 拒绝无 owner、部门范围、assertRecordAccess 失败关闭
 */

jest.mock('../../src/config/db', () => ({
  pool: {
    execute: jest.fn(),
    query: jest.fn(),
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

const DataScopeService = require('../../src/services/DataScopeService');
const { pool } = require('../../src/config/db');

describe('DataScopeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('buildOwnerScopeClause', () => {
    test('null scope 失败关闭', () => {
      const clause = DataScopeService.buildOwnerScopeClause(null, { tableAlias: 'so' });
      expect(clause.where).toContain('1 = 0');
    });

    test('ALL 范围不追加条件', () => {
      const clause = DataScopeService.buildOwnerScopeClause(
        { type: DataScopeService.DATA_SCOPE.ALL, userId: 1 },
        { tableAlias: 'so' }
      );
      expect(clause.where).toBe('');
      expect(clause.join).toBe('');
      expect(clause.params).toEqual([]);
    });

    test('SELF 范围按 created_by 过滤', () => {
      const clause = DataScopeService.buildOwnerScopeClause(
        { type: DataScopeService.DATA_SCOPE.SELF, userId: 9 },
        { tableAlias: 'so', ownerColumn: 'created_by' }
      );
      expect(clause.where).toContain('created_by');
      expect(clause.params).toEqual([9]);
    });

    test('部门范围 JOIN users 并 IN 部门', () => {
      const clause = DataScopeService.buildOwnerScopeClause(
        {
          type: DataScopeService.DATA_SCOPE.DEPARTMENT,
          userId: 3,
          departmentIds: [10, 11],
        },
        { tableAlias: 'o', ownerAlias: 'owner_scope' }
      );
      expect(clause.join).toContain('LEFT JOIN users');
      expect(clause.where).toContain('department_id IN');
      expect(clause.params).toEqual([10, 11]);
    });

    test('非 ALL 且无部门 ID 时拒绝全部', () => {
      const clause = DataScopeService.buildOwnerScopeClause(
        {
          type: DataScopeService.DATA_SCOPE.DEPARTMENT_AND_CHILDREN,
          userId: 3,
          departmentIds: [],
        },
        { tableAlias: 'o' }
      );
      expect(clause.where).toContain('1 = 0');
    });
  });

  describe('assertRecordAccess', () => {
    const mockConn = { execute: jest.fn() };

    test('ALL 直接放行', async () => {
      const req = {
        authzScope: { type: DataScopeService.DATA_SCOPE.ALL, userId: 1 },
      };
      await expect(
        DataScopeService.assertRecordAccess(mockConn, req, 'sales_orders', 1, {
          ownerColumn: 'created_by',
        })
      ).resolves.toBe(true);
      expect(mockConn.execute).not.toHaveBeenCalled();
    });

    test('SELF 无 ownerColumn 拒绝', async () => {
      const req = {
        authzScope: {
          type: DataScopeService.DATA_SCOPE.SELF,
          userId: 5,
          departmentIds: [],
          locationIds: [],
        },
      };
      await expect(
        DataScopeService.assertRecordAccess(mockConn, req, 'some_table', 1, {})
      ).resolves.toBe(false);
    });

    test('SELF 仅本人记录可访问', async () => {
      const req = {
        authzScope: {
          type: DataScopeService.DATA_SCOPE.SELF,
          userId: 5,
          departmentIds: [],
          locationIds: [],
        },
      };
      mockConn.execute.mockResolvedValueOnce([[{ id: 1, owner_id: 5 }]]);
      await expect(
        DataScopeService.assertRecordAccess(mockConn, req, 'sales_orders', 1, {
          ownerColumn: 'created_by',
          deletedAtColumn: false,
        })
      ).resolves.toBe(true);

      mockConn.execute.mockResolvedValueOnce([[{ id: 2, owner_id: 99 }]]);
      await expect(
        DataScopeService.assertRecordAccess(mockConn, req, 'sales_orders', 2, {
          ownerColumn: 'created_by',
          deletedAtColumn: false,
        })
      ).resolves.toBe(false);
    });

    test('部门范围：本部门放行，外部门拒绝', async () => {
      const req = {
        authzScope: {
          type: DataScopeService.DATA_SCOPE.DEPARTMENT,
          userId: 5,
          departmentIds: [7],
          locationIds: [],
        },
      };
      mockConn.execute.mockResolvedValueOnce([
        [{ id: 1, owner_id: 9, owner_department_id: 7 }],
      ]);
      await expect(
        DataScopeService.assertRecordAccess(mockConn, req, 'sales_orders', 1, {
          ownerColumn: 'created_by',
          deletedAtColumn: false,
        })
      ).resolves.toBe(true);

      mockConn.execute.mockResolvedValueOnce([
        [{ id: 2, owner_id: 9, owner_department_id: 99 }],
      ]);
      await expect(
        DataScopeService.assertRecordAccess(mockConn, req, 'sales_orders', 2, {
          ownerColumn: 'created_by',
          deletedAtColumn: false,
        })
      ).resolves.toBe(false);
    });

    test('有业务部门字段时按单据所属部门过滤，而不是创建人部门', () => {
      const clause = DataScopeService.buildOwnerScopeClause(
        {
          type: DataScopeService.DATA_SCOPE.DEPARTMENT,
          userId: 3,
          departmentIds: [10, 11],
        },
        { tableAlias: 'pp', ownerAlias: 'plan_owner_scope', departmentColumn: 'department_id' }
      );
      expect(clause.join).toBe('');
      expect(clause.where).toContain('pp.`department_id` IN');
      expect(clause.params).toEqual([10, 11]);
    });

    test('业务部门字段用于单记录访问校验', async () => {
      const req = {
        authzScope: {
          type: DataScopeService.DATA_SCOPE.DEPARTMENT,
          userId: 5,
          departmentIds: [7],
          locationIds: [],
        },
      };
      mockConn.execute.mockResolvedValueOnce([
        [{ id: 1, owner_id: 99, resource_department_id: 7 }],
      ]);
      await expect(
        DataScopeService.assertRecordAccess(mockConn, req, 'production_plans', 1, {
          ownerColumn: 'created_by',
          departmentColumn: 'department_id',
          deletedAtColumn: false,
        })
      ).resolves.toBe(true);

      mockConn.execute.mockResolvedValueOnce([
        [{ id: 2, owner_id: 99, resource_department_id: 99 }],
      ]);
      await expect(
        DataScopeService.assertRecordAccess(mockConn, req, 'production_plans', 2, {
          ownerColumn: 'created_by',
          departmentColumn: 'department_id',
          deletedAtColumn: false,
        })
      ).resolves.toBe(false);
    });

    test('记录不存在返回 false', async () => {
      const req = {
        authzScope: {
          type: DataScopeService.DATA_SCOPE.SELF,
          userId: 5,
          departmentIds: [],
          locationIds: [],
        },
      };
      mockConn.execute.mockResolvedValueOnce([[]]);
      await expect(
        DataScopeService.assertRecordAccess(mockConn, req, 'sales_orders', 404, {
          ownerColumn: 'created_by',
          deletedAtColumn: false,
        })
      ).resolves.toBe(false);
    });
  });

  describe('getUserDataScope', () => {
    test('超级管理员标记强制 ALL', async () => {
      pool.execute
        .mockResolvedValueOnce([[{ id: 1, username: 'admin', department_id: 1 }]])
        .mockResolvedValueOnce([[{ id: 1, is_super_admin: 1, data_scope: 4 }]]);

      const scope = await DataScopeService.getUserDataScope(1);
      expect(scope.type).toBe(DataScopeService.DATA_SCOPE.ALL);
    });

    test('多角色取最宽范围（min type）', async () => {
      pool.execute
        .mockResolvedValueOnce([[{ id: 2, username: 'mgr', department_id: 3 }]])
        .mockResolvedValueOnce([
          [
            { id: 10, code: 'salesperson', data_scope: 4 },
            { id: 11, code: 'sales_manager', data_scope: 2 },
          ],
        ])
        // resolveDepartmentIds for DEPT_AND_CHILDREN
        .mockResolvedValueOnce([[{ id: 3 }, { id: 4 }]]);

      const scope = await DataScopeService.getUserDataScope(2);
      expect(scope.type).toBe(DataScopeService.DATA_SCOPE.DEPARTMENT_AND_CHILDREN);
      expect(scope.departmentIds).toEqual([3, 4]);
    });
  });
});
