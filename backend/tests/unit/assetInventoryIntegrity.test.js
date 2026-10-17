jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));
const db = require('../../src/config/db');
const inventory = require('../../src/models/assetInventory');

describe('fixed asset count integrity', () => {
  let connection;
  let status;
  let item;
  let uncounted;
  beforeEach(() => {
    status = '进行中';
    item = { id: 2, inventory_id: 10, book_quantity: 1 };
    uncounted = [];
    connection = {
      beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
      query: jest.fn(async (sql, params) => {
        if (sql.includes('FROM asset_inventories')) return [[{ id: 10, status }]];
        if (sql.includes('WHERE id = ? AND inventory_id')) return [params[1] === item.inventory_id ? [item] : []];
        if (sql.includes('SELECT id FROM asset_inventory_items')) return [uncounted];
        if (sql.includes('COUNT(*) as total')) return [[{ total: 1, shortage: 1 }]];
        return [{ affectedRows: 1 }];
      }),
    };
    db.pool.getConnection.mockResolvedValue(connection);
  });

  test.each([-1, 1.5, '2oops', '', null, Infinity])('rejects invalid quantity %s', async (quantity) => {
    await expect(inventory.updateInventoryItem(2, { actual_quantity: quantity }, 10)).rejects.toThrow('非负整数');
    expect(connection.query).not.toHaveBeenCalled();
  });

  test('derives shortage from the count even when client claims it matches', async () => {
    await inventory.updateInventoryItem(2, { actual_quantity: '0', status: '盘点相符' }, 10);
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('SET actual_quantity'), [0, '盘亏', null, 2, 10]);
    expect(connection.query.mock.calls[0][0]).toContain('asset_inventories WHERE id = ? FOR UPDATE');
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  test('requires the item to belong to the route inventory', async () => {
    await expect(inventory.updateInventoryItem(2, { actual_quantity: 1 }, 11)).rejects.toThrow('不属于');
    expect(connection.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
  });

  test.each(['已完成', '已取消'])('count and completion reject %s inventory under the parent lock', async (value) => {
    status = value;
    await expect(inventory.updateInventoryItem(2, { actual_quantity: 1 }, 10)).rejects.toThrow('仅进行中');
    await expect(inventory.completeInventory(10, 8)).rejects.toThrow('仅进行中');
    expect(connection.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  });

  test('completion refuses missing count values and releases the transaction', async () => {
    uncounted = [{ id: 2 }];
    await expect(inventory.completeInventory(10, 8)).rejects.toThrow('未确认实盘数量');
    expect(connection.query.mock.calls[1][0]).toContain('actual_quantity IS NULL');
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });
});
