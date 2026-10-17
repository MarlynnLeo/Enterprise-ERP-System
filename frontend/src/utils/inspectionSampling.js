// Reports describe the recorded inspection; the configured AQL service owns sampling calculations.
export const getInspectionSampleQuantity = (inspection) => {
  const saved = inspection?.sampleQuantity
  if (saved !== null && saved !== undefined && saved !== '') {
    const quantity = Number(saved)
    return Number.isFinite(quantity) && quantity > 0 ? quantity : null
  }
  if (inspection?.isFullInspection === true || inspection?.isFullInspection === 1) {
    const quantity = Number(inspection.quantity)
    if (Number.isFinite(quantity) && quantity > 0) return quantity
  }
  return null
}

export const getInspectionSamplingPlan = (inspection) => {
  if (!inspection) return '未记录'
  if (inspection.isFullInspection === true || inspection.isFullInspection === 1) return '全检'
  if (inspection.isAql === true || inspection.isAql === 1) {
    if (!inspection.aqlStandardId) return 'AQL 抽样（尚未匹配标准）'
    const limits = inspection.acceptLimit != null && inspection.rejectLimit != null
      ? `，Ac=${inspection.acceptLimit}，Re=${inspection.rejectLimit}`
      : ''
    // Standard names may be edited later; only the recorded plan is historical evidence.
    return `${inspection.samplingPlan || `AQL ${inspection.aqlLevel ?? '未记录'}`}${limits}`
  }
  if (inspection.samplingPlan || inspection.aqlPlan) return inspection.samplingPlan || inspection.aqlPlan
  const templatePlan = String(inspection.templateDescription || '')
    .match(/抽样方案\s*[:：]\s*([^|]+)/)?.[1]?.trim()
  return templatePlan ? `模板要求：${templatePlan}（本单未启用 AQL）` : '未记录'
}


const enabled = value => value === true || value === 1 || value === '1'
export function inspectionSamplingFields(inspection = {}) {
  return {
    isFullInspection: enabled(inspection.isFullInspection), isAql: enabled(inspection.isAql),
    aqlStandardId: inspection.aqlStandardId ?? null, aqlStandardName: inspection.aqlStandardName || inspection.samplingPlan || '',
    sampleQuantity: inspection.sampleQuantity ?? null, aqlLevel: inspection.aqlLevel ?? null,
    acceptLimit: inspection.acceptLimit ?? null, rejectLimit: inspection.rejectLimit ?? null
  }
}
export function validateInspectionSampling(sampling, quantity) {
  if (!(Number(quantity) > 0)) return '检验数量必须大于0'
  if (sampling.isFullInspection && sampling.isAql) return '全检与AQL抽检不能同时启用'
  if (sampling.isFullInspection) return ''
  if (!sampling.isAql || !sampling.aqlStandardId || !(Number(sampling.sampleQuantity) > 0) || Number(sampling.sampleQuantity) > Number(quantity) || !(Number(sampling.aqlLevel) > 0) || sampling.acceptLimit == null || sampling.rejectLimit == null) return '请选择全检或有效的AQL抽样标准后再提交'
  return ''
}
export function inspectionSamplingPayload(sampling, quantity) {
  const full = !!sampling.isFullInspection
  return { isFullInspection: full, isAql: !full,
    aqlStandardId: full ? null : sampling.aqlStandardId,
    aqlLevel: full ? null : sampling.aqlLevel,
    sampleQuantity: full ? Number(quantity) : Number(sampling.sampleQuantity),
    acceptLimit: full ? null : sampling.acceptLimit, rejectLimit: full ? null : sampling.rejectLimit }
}
