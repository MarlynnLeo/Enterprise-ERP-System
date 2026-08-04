const { pool } = require('../config/db');
const PermissionService = require('./PermissionService');
const NotificationGovernanceConfig = require('./system/NotificationGovernanceConfig');
const { RECIPIENT_TYPES: RECIPIENT_TYPE_VALUES } = require('../constants/notification');

const RECIPIENT_TYPES = new Set(Object.values(RECIPIENT_TYPE_VALUES));

function normalizeIds(values) {
  const list = Array.isArray(values) ? values : values ? [values] : [];
  return [...new Set(list.map(Number).filter((id) => Number.isInteger(id) && id > 0))].sort((a, b) => a - b);
}

function normalizePermissions(values) {
  const list = Array.isArray(values) ? values : values ? [values] : [];
  return [...new Set(list.map((value) => String(value || '').trim()).filter(Boolean))].sort();
}

function validationError(message) {
  const error = new Error(message);
  error.code = 'VALIDATION_ERROR';
  return error;
}

class NotificationRecipientService {
  async getUserIdsByPermissions(permissionCodes, { includeAdmins = false } = {}) {
    const requested = normalizePermissions(permissionCodes);
    const permissions = PermissionService.expandPermissionsWithAliases(requested);
    if (!permissions.length && !includeAdmins) return [];

    const conditions = [];
    const params = [];

    if (permissions.length) {
      const permissionConditions = ['p.code IN (?)', "p.code = '*'"];
      const permissionParams = [permissions];

      const wildcardConditions = permissions.map(
        () => "(RIGHT(p.code, 2) = ':*' AND ? LIKE CONCAT(LEFT(p.code, CHAR_LENGTH(p.code) - 1), '%'))"
      );
      permissionConditions.push(`(${wildcardConditions.join(' OR ')})`);
      permissionParams.push(...permissions);
      conditions.push(`(r.is_super_admin = 0 AND (${permissionConditions.join(' OR ')}))`);
      params.push(...permissionParams);
    }

    if (includeAdmins) {
      conditions.push('r.is_super_admin = 1');
    }

    const [users] = await pool.query(
      `SELECT DISTINCT u.id
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id AND r.status = 1
         LEFT JOIN role_permissions rp ON rp.role_id = r.id
         LEFT JOIN permissions p ON p.id = rp.permission_id AND p.status = 1
        WHERE u.status = 1
          AND (${conditions.join(' OR ')})`,
      params
    );

    return users.map((user) => Number(user.id));
  }

  async getUserIdsByRoles(roleIds) {
    const ids = normalizeIds(roleIds);
    if (!ids.length) return [];
    const [users] = await pool.query(
      `SELECT DISTINCT ur.user_id AS id
         FROM user_roles ur
         JOIN users u ON u.id = ur.user_id AND u.status = 1
         JOIN roles r ON r.id = ur.role_id AND r.status = 1
        WHERE ur.role_id IN (?)`,
      [ids]
    );
    return users.map((user) => Number(user.id));
  }

  async getUserIdsByDepartments(departmentIds) {
    const ids = normalizeIds(departmentIds);
    if (!ids.length) return [];
    const [users] = await pool.query(
      `SELECT DISTINCT u.id
         FROM users u
         JOIN departments d ON d.id = u.department_id AND d.status = 1
        WHERE u.department_id IN (?) AND u.status = 1`,
      [ids]
    );
    return users.map((user) => Number(user.id));
  }

  async filterActiveUserIds(userIds) {
    const ids = normalizeIds(userIds);
    if (!ids.length) return [];
    const [users] = await pool.query(
      'SELECT id FROM users WHERE id IN (?) AND status = 1',
      [ids]
    );
    return users.map((user) => Number(user.id));
  }

  async resolveRecipients(recipientType, recipientConfig, options = {}) {
    if (!RECIPIENT_TYPES.has(recipientType)) return [];

    switch (recipientType) {
      case RECIPIENT_TYPE_VALUES.PERMISSION:
        return this.getUserIdsByPermissions(recipientConfig, {
          includeAdmins: options.includeAdmins === true,
        });
      case RECIPIENT_TYPE_VALUES.ROLE:
        return this.getUserIdsByRoles(recipientConfig);
      case RECIPIENT_TYPE_VALUES.DEPARTMENT:
        return this.getUserIdsByDepartments(recipientConfig);
      case RECIPIENT_TYPE_VALUES.USER:
        return this.filterActiveUserIds(recipientConfig);
      default:
        return [];
    }
  }

  async getRecipientDetails(userIds) {
    const ids = normalizeIds(userIds);
    if (!ids.length) return [];
    const [users] = await pool.query(
      `SELECT u.id, u.username, u.real_name, u.department_id,
              d.name AS department_name
         FROM users u
         LEFT JOIN departments d ON d.id = u.department_id
        WHERE u.id IN (?) AND u.status = 1
        ORDER BY d.name, u.real_name, u.username`,
      [ids]
    );
    return users.map((user) => ({ ...user, id: Number(user.id) }));
  }

  async preview(recipientType, recipientConfig, options = {}) {
    const recipientIds = await this.resolveRecipients(recipientType, recipientConfig, options);
    const recipients = await this.getRecipientDetails(recipientIds);
    const [[activeUsers]] = await pool.query('SELECT COUNT(*) AS total FROM users WHERE status = 1');
    const totalActiveUsers = Number(activeUsers.total || 0);
    const ratio = totalActiveUsers ? recipients.length / totalActiveUsers : 0;
    const governance = await NotificationGovernanceConfig.get();
    const threshold = governance.broadcastBlockRatio;
    const warnings = [];

    if (!recipients.length) {
      warnings.push('当前配置没有匹配到启用用户');
    }
    if (totalActiveUsers >= governance.minimumPopulation && ratio >= governance.broadcastWarningRatio) {
      warnings.push(`接收人数占启用用户的 ${Math.round(ratio * 100)}%，请确认发送范围`);
    }

    return {
      count: recipients.length,
      totalActiveUsers,
      ratio,
      isBroadcast: totalActiveUsers > 0 && recipients.length === totalActiveUsers,
      exceedsBroadcastThreshold: totalActiveUsers >= governance.minimumPopulation && ratio >= threshold,
      recipients,
      warnings,
    };
  }

  async validateConfig(recipientType, recipientConfig) {
    if (!RECIPIENT_TYPES.has(recipientType)) {
      throw validationError('不支持的接收人类型');
    }

    const config = recipientType === RECIPIENT_TYPE_VALUES.PERMISSION
      ? normalizePermissions(recipientConfig)
      : normalizeIds(recipientConfig);

    if (!config.length) {
      throw validationError('接收人配置不能为空');
    }
    const governance = await NotificationGovernanceConfig.get();
    if (config.length > governance.maxTargetsPerRule) {
      throw validationError(`单条规则最多配置 ${governance.maxTargetsPerRule} 个接收目标`);
    }

    if (recipientType === RECIPIENT_TYPE_VALUES.PERMISSION) {
      const [rows] = await pool.query('SELECT code FROM permissions WHERE status = 1');
      const activeCodes = new Set(rows.map((row) => row.code));
      const invalid = config.filter((code) =>
        !PermissionService.expandPermissionsWithAliases([code]).some((candidate) => activeCodes.has(candidate))
      );
      if (invalid.length) throw validationError(`无效或已停用的权限码: ${invalid.join(', ')}`);
      return config;
    }

    const tableByType = {
      role: { table: 'roles', status: 'status = 1' },
      department: { table: 'departments', status: 'status = 1' },
      user: { table: 'users', status: 'status = 1' },
    };
    const target = tableByType[recipientType];
    const [rows] = await pool.query(
      `SELECT id FROM ${target.table} WHERE id IN (?) AND ${target.status}`,
      [config]
    );
    const validIds = new Set(rows.map((row) => Number(row.id)));
    const invalid = config.filter((id) => !validIds.has(id));
    if (invalid.length) throw validationError(`接收目标不存在或已停用: ${invalid.join(', ')}`);
    return config;
  }

  async getOptions() {
    const governance = await NotificationGovernanceConfig.get();
    const [permissions, roles, departments, users] = await Promise.all([
      pool.query(
        `SELECT id, code, name, module
           FROM permissions
          WHERE status = 1
          ORDER BY module, code
          LIMIT ${governance.optionLimit}`
      ),
      pool.query(
        `SELECT r.id, r.code, r.name, COUNT(DISTINCT u.id) AS active_user_count
           FROM roles r
           LEFT JOIN user_roles ur ON ur.role_id = r.id
           LEFT JOIN users u ON u.id = ur.user_id AND u.status = 1
          WHERE r.status = 1
          GROUP BY r.id, r.code, r.name
          ORDER BY r.name`
      ),
      pool.query(
        `SELECT d.id, d.code, d.name, COUNT(DISTINCT u.id) AS active_user_count
           FROM departments d
           LEFT JOIN users u ON u.department_id = d.id AND u.status = 1
          WHERE d.status = 1
          GROUP BY d.id, d.code, d.name
          ORDER BY d.name`
      ),
      pool.query(
        `SELECT u.id, u.username, u.real_name, u.department_id,
                d.name AS department_name
           FROM users u
           LEFT JOIN departments d ON d.id = u.department_id
          WHERE u.status = 1
          ORDER BY d.name, u.real_name, u.username
           LIMIT ${governance.optionLimit}`
      ),
    ]);

    return {
      permissions: permissions[0],
      roles: roles[0].map((row) => ({ ...row, id: Number(row.id), active_user_count: Number(row.active_user_count) })),
      departments: departments[0].map((row) => ({ ...row, id: Number(row.id), active_user_count: Number(row.active_user_count) })),
      users: users[0].map((row) => ({ ...row, id: Number(row.id) })),
    };
  }
}

module.exports = new NotificationRecipientService();
module.exports.RECIPIENT_TYPES = RECIPIENT_TYPES;
module.exports.normalizeIds = normalizeIds;
module.exports.normalizePermissions = normalizePermissions;
