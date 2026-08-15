export const MATERIAL_TYPE_OPTIONS = [
  { value: 'finished_goods', label: '产成品' },
  { value: 'semi_finished', label: '半成品' },
  { value: 'raw_material', label: '原材料' },
  { value: 'packaging', label: '包装物' },
  { value: 'component', label: '零部件' }
]

const MATERIAL_TYPE_ALIASES = {
  finished_product: 'finished_goods',
  finished: 'finished_goods',
  product: 'finished_goods',
  semi: 'semi_finished',
  raw: 'raw_material',
  package: 'packaging',
  packing: 'packaging',
  part: 'component',
  parts: 'component',
  auxiliary: 'component'
}

export function normalizeMaterialType(type) {
  if (type === null || type === undefined || type === '') return ''
  const raw = String(type).trim()
  if (!raw) return ''
  if (MATERIAL_TYPE_OPTIONS.some((item) => item.value === raw)) return raw
  return MATERIAL_TYPE_ALIASES[raw] || raw
}

export function getMaterialTypeLabel(type) {
  const normalized = normalizeMaterialType(type)
  const matched = MATERIAL_TYPE_OPTIONS.find((item) => item.value === normalized)
  if (matched) return matched.label
  return normalized || '—'
}
