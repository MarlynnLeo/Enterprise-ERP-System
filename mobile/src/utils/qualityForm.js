import { getMeasurementState } from './inspectionItemPayload'
import { isNumericInspectionItem, evaluateInspectionMeasurements } from './inspectionMeasurement'
export function normalizeQualityItems(items) {
  return items.map(item => ({ ...item, ...getMeasurementState(item),
    itemName: item.itemName || '', method: item.method || item.inspectionMethod || '',
    actualValue: item.actualValue ?? item.measure1 ?? '', result: item.result || '' }))
}
export function validateQualityItems(items) {
  if (!items.length) return '当前检验单没有检验项目，不能提交'
  const unjudged = items.filter(item => !['passed','failed'].includes(item.result))
  if (unjudged.length) return `还有 ${unjudged.length} 项未判定`
  for (const item of items) {
    if (!isNumericInspectionItem(item)) continue
    const evidence = evaluateInspectionMeasurements(item, [item.actualValue, ...[2,3,4,5,6].map(n => item[`measure${n}`]), ...(item.measurements || []).filter(m => Number(m.sampleNo) > 6).map(m => m.measuredValue)])
    if (!evidence.values.length || evidence.values.some(value => value === null)) return `${item.itemName}：请填写有效实测值`
    if (evidence.result === 'failed' && item.result === 'passed') return `${item.itemName}：实测值超出标准，不能判为合格`
  }
  return ''
}

export function samplingPayload(inspection) {
  const full = !!inspection.isFullInspection
  return { isFullInspection: full, isAql: !full,
    sampleQuantity: full ? Number(inspection.quantity) : Number(inspection.sampleQuantity) || null,
    aqlStandardId: full ? null : inspection.aqlStandardId,
    aqlLevel: full ? null : inspection.aqlLevel,
    acceptLimit: full ? null : inspection.acceptLimit,
    rejectLimit: full ? null : inspection.rejectLimit }
}
export function validateSampling(inspection) {
  if (!inspection.isFullInspection && (!inspection.aqlStandardId || !(Number(inspection.sampleQuantity) > 0))) return '请确认全数检验或选择有效的 AQL 抽样标准'
  return ''
}

export function inspectionBasisLabel(inspection) {
  const mode = inspection.isFullInspection ? '全数检验' : inspection.isAql ? `AQL ${inspection.aqlLevel ?? '抽样'}` : '未配置检验方式'
  const basis = inspection.templateName || inspection.aqlStandardName || inspection.standard || inspection.standardNo
  return basis ? `${mode} · ${basis}` : mode
}
export function inspectionSampleCount(inspection) {
  if (inspection.isFullInspection && Number(inspection.quantity) > 0) return Number(inspection.quantity)
  return inspection.sampleQuantity ?? '未记录'
}
