/**
 * 物料销售价/采购价可见性 SSOT
 * 仅财务、采购、销售权限组可见，其余岗位显示 ***
 */
export const MASKED_PRICE = '***'

export const MATERIAL_PRICE_VIEW_PERMISSIONS = [
  'finance:price:view',
  'finance:pricing:view',
  'finance:cost:view',
  'purchase:price:view',
  'sales:price:view',
  'basedata:materials:view_price',
  'basedata:materials:view_cost',
]

export const MATERIAL_PRICE_UPDATE_PERMISSIONS = [
  'finance:price:update',
  'finance:pricing:update',
  'finance:cost:update',
  'purchase:price:update',
  'sales:price:update',
]

export function canViewMaterialPrices(hasPermission) {
  return MATERIAL_PRICE_VIEW_PERMISSIONS.some((code) => hasPermission(code))
}

export function canMaintainMaterialPrices(hasPermission) {
  return MATERIAL_PRICE_UPDATE_PERMISSIONS.some((code) => hasPermission(code))
}

export function formatMaskedPrice(value, canView, formatCurrency) {
  if (!canView || value === MASKED_PRICE) return MASKED_PRICE
  if (value === undefined || value === null || value === '') return '-'
  return formatCurrency(value)
}
