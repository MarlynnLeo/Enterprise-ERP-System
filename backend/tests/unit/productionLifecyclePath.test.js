/**
 * 生产生命周期路径 / 质检入库引用 — 纯逻辑单测（不依赖源码字符串、不依赖脏数据扫表）
 */

const {
  TASK_STATE_MACHINE,
  AUTO_PROGRESSION_GRAPH,
  findTransitionPath,
  validateTaskTransition,
} = require('../../src/services/business/TaskLifecycleService');
const {
  resolveInboundFromInspection,
  INBOUND_TYPE_KEYS,
  DOCUMENT_REFERENCE_TYPES,
  QUALITY_INSPECTION_TYPES,
  PURCHASE_REQUISITION_SOURCE_TYPES,
} = require('../../src/constants/documentReferences');

describe('AUTO_PROGRESSION_GRAPH 与状态机一致', () => {
  test('子图每条边都在 TASK_STATE_MACHINE 中合法', () => {
    for (const [from, nexts] of Object.entries(AUTO_PROGRESSION_GRAPH)) {
      expect(TASK_STATE_MACHINE[from]).toBeTruthy();
      for (const to of nexts) {
        expect(TASK_STATE_MACHINE[from]).toContain(to);
        expect(validateTaskTransition(from, to).valid).toBe(true);
      }
    }
  });

  test('不包含发料前状态（禁止跳过库存发料）', () => {
    expect(AUTO_PROGRESSION_GRAPH.pending).toBeUndefined();
    expect(AUTO_PROGRESSION_GRAPH.preparing).toBeUndefined();
    expect(AUTO_PROGRESSION_GRAPH.material_issuing).toBeUndefined();
  });
});

describe('findTransitionPath', () => {
  test('同状态返回空路径', () => {
    expect(findTransitionPath('inspection', 'inspection')).toEqual([]);
  });

  test('in_progress → warehousing 经 inspection', () => {
    expect(findTransitionPath('in_progress', 'warehousing')).toEqual([
      'inspection',
      'warehousing',
    ]);
  });

  test('material_issued → inspection 经 in_progress', () => {
    expect(findTransitionPath('material_issued', 'inspection')).toEqual([
      'in_progress',
      'inspection',
    ]);
  });

  test('pending 无法自动到达 inspection（须先发料）', () => {
    expect(findTransitionPath('pending', 'inspection')).toBeNull();
    expect(findTransitionPath('pending', 'warehousing')).toBeNull();
  });

  test('in_progress 不能一步到 warehousing', () => {
    expect(validateTaskTransition('in_progress', 'warehousing').valid).toBe(false);
  });
});

describe('resolveInboundFromInspection SSOT', () => {
  test('终检解析为生产入库 + 任务引用', () => {
    const meta = resolveInboundFromInspection({
      inspection_type: QUALITY_INSPECTION_TYPES.FINAL,
      reference_id: 42,
      task_id: 99,
    });
    expect(meta).toEqual({
      inboundType: INBOUND_TYPE_KEYS.PRODUCTION,
      referenceType: DOCUMENT_REFERENCE_TYPES.PRODUCTION_TASK,
      referenceId: 42,
    });
  });

  test('终检无 reference_id 时回退 task_id', () => {
    const meta = resolveInboundFromInspection({
      inspection_type: QUALITY_INSPECTION_TYPES.FINAL,
      reference_id: null,
      task_id: 77,
    });
    expect(meta.inboundType).toBe(INBOUND_TYPE_KEYS.PRODUCTION);
    expect(meta.referenceId).toBe(77);
  });

  test('来料检验解析为采购入库', () => {
    const meta = resolveInboundFromInspection({
      inspection_type: QUALITY_INSPECTION_TYPES.INCOMING,
      reference_id: 15,
    });
    expect(meta).toEqual({
      inboundType: INBOUND_TYPE_KEYS.PURCHASE,
      referenceType: DOCUMENT_REFERENCE_TYPES.PURCHASE_ORDER,
      referenceId: 15,
    });
  });

  test('未知类型为 other', () => {
    const meta = resolveInboundFromInspection({ inspection_type: 'unknown' });
    expect(meta.inboundType).toBe(INBOUND_TYPE_KEYS.OTHER);
    expect(meta.referenceType).toBeNull();
  });

  test('采购申请来源常量稳定', () => {
    expect(PURCHASE_REQUISITION_SOURCE_TYPES.PRODUCTION_PLAN).toBe('production_plan');
  });
});
