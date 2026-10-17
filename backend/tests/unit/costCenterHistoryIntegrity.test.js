jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
const db = require('../../src/config/db');
const centers = require('../../src/services/business/CostCenterService');

describe('cost center historical department allocation', () => {
  let connection;
  let usage;
  beforeEach(() => {
    usage = {};
    connection = {
      beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
      execute: jest.fn(async (sql) => {
        if (sql.includes('FOR UPDATE')) return [[{ id: 1, department_id: 7 }]];
        if (sql.includes('entry_count')) return [[usage]];
        if (sql.includes('COUNT(*) as cnt')) return [[{ cnt: 0 }]];
        return [{ affectedRows: 1 }];
      }),
    };
    db.pool.getConnection.mockResolvedValue(connection);
  });

  test.each(['entry_count', 'expense_count', 'task_count'])('cannot reassign or delete a center with %s history', async (key) => {
    usage[key] = 1;
    await expect(centers.update(1, { department_id: 8 })).rejects.toThrow('不能删除或变更部门归属');
    await expect(centers.delete(1)).rejects.toThrow('不能删除或变更部门归属');
    expect(connection.execute.mock.calls[0][0]).toContain('cost_centers WHERE id = ? AND deleted_at IS NULL FOR UPDATE');
    expect(connection.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  });

  test('unused center can be reassigned and committed', async () => {
    await expect(centers.update(1, { department_id: 8 })).resolves.toEqual({ affected: 1 });
    expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('SET department_id = ?'), [8, 1]);
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  test('renaming does not reinterpret historical departments and string zero remains inactive', async () => {
    usage.entry_count = 1;
    await centers.update(1, { name: 'renamed', department_id: 7, is_active: '0' });
    expect(connection.execute.mock.calls).toHaveLength(2);
    expect(connection.execute.mock.calls[1][1]).toEqual(['renamed', 7, 0, 1]);
  });
});
