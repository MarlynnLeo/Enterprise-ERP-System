/* global beforeEach, describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../../src/authorization/ScopeGuard', () => ({ applyListScope: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn() } }));

const { pool } = require('../../src/config/db');
const ScopeGuard = require('../../src/authorization/ScopeGuard');
const { getDefectItems } = require('../../src/controllers/business/quality/qualityStatisticsController');

const responseDouble = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

function mockResults(rows = [], total = rows.length) {
  pool.query.mockResolvedValueOnce([[{ total }]]).mockResolvedValueOnce([rows]);
}

function selectedExpression(sql, alias) {
  return sql.match(new RegExp(`MAX\\((\\(CASE(?:(?!END\\)).)*END\\))\\) as ${alias}`, 's'))?.[1];
}

describe('quality dashboard defect material fields', () => {
  beforeEach(() => {
    pool.query.mockReset();
    ScopeGuard.applyListScope.mockResolvedValue({ join: '', where: '', params: [] });
  });

  test('resolves incoming materials and production products without requiring product snapshots', async () => {
    mockResults();
    await getDefectItems({ query: {} }, responseDouble());
    const [count, list] = pool.query.mock.calls;

    for (const [sql] of [count, list]) {
      expect(sql).toContain("LEFT JOIN materials m ON qi.inspection_type = 'incoming' AND qi.material_id = m.id");
      expect(sql).toContain("LEFT JOIN materials proc_m ON qi.inspection_type IN ('process', 'final', 'first_article') AND qi.product_id = proc_m.id");
      expect(sql).toContain("LEFT JOIN production_tasks pt ON qi.inspection_type IN ('process', 'final', 'first_article') AND COALESCE(qi.task_id, qi.reference_id) = pt.id");
      expect(sql).toContain('LEFT JOIN materials task_m ON pt.product_id = task_m.id');
    }

    for (const [field, alias] of [['name', 'materialName'], ['code', 'materialCode']]) {
      const expression = selectedExpression(list[0], alias);
      // Inspection items multiply joined rows; aggregate the one material value so
      // ONLY_FULL_GROUP_BY does not depend on inference through the task COALESCE join.
      expect(list[0]).toContain(`MAX(${expression}) as ${alias}`);
      expect(expression).toContain(`WHEN qi.inspection_type = 'incoming' THEN COALESCE(NULLIF(m.${field}, ''), NULLIF(qi.product_${field}, ''))`);
      expect(expression).toContain(`WHEN qi.inspection_type = 'final' THEN COALESCE(NULLIF(task_m.${field}, ''), NULLIF(qi.product_${field}, ''), NULLIF(proc_m.${field}, ''))`);
      expect(expression).toContain(`ELSE COALESCE(NULLIF(qi.product_${field}, ''), NULLIF(proc_m.${field}, ''), NULLIF(task_m.${field}, ''))`);
    }
  });

  test.each(['盘头自攻螺钉', '3011002040', "part' OR 1 = 1 --"])(
    'searches displayed material names and codes with identical scoped count and list filters: %s',
    async (keyword) => {
      ScopeGuard.applyListScope.mockResolvedValue({
        join: 'LEFT JOIN users quality_defect_owner_scope ON quality_defect_owner_scope.id = qi.inspector_id',
        where: ' AND quality_defect_owner_scope.id = ?',
        params: [7],
      });
      mockResults([], 21);
      const res = responseDouble();
      const req = { query: { keyword, startDate: '2026-09-01', endDate: '2026-09-28', page: 2, pageSize: 5 } };

      await getDefectItems(req, res);

      const [count, list] = pool.query.mock.calls;
      expect(ScopeGuard.applyListScope).toHaveBeenCalledWith(req, 'quality_inspection', {
        tableAlias: 'qi', ownerAlias: 'quality_defect_owner_scope',
      });
      for (const [sql, params] of [count, list]) {
        for (const alias of ['materialName', 'materialCode']) {
          expect(sql).toContain(`OR ${selectedExpression(list[0], alias)} LIKE ?`);
        }
        expect(sql).toContain('quality_defect_owner_scope.id = qi.inspector_id');
        expect(sql).toContain('quality_defect_owner_scope.id = ?');
        expect(sql).toContain('qi.deleted_at IS NULL');
        expect(sql).toContain("qi.status IN ('failed', 'partial', 'critical')");
        expect(sql).not.toContain(keyword);
        expect(params).toEqual([...Array(4).fill(`%${keyword}%`), '2026-09-01', '2026-09-28', 7]);
      }
      expect(count[0].slice(count[0].indexOf('WHERE ')).trim()).toBe(
        list[0].slice(list[0].indexOf('WHERE '), list[0].indexOf('GROUP BY qi.id')).trim()
      );
      expect(count[0]).toContain('COUNT(DISTINCT qi.id)');
      expect(list[0]).toContain('LIMIT 5 OFFSET 5');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0].data).toMatchObject({ list: [], total: 21, page: 2, pageSize: 5 });
    }
  );

  test('preserves resolved incoming, process, final and first-article fields in the paginated API contract', async () => {
    const rows = [
      { id: 55, inspectionType: 'incoming', materialName: '盘头自攻螺钉', materialCode: '3011002040' },
      { id: 56, inspectionType: 'process', materialName: '过程产品', materialCode: 'PR-01' },
      { id: 57, inspectionType: 'final', materialName: '生产任务产品', materialCode: 'PR-02' },
      { id: 58, inspectionType: 'first_article', materialName: '首件产品', materialCode: 'PR-03' },
    ];
    mockResults(rows);
    const res = responseDouble();

    await getDefectItems({ query: {} }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data).toMatchObject({ list: rows, total: 4, page: 1, pageSize: 10 });
  });
});
