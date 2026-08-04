const RECIPIENT_TYPES = Object.freeze({
  PERMISSION: 'permission',
  ROLE: 'role',
  DEPARTMENT: 'department',
  USER: 'user',
});

const NOTIFICATION_SETTING_KEYS = Object.freeze({
  GOVERNANCE: 'notification.governance',
  RESPONSIBILITIES: 'notification.responsibilities',
});

const NOTIFICATION_PERMISSIONS = Object.freeze({
  VIEW: 'system:notification-rules:view',
  CREATE: 'system:notification-rules:create',
  UPDATE: 'system:notification-rules:update',
  DELETE: 'system:notification-rules:delete',
  TOGGLE: 'system:notification-rules:toggle',
  TEST: 'system:notification-rules:test',
  TECH_COMM_WILDCARD: 'system:tech-comm:*',
  TECH_COMM_MANAGE: 'system:tech-comm:manage',
  TECH_COMM_BROADCAST: 'system:tech-comm:broadcast',
});

const RESPONSIBILITY_CODES = Object.freeze({
  FINANCE: 'finance',
});

module.exports = {
  RECIPIENT_TYPES,
  NOTIFICATION_SETTING_KEYS,
  NOTIFICATION_PERMISSIONS,
  RESPONSIBILITY_CODES,
};
