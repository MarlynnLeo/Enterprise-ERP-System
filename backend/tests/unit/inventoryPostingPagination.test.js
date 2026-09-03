jest.mock('../../src/config/db', () => ({ pool: {} }));

const InventoryPostingService = require('../../src/services/InventoryPostingService');

describe('InventoryPostingService.list pagination', () => {
  test('uses validated literal pagination instead of prepared LIMIT parameters', async () => {
    const connection = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[{ id: 8243, source_no: 'IN202609030001' }]]),
    };

    const result = await InventoryPostingService.list(
      { page: '2', pageSize: '25', financeStatus: 'pending', keyword: 'IN2026' },
      connection
    );

    expect(result).toEqual({
      list: [{ id: 8243, source_no: 'IN202609030001' }],
      total: 1,
      page: 2,
      pageSize: 25,
    });
    expect(connection.execute).toHaveBeenCalledTimes(2);
    expect(connection.execute.mock.calls[1][0]).toContain('LIMIT 25 OFFSET 25');
    expect(connection.execute.mock.calls[1][0]).not.toContain('LIMIT ?');
    expect(connection.execute.mock.calls[1][1]).toEqual([
      'pending',
      '%IN2026%',
      '%IN2026%',
    ]);
  });

  test('clamps invalid pagination values', async () => {
    const connection = {
      execute: jest.fn().mockResolvedValueOnce([[{ total: 0 }]]).mockResolvedValueOnce([[]]),
    };

    const result = await InventoryPostingService.list(
      { page: '-1', pageSize: '10000' },
      connection
    );

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(100);
    expect(connection.execute.mock.calls[1][0]).toContain('LIMIT 100 OFFSET 0');
    expect(connection.execute.mock.calls[1][1]).toEqual([]);
  });
});
