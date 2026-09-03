const firstValue = (...values) => values.find((value) => value !== undefined && value !== null)

export function normalizeImportedInspectionItem(item = {}) {
  const itemName = String(firstValue(item.itemName, item.item_name, '')).trim()
  const method = String(
    firstValue(item.method, item.inspectionMethod, item.inspection_method, '')
  ).trim()
  const dimensionValue = firstValue(item.dimensionValue, item.dimension_value, null)
  const toleranceUpper = firstValue(item.toleranceUpper, item.tolerance_upper, null)
  const toleranceLower = firstValue(item.toleranceLower, item.tolerance_lower, null)
  const isCritical = item.isCritical === true || item.is_critical === true

  return {
    ...item,
    itemName,
    item_name: itemName,
    standard: String(item.standard || '').trim(),
    method,
    inspectionMethod: method,
    inspection_method: method,
    type: item.type || 'other',
    isCritical,
    is_critical: isCritical,
    dimensionValue,
    dimension_value: dimensionValue,
    toleranceUpper,
    tolerance_upper: toleranceUpper,
    toleranceLower,
    tolerance_lower: toleranceLower,
  }
}

export function normalizeParsedInspectionTemplate(data = {}) {
  const items = Array.isArray(data.items) ? data.items : []

  return {
    ...data,
    templateCode: String(firstValue(data.templateCode, data.template_code, '')).trim(),
    materialTypes: firstValue(data.materialTypes, data.material_types, []),
    items: items.map(normalizeImportedInspectionItem),
  }
}
