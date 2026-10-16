/* global jest, test, expect */
jest.mock('../../src/config/db', () => ({ pool: {} }));
const readiness = require('../../src/services/business/FinalInspectionReadinessService');
const hold = require('../../src/services/business/ProductionQualityHoldService');
const final = { inspection_type: 'final', task_id: 41, product_id: 3, quantity: 100 };
function fixture({
  reinspectionQuantity = 5,
  linked = true,
  ncpQuantity = 5,
  extraOpen = [],
} = {}) {
  const failed = {
    id: 1,
    inspection_type: 'first_article',
    status: 'failed',
    first_article_result: 'failed',
    quantity: 5,
    unqualified_quantity: 5,
  };
  const passed = {
    id: 2,
    inspection_type: 'first_article',
    status: 'passed',
    first_article_result: 'passed',
    production_can_continue: 1,
    inspector_id: 9,
    actual_date: '2026-10-15',
    quantity: reinspectionQuantity,
    unqualified_quantity: 0,
  };
  return {
    query: jest.fn(async (sql) => {
      if (sql.includes('FROM production_tasks'))
        return [[{ id: 41, status: 'inspection', product_id: 3, completed_quantity: 100 }]];
      if (sql.includes('FROM production_processes')) return [[]];
      if (sql.includes("inspection_type IN ('first_article'")) return [[failed, ...extraOpen]];
      if (sql.includes("inspection_type = 'first_article'"))
        return [
          [failed, passed, ...extraOpen.filter((row) => row.inspection_type === 'first_article')],
        ];
      if (sql.includes('FROM nonconforming_products'))
        return [
          [
            {
              ncp_id: 11,
              source_inspection_id: 1,
              ncp_quantity: ncpQuantity,
              ncp_status: 'completed',
              rework_id: 12,
              rework_status: 'completed',
              rework_quantity: 5,
              reinspection_id: linked ? 2 : null,
            },
          ],
        ];
      throw new Error(sql);
    }),
  };
}
test('reworked first article is released consistently for production and final inspection', async () => {
  const connection = fixture();
  await expect(hold.assertTaskQualityReleased(connection, { id: 41 })).resolves.toBeUndefined();
  await expect(readiness.validate(connection, final)).resolves.toBeUndefined();
  expect(connection.query.mock.calls.every(([sql]) => /^\s*SELECT/.test(sql))).toBe(true);
});
test.each([{ reinspectionQuantity: 4 }, { linked: false }, { ncpQuantity: 4 }])(
  'incomplete rework evidence still blocks final inspection: %j',
  async (options) => {
    await expect(readiness.validate(fixture(options), final)).rejects.toThrow(
      '首检或过程检验尚未关闭'
    );
  }
);
test.each(['process', 'first_article'])(
  'does not release a separate failed %s inspection',
  async (type) => {
    const extra = {
      id: 3,
      inspection_type: type,
      status: 'failed',
      first_article_result: 'failed',
      quantity: 5,
      unqualified_quantity: 5,
    };
    await expect(readiness.validate(fixture({ extraOpen: [extra] }), final)).rejects.toThrow(
      '首检或过程检验尚未关闭'
    );
  }
);
