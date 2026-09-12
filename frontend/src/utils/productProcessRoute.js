export const PRODUCT_PROCESS_ROUTE_PATH = '/basedata/process-templates'
export const LEGACY_PROCESS_ROUTE_PATH = '/production/process-routes'

const arrayValue = (value) => {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const formatStandardHours = (value) => {
  const hours = Number(value)
  return Number.isFinite(hours) ? Number(hours.toFixed(6)).toString() : '0'
}

export const totalStandardHours = (details = []) => details.reduce(
  (total, detail) => total + (Number(detail.standardHours) || 0), 0
)

export const routeStatusLabel = (route) => Number(route.status) === 1
  ? '启用'
  : route.publishedAt ? '停用' : '草稿'

export const routeOptionLabel = (route) => `${route.name || '产品工艺'} · ${route.version || '历史版本'}${Number(route.status) === 1 ? '' : '（已停用）'}`

export const newProcessDetail = (orderNum = 1) => ({
  orderNum, stepCode: '', name: '', standardHours: 0, department: '', stationId: null,
  description: '', remark: '', instructionDocs: [], sopContent: '', sopImages: [], materials: []
})

export const normalizeProcessDetail = (detail, index = 0) => ({
  ...newProcessDetail(index + 1),
  ...detail,
  standardHours: Number(detail.standardHours) || 0,
  instructionDocs: arrayValue(detail.instructionDocs).map(doc => ({ ...doc })),
  sopImages: [...arrayValue(detail.sopImages)],
  materials: arrayValue(detail.materials).map(material => ({
    ...material,
    quantity: Number(material.quantity) || 0,
    isScanRequired: Boolean(Number(material.isScanRequired))
  }))
})

export const createRouteDraft = (source = null, copyVersion = false) => ({
  id: copyVersion ? null : source?.id || null,
  name: source?.name || '',
  productId: source?.productId || '',
  version: copyVersion ? '' : source?.version || 'V1.0',
  description: source?.description || '',
  sourceTemplateId: copyVersion ? source.id : source?.sourceTemplateId || null,
  status: 0,
  details: source
    ? (source.details || []).map((detail, index) => {
      const normalized = normalizeProcessDetail(detail, index)
      return copyVersion ? { ...normalized, id: undefined } : normalized
    })
    : [newProcessDetail()]
})

export const buildRoutePayload = (draft) => ({
  name: String(draft.name || '').trim(),
  productId: draft.productId,
  version: String(draft.version || '').trim(),
  description: draft.description || '',
  status: 0,
  ...(draft.sourceTemplateId ? { sourceTemplateId: draft.sourceTemplateId } : {}),
  details: draft.details.map(detail => ({
    ...(detail.id ? { id: detail.id } : {}),
    orderNum: Number(detail.orderNum),
    stepCode: String(detail.stepCode || '').trim(),
    name: String(detail.name || '').trim(),
    standardHours: Number(Number(detail.standardHours).toFixed(6)),
    department: detail.department || '',
    stationId: detail.stationId || null,
    description: detail.description || '',
    remark: detail.remark || '',
    instructionDocs: arrayValue(detail.instructionDocs),
    sopContent: detail.sopContent || '',
    sopImages: arrayValue(detail.sopImages),
    materials: arrayValue(detail.materials).map(material => ({
      materialId: material.materialId,
      quantity: Number(material.quantity),
      isScanRequired: Boolean(material.isScanRequired)
    }))
  }))
})

export const validateRouteDetails = (details, publishing = false) => {
  if (publishing && (!details.length || totalStandardHours(details) <= 0)) {
    return '启用前请至少配置一道工序，并填写大于 0 的单件总标准工时'
  }
  const orders = new Set()
  const stepCodes = new Set()
  for (const [index, detail] of details.entries()) {
    const label = `第 ${index + 1} 道工序`
    if (!String(detail.name || '').trim()) return `${label}的名称不能为空`
    const order = Number(detail.orderNum)
    if (!Number.isInteger(order) || order < 1 || orders.has(order)) return '工序顺序必须是互不重复的正整数'
    orders.add(order)
    const code = String(detail.stepCode || '').trim().toLowerCase()
    if (code && stepCodes.has(code)) return '工序编号不能重复'
    if (code) stepCodes.add(code)
    if (detail.standardHours === null || detail.standardHours === '' || !Number.isFinite(Number(detail.standardHours)) || Number(detail.standardHours) < 0) {
      return `${label}的标准工时必须是大于或等于 0 的数字`
    }
    const materials = new Set()
    for (const material of detail.materials || []) {
      if (!material.materialId) return `${label}请选择工序物料`
      if (materials.has(String(material.materialId))) return `${label}的物料不能重复`
      materials.add(String(material.materialId))
      if (!Number.isFinite(Number(material.quantity)) || Number(material.quantity) <= 0) return `${label}的单件物料用量必须大于 0`
    }
  }
  return ''
}

export const processSnapshotInstructions = (process) => {
  let snapshot = process?.processSnapshot
  if (typeof snapshot === 'string') {
    try { snapshot = JSON.parse(snapshot) } catch { snapshot = null }
  }
  return {
    instructionDocs: arrayValue(snapshot?.instructionDocs),
    sopContent: snapshot?.sopContent || '',
    sopImages: arrayValue(snapshot?.sopImages)
  }
}

export const hasProductProcessPermission = (authStore, action = '') => {
  const suffix = action ? `:${action}` : ''
  return authStore.hasPermission(`basedata:processtemplates${suffix}`)
    || authStore.hasPermission(`production:routes${suffix}`)
}
