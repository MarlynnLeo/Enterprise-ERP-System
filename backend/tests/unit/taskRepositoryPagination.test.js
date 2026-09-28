jest.mock('../../src/config/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../../src/services/business/ProductProcessTaskService', () => ({}));
const { pool } = require('../../src/config/db');
const TaskRepository = require('../../src/repositories/TaskRepository');

test('task keyword search includes production group and only known localized status matches', () => {
  const result = TaskRepository.buildFilterConditions({
    keyword: '生产中', keywordStatuses: 'in_progress,not-a-status,in_progress',
  });
  expect(result.whereClause).toContain('pt.manager LIKE ?');
  expect(result.whereClause).toContain('pt.status IN (?)');
  expect(result.queryParams).toEqual([...Array(6).fill('%生产中%'), 'in_progress']);
});

test('task pagination uses stable ordering and identical scoped filters for rows and totals', async () => {
  pool.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 80 }]]).mockResolvedValueOnce([[{}]]);
  const result = await TaskRepository.findListWithPagination(
    { keyword: '装配组' },
    { page: 3, pageSize: 25, scopeClause: { where: ' AND pt.created_by = ?', params: [12] } }
  );
  expect(result).toMatchObject({ total: 80, page: 3, pageSize: 25 });
  const [list, count, stats] = pool.query.mock.calls;
  expect(list[0]).toContain('ORDER BY pt.created_at DESC, pt.id DESC');
  expect(list[0]).toMatch(/LIMIT 25 OFFSET 50/);
  for (const [sql, params] of [list, count, stats]) {
    expect(sql).toContain('pt.manager LIKE ?');
    expect(sql).toContain('AND pt.created_by = ?');
    expect(params).toEqual([...Array(6).fill('%装配组%'), 12]);
  }
});
