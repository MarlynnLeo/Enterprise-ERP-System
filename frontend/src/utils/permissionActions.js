/** 与后端 PermissionRegistry.ACTION_SEGMENTS 对齐：动作码必须精确匹配，不能用父级顶替 */
export const ACTION_SEGMENTS = new Set([
  'view',
  'create',
  'update',
  'delete',
  'edit',
  'export',
  'import',
  'print',
  'approve',
  'pay',
  'void',
  'confirm',
  'read',
  'write',
  'cancel',
  'close',
  'pushdown',
  'submit',
])

export function isActionPermission(code) {
  const parts = String(code || '').split(':').filter(Boolean)
  return parts.length >= 2 && ACTION_SEGMENTS.has(parts[parts.length - 1])
}
