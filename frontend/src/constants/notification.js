export const NOTIFICATION_PERMISSIONS = Object.freeze({
  VIEW: 'system:notification-rules:view',
  CREATE: 'system:notification-rules:create',
  UPDATE: 'system:notification-rules:update',
  DELETE: 'system:notification-rules:delete',
  TOGGLE: 'system:notification-rules:toggle',
  TEST: 'system:notification-rules:test',
  TECH_COMM_BROADCAST: 'system:tech-comm:broadcast',
})

export const RECIPIENT_TYPES = Object.freeze({
  PERMISSION: 'permission',
  ROLE: 'role',
  DEPARTMENT: 'department',
  USER: 'user',
})

export const RECIPIENT_TYPE_OPTIONS = Object.freeze([
  { value: RECIPIENT_TYPES.PERMISSION, label: '按权限' },
  { value: RECIPIENT_TYPES.ROLE, label: '按角色' },
  { value: RECIPIENT_TYPES.DEPARTMENT, label: '按部门' },
  { value: RECIPIENT_TYPES.USER, label: '指定用户' },
])
