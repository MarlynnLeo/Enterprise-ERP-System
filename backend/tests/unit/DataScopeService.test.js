/**
 * DataScopeService.test.js
 * @description 行级数据范围：SELF/部门/CUSTOM 过滤 + 缓存 + 失败关闭。
 */

jest.mock('../../src/config/db', () => ({
  pool: {
    execute: jest.fn(),
    query: jest.fn(),
  },
}));

const DataScopeService = require('../../src/services/DataScopeService');
const { pool } = require('../../src/config/db');

describe('DataScopeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    DataScopeService.clearDataScopeCache();
  });

  describe('范围构建', () => {
    test('无 scope 失败关闭', () => {
      expect(DataScopeService.isAllScope(null)).toBe(false);
      const clause = DataScopeService.buildOwnerScopeClause(null, { tableAlias: 'so' });
      expect(clause).toEqual({ join: '', where: ' AND 1 = 0', params: [] });
    });

    test('ALL 不追加条件', () => {
      const clause = DataScopeService.buildOwnerScopeClause(
        {
          type: DataScopeService.DATA_SCOPE.ALL,
          userId: 9,
          departmentIds: [],
          locationIds: [],
        },
        { tableAlias: 'so', ownerColumn: 'created_by' }
      );
      expect(clause).toEqual({ join: '', where: '', params: [] });
    });

    test('SELF 仅本人', () => {
      const clause = DataScopeService.buildOwnerScopeClause(
        {
          type: DataScopeService.DATA_SCOPE.SELF,
          userId: 9,
          departmentIds: [],
          locationIds: [],
        },
        { tableAlias: 'so', ownerColumn: 'created_by' }
      );
      expect(clause.where).toContain('created_by');
      expect(clause.params).toEqual([9]);
    });

    test('部门范围 join users', () => {
      const clause = DataScopeService.buildOwnerScopeClause(
        {
          type: DataScopeService.DATA_SCOPE.DEPARTMENT,
          userId: 9,
          departmentIds: [10, 11],
          locationIds: [],
        },
        { tableAlias: 'so', ownerColumn: 'created_by', ownerAlias: 'so_owner' }
      );
      expect(clause.join).toContain('LEFT JOIN users');
      expect(clause.where).toContain('department_id IN');
      expect(clause.params).toEqual([10, 11]);
    });

    test('CUSTOM 调拨单要求调出和调入库位都在授权范围内', () => {
      const clause = DataScopeService.buildOwnerScopeClause(
        {
          type: DataScopeService.DATA_SCOPE.CUSTOM,
          userId: 9,
          departmentIds: [],
          locationIds: [3, 4],
        },
        {
          tableAlias: 't',
          ownerColumn: 'created_by',
          locationColumns: ['from_location_id', 'to_location_id'],
          requireAllLocations: true,
          includeLocation: true,
        }
      );

      expect(clause.where).toContain('t.`from_location_id` IN (?,?)');
      expect(clause.where).toContain('t.`to_location_id` IN (?,?)');
      expect(clause.where).toContain(' AND ');
      expect(clause.params).toEqual([3, 4, 3, 4]);
    });

    test('请求上已有 authzScope 时直接复用', async () => {
      const req = {
        user: { id: 7 },
        authzScope: {
          type: DataScopeService.DATA_SCOPE.CUSTOM,
          userId: 7,
          departmentIds: [3],
          locationIds: [8],
        },
      };
      await expect(DataScopeService.getRequestScope(req)).resolves.toEqual(
        expect.objectContaining({
          type: DataScopeService.DATA_SCOPE.CUSTOM,
          userId: 7,
          departmentIds: [3],
          locationIds: [8],
        })
      );
    });
  });

  describe('记录访问', () => {
    const mockConn = { execute: jest.fn() };

    beforeEach(() => {
      mockConn.execute.mockReset();
    });

    test('SELF 比较创建人', async () => {
      const req = {
        authzScope: {
          type: DataScopeService.DATA_SCOPE.SELF,
          userId: 5,
          departmentIds: [],
          locationIds: [],
        },
      };
      mockConn.execute.mockResolvedValueOnce([[{ id: 1, owner_id: 5, owner_department_id: 2 }]]);

      await expect(
        DataScopeService.assertRecordAccess(mockConn, req, 'sales_orders', 1, {
          ownerColumn: 'created_by',
          deletedAtColumn: false,
        })
      ).resolves.toBe(true);
      expect(mockConn.execute.mock.calls[0][0]).toContain('created_by');
    });

    test('SELF 他人单据拒绝', async () => {
      const req = {
        authzScope: {
          type: DataScopeService.DATA_SCOPE.SELF,
          userId: 5,
          departmentIds: [],
          locationIds: [],
        },
      };
      mockConn.execute.mockResolvedValueOnce([[{ id: 1, owner_id: 99, owner_department_id: 2 }]]);

      await expect(
        DataScopeService.assertRecordAccess(mockConn, req, 'sales_orders', 1, {
          ownerColumn: 'created_by',
          deletedAtColumn: false,
        })
      ).resolves.toBe(false);
    });

    test('未认证请求失败关闭', async () => {
      // No user and no authzScope → loadUserDataScope(null) → SELF without userId
      pool.execute.mockReset();
      await expect(
        DataScopeService.assertRecordAccess(mockConn, {}, 'sales_orders', 1, {
          ownerColumn: 'created_by',
          deletedAtColumn: false,
        })
      ).resolves.toBe(false);
      // May query users/roles only when a userId exists; empty req stays fail-closed.
      expect(mockConn.execute).not.toHaveBeenCalled();
    });

    test('ALL 只校验记录存在', async () => {
      const req = { authzScope: { type: DataScopeService.DATA_SCOPE.ALL, userId: 1 } };
      mockConn.execute.mockResolvedValueOnce([[{ id: 1 }]]);
      await expect(
        DataScopeService.assertRecordAccess(mockConn, req, 'sales_orders', 1, {
          deletedAtColumn: false,
        })
      ).resolves.toBe(true);
    });

    test('assertRecordExists 仍校验软删和附加删除标记', async () => {
      mockConn.execute.mockResolvedValueOnce([[{ id: 7 }]]);
      await expect(
        DataScopeService.assertRecordExists(mockConn, 'inventory_inbound', 7, {
          deletedAtColumn: 'deleted_at',
          extraSoftDelete: { column: 'is_deleted', value: 0 },
        })
      ).resolves.toBe(true);

      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('`deleted_at` IS NULL'),
        [7, 0]
      );
      expect(mockConn.execute.mock.calls[0][0]).toContain('`is_deleted` = ?');
    });

    test('CUSTOM 库位不在授权列表则拒绝', async () => {
      const req = {
        authzScope: {
          type: DataScopeService.DATA_SCOPE.CUSTOM,
          userId: 5,
          departmentIds: [],
          locationIds: [1],
        },
      };
      await expect(DataScopeService.canAccessLocation(req, 999)).resolves.toBe(false);
      await expect(DataScopeService.canAccessLocation(req, 1)).resolves.toBe(true);
    });

    test('CUSTOM 调拨单任一端库位越权时拒绝，双端均授权时放行', async () => {
      const req = {
        authzScope: {
          type: DataScopeService.DATA_SCOPE.CUSTOM,
          userId: 5,
          departmentIds: [],
          locationIds: [10, 20],
        },
      };
      const options = {
        ownerColumn: 'created_by',
        locationColumns: ['from_location_id', 'to_location_id'],
        requireAllLocations: true,
        deletedAtColumn: false,
      };

      mockConn.execute.mockResolvedValueOnce([
        [{ id: 1, owner_id: 5, location_id_0: 10, location_id_1: 20 }],
      ]);
      await expect(
        DataScopeService.assertRecordAccess(mockConn, req, 'inventory_transfers', 1, options)
      ).resolves.toBe(true);

      mockConn.execute.mockResolvedValueOnce([
        [{ id: 2, owner_id: 5, location_id_0: 10, location_id_1: 99 }],
      ]);
      await expect(
        DataScopeService.assertRecordAccess(mockConn, req, 'inventory_transfers', 2, options)
      ).resolves.toBe(false);
    });
  });

  describe('用户范围加载', () => {
    test('同一首屏并发只加载一次并返回隔离副本', async () => {
      pool.execute
        .mockResolvedValueOnce([[{ id: 8, username: 'viewer', department_id: 2 }]])
        .mockResolvedValueOnce([
          [{ id: 1, is_super_admin: 0, data_scope: DataScopeService.DATA_SCOPE.SELF }],
        ]);

      const [first, second] = await Promise.all([
        DataScopeService.getUserDataScope(8),
        DataScopeService.getUserDataScope(8),
      ]);

      expect(pool.execute).toHaveBeenCalledTimes(2);
      expect(first.type).toBe(DataScopeService.DATA_SCOPE.SELF);
      expect(second.type).toBe(DataScopeService.DATA_SCOPE.SELF);
      first.departmentIds.push(999);
      expect(second.departmentIds).toEqual([]);

      const cached = await DataScopeService.getUserDataScope(8);
      expect(cached.type).toBe(DataScopeService.DATA_SCOPE.SELF);
      expect(pool.execute).toHaveBeenCalledTimes(2);
    });

    test('超级管理员返回 ALL', async () => {
      pool.execute
        .mockResolvedValueOnce([[{ id: 2, username: 'admin', department_id: 3 }]])
        .mockResolvedValueOnce([
          [{ id: 1, is_super_admin: 1, data_scope: DataScopeService.DATA_SCOPE.SELF }],
        ]);

      const scope = await DataScopeService.getUserDataScope(2);

      expect(scope).toEqual({
        type: DataScopeService.DATA_SCOPE.ALL,
        userId: 2,
        departmentId: 3,
        departmentIds: [],
        locationIds: [],
      });
      expect(pool.execute.mock.calls[1][0]).toContain('roles');
    });
  });
});
