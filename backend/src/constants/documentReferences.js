/**
 * 业务单据引用与质检→入库策略 SSOT
 * 禁止在控制器/模型中散落 'production' / 'production_task' 字符串映射
 */

const INBOUND_TYPE_KEYS = Object.freeze({
  PURCHASE: 'purchase',
  PRODUCTION: 'production',
  PRODUCTION_RETURN: 'production_return',
  DEFECTIVE_RETURN: 'defective_return',
  OUTSOURCED: 'outsourced',
  SALES_RETURN: 'sales_return',
  OTHER: 'other',
});

const DOCUMENT_REFERENCE_TYPES = Object.freeze({
  PRODUCTION_TASK: 'production_task',
  PRODUCTION_PLAN: 'production_plan',
  BATCH_PRODUCTION_TASKS: 'batch_production_tasks',
  PURCHASE_ORDER: 'purchase_order',
  SALES_ORDER: 'sales_order',
});

const QUALITY_INSPECTION_TYPES = Object.freeze({
  INCOMING: 'incoming',
  PROCESS: 'process',
  FINAL: 'final',
  FIRST_ARTICLE: 'first_article',
});

const PURCHASE_REQUISITION_SOURCE_TYPES = Object.freeze({
  PRODUCTION_PLAN: 'production_plan',
  SALES_ORDER: 'sales_order',
});

/**
 * 质检类型 → 入库单据元数据
 * resolveReferenceId: 从检验单解析业务单据 ID
 */
const INSPECTION_INBOUND_POLICY = Object.freeze({
  [QUALITY_INSPECTION_TYPES.FINAL]: Object.freeze({
    inboundType: INBOUND_TYPE_KEYS.PRODUCTION,
    referenceType: DOCUMENT_REFERENCE_TYPES.PRODUCTION_TASK,
    resolveReferenceId: (inspection) =>
      inspection?.reference_id || inspection?.task_id || null,
  }),
  [QUALITY_INSPECTION_TYPES.INCOMING]: Object.freeze({
    inboundType: INBOUND_TYPE_KEYS.PURCHASE,
    referenceType: DOCUMENT_REFERENCE_TYPES.PURCHASE_ORDER,
    resolveReferenceId: (inspection) => inspection?.reference_id || null,
  }),
});

/**
 * @param {object} inspection
 * @returns {{ inboundType: string, referenceType: string|null, referenceId: number|null }}
 */
function resolveInboundFromInspection(inspection) {
  if (!inspection || !inspection.inspection_type) {
    return {
      inboundType: INBOUND_TYPE_KEYS.OTHER,
      referenceType: null,
      referenceId: null,
    };
  }

  const policy = INSPECTION_INBOUND_POLICY[inspection.inspection_type];
  if (!policy) {
    return {
      inboundType: INBOUND_TYPE_KEYS.OTHER,
      referenceType: null,
      referenceId: null,
    };
  }

  const referenceId = policy.resolveReferenceId(inspection);
  return {
    inboundType: policy.inboundType,
    referenceType: referenceId ? policy.referenceType : null,
    referenceId: referenceId ? Number(referenceId) : null,
  };
}

module.exports = {
  INBOUND_TYPE_KEYS,
  DOCUMENT_REFERENCE_TYPES,
  QUALITY_INSPECTION_TYPES,
  PURCHASE_REQUISITION_SOURCE_TYPES,
  INSPECTION_INBOUND_POLICY,
  resolveInboundFromInspection,
};
