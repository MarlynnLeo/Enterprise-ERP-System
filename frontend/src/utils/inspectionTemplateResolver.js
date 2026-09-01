export const isGeneralInspectionTemplate = (template) => (
  template?.is_general === true ||
  template?.is_general === 1 ||
  template?.is_general === '1' ||
  template?.is_general === 'true'
)

export const getTemplateItems = (template) => {
  if (!template) return []
  if (Array.isArray(template.items)) return template.items
  if (Array.isArray(template.InspectionItems)) return template.InspectionItems
  return []
}

const getTemplateId = (template) => Number(template?.id) || 0
const getTemplatePriority = (template) => {
  const priority = Number(template?.priority)
  return Number.isFinite(priority) && priority > 0 ? priority : 100
}
const isDefaultInspectionTemplate = (template) => (
  template?.isDefault === true ||
  template?.isDefault === 1 ||
  template?.isDefault === '1' ||
  template?.isDefault === 'true'
)

export const compareInspectionTemplates = (left, right) => {
  const defaultDiff = Number(isDefaultInspectionTemplate(right)) - Number(isDefaultInspectionTemplate(left))
  if (defaultDiff !== 0) return defaultDiff

  const priorityDiff = getTemplatePriority(left) - getTemplatePriority(right)
  if (priorityDiff !== 0) return priorityDiff

  return getTemplateId(right) - getTemplateId(left)
}

export const resolveEffectiveInspectionTemplates = (templates = []) => {
  const activeTemplates = templates
    .filter(Boolean)
    .filter((template) => getTemplateItems(template).length > 0)
  const specificTemplates = activeTemplates
    .filter((template) => !isGeneralInspectionTemplate(template))
    .sort(compareInspectionTemplates)
  const generalTemplates = activeTemplates
    .filter(isGeneralInspectionTemplate)
    .sort(compareInspectionTemplates)

  return specificTemplates.length > 0 ? specificTemplates : generalTemplates
}

export const getDefaultInspectionTemplate = (templates = []) => (
  resolveEffectiveInspectionTemplates(templates)[0] || null
)

export const mapTemplateItemsToInspectionItems = (items = []) => items.map((item) => ({
  id: item.id,
  item_name: item.item_name || item.itemName || '',
  standard: item.standard || '',
  method: item.method || item.inspection_method || item.inspectionMethod || '',
  type: item.type || item.typeName || 'other',
  is_critical: item.is_critical === true || item.is_critical === 1 || item.isCritical === true || item.isCritical === 1,
  dimension_value: item.dimension_value ?? item.dimensionValue ?? null,
  tolerance_upper: item.tolerance_upper ?? item.toleranceUpper ?? null,
  tolerance_lower: item.tolerance_lower ?? item.toleranceLower ?? null,
  actual_value: '',
  result: '',
  remarks: ''
}))

export const getTemplateSourceText = (template) => {
  if (!template) return ''
  return `${isGeneralInspectionTemplate(template) ? '通用模板' : '产品专用模板'}：${template.templateName || ''}`
}
