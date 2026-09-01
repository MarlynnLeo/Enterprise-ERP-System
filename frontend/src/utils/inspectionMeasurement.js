export const QUALITATIVE_MEASUREMENT_OPTIONS = [
  { label: '√', value: '√' },
  { label: '×', value: '×' }
]

export function isDimensionInspectionItem(item = {}) {
  return String(item.type || item.itemType || item.item_type || '').trim().toLowerCase() === 'dimension'
}

export function normalizeQualitativeMeasurementValue(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return ''
  const numericValue = Number(normalized)
  if (Number.isFinite(numericValue) && numericValue === 1) return '√'
  if (Number.isFinite(numericValue) && numericValue === 0) return '×'
  if (['√', 'ok', 'pass', 'passed', 'yes', 'true', '1', '合格'].includes(normalized)) return '√'
  if (['×', 'x', 'ng', 'fail', 'failed', 'no', 'false', '0', '不合格'].includes(normalized)) return '×'
  return String(value).trim()
}

export function formatInspectionMeasurement(item, value, emptyText = '{无}') {
  if (value === null || value === undefined || value === '') return emptyText
  return isDimensionInspectionItem(item) ? value : normalizeQualitativeMeasurementValue(value)
}

export function summarizeQualitativeMeasurements(values = []) {
  const normalizedValues = values
    .map(normalizeQualitativeMeasurementValue)
    .filter(Boolean)
  const passed = normalizedValues.filter((value) => value === '√').length
  const failed = normalizedValues.filter((value) => value === '×').length

  return {
    passed,
    failed,
    total: normalizedValues.length,
    text: normalizedValues.length === 0 ? '' : `√${passed} / ×${failed}`,
    result: failed > 0 ? 'failed' : normalizedValues.length > 0 ? 'passed' : ''
  }
}
