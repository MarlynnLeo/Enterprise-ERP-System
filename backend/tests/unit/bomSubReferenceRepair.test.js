/* global describe, expect, test */
const { planRepair, summarize } = require('../../scripts/repair-bom-sub-references');

const master = (id, productId, overrides = {}) => ({
  id, product_id: productId, status: 1, remark: 'NG0001导入BOM',
  approved_by: 1, approved_at: '2026-01-01 00:00:00', deleted_at: null, ...overrides,
});
const detail = (id, bomId, materialId, overrides = {}) => ({
  id, bom_id: bomId, material_id: materialId, parent_id: 0,
  has_sub_bom: 0, ref_bom_id: null, ...overrides,
});

describe('A3 BOM reference repair', () => {
  test('fills nested missing references using the latest approved version and is idempotent', () => {
    const masters = [master(1, 101), master(2, 102), master(3, 103),
      master(4, 102, { approved_at: '2026-02-01 00:00:00' }),
      master(5, 102, { approved_by: null, approved_at: null }),
      master(6, 102, { deleted_at: '2026-03-01 00:00:00', approved_at: '2026-03-01 00:00:00' })];
    const details = [detail(11, 1, 102), detail(21, 2, 999), detail(31, 3, 998),
      detail(41, 4, 103), detail(51, 5, 997), detail(61, 6, 996)];
    const before = JSON.stringify({ masters, details });

    const plan = planRepair(masters, details);

    expect(plan.repairs).toEqual([{ id: 11, bomId: 1, refBomId: 4 }, { id: 41, bomId: 4, refBomId: 3 }]);
    expect(summarize(plan)).toMatchObject({ repairRows: 2, affectedBoms: 2, skippedRows: 0 });
    expect(JSON.stringify({ masters, details })).toBe(before);
    const refs = new Map(plan.repairs.map(repair => [repair.id, repair.refBomId]));
    const repairedDetails = details.map(row => refs.has(row.id)
      ? { ...row, has_sub_bom: 1, ref_bom_id: refs.get(row.id) } : row);
    expect(planRepair(masters, repairedDetails).repairs).toEqual([]);
  });

  test('preserves explicit references and excludes non-imported, historical and deleted parents', () => {
    const masters = [master(1, 101), master(2, 102), master(3, 103, { remark: '手工维护' }),
      master(4, 104, { status: 2 }), master(5, 105, { deleted_at: '2026-01-02' })];
    const details = [detail(11, 1, 102, { has_sub_bom: 1, ref_bom_id: 2 }),
      detail(12, 1, 102, { has_sub_bom: 0, ref_bom_id: 2 }), detail(21, 2, 999),
      detail(31, 3, 102), detail(41, 4, 102), detail(51, 5, 102)];

    expect(planRepair(masters, details).repairs).toEqual([]);
  });

  test('does not add a second copy beneath an inline assembly or reference an empty BOM', () => {
    const masters = [master(1, 101), master(2, 102), master(3, 103)];
    const details = [detail(11, 1, 102), detail(12, 1, 999, { parent_id: 11 }),
      detail(13, 1, 103), detail(21, 2, 998)];

    const plan = planRepair(masters, details);

    expect(plan.repairs).toEqual([]);
    expect(plan.skipped.map(row => row.reason)).toEqual(['inline_children', 'empty_child_bom']);
  });

  test('rejects self references and cycles formed collectively by new links', () => {
    const masters = [master(1, 101), master(2, 102), master(3, 103), master(4, 104)];
    const details = [detail(11, 1, 102), detail(21, 2, 101), detail(31, 3, 103),
      detail(41, 4, 999)];

    const plan = planRepair(masters, details);

    expect(plan.repairs).toEqual([]);
    expect(plan.skipped).toHaveLength(3);
    expect(plan.skipped.every(row => row.reason === 'circular_reference')).toBe(true);
  });

  test('rejects cycles through existing references and invalidates caches of all ancestors', () => {
    const masters = [master(1, 101), master(2, 102), master(3, 103), master(4, 104)];
    const details = [detail(11, 1, 102, { has_sub_bom: 1, ref_bom_id: 2 }),
      detail(21, 2, 103), detail(31, 3, 999),
      detail(41, 4, 101, { has_sub_bom: 1, ref_bom_id: 1 })];

    const plan = planRepair(masters, details);

    expect(plan.repairs).toEqual([{ id: 21, bomId: 2, refBomId: 3 }]);
    expect(plan.cacheBomIds).toEqual([1, 2, 4]);
    const cyclicPlan = planRepair(masters, [...details, detail(32, 3, 104)]);
    expect(cyclicPlan.repairs).toEqual([]);
    expect(cyclicPlan.skipped).toHaveLength(2);
  });
});
