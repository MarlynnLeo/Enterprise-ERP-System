/**
 * PermissionChangeService — 权限/角色变更审计 SSOT
 *
 * 统一：
 *  - 菜单 ID → permission 码解析
 *  - 差集（added/removed）
 *  - 写入 audit_logs（module=permission）
 *
 * 不阻断主流程：审计失败只记日志。
 */

const { pool } = require('../config/db');
const { logger } = require('../utils/logger');
const { AuditService, AuditAction, AuditModule } = require('./AuditService');

class PermissionChangeService {
  static normalizeIds(ids = []) {
    return [
      ...new Set(
        (Array.isArray(ids) ? ids : [])
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0)
      ),
    ].sort((a, b) => a - b);
  }

  static diffIds(before = [], after = []) {
    const a = new Set(this.normalizeIds(before));
    const b = new Set(this.normalizeIds(after));
    const added = [...b].filter((x) => !a.has(x));
    const removed = [...a].filter((x) => !b.has(x));
    return { added, removed, unchanged: [...a].filter((x) => b.has(x)) };
  }

  static async resolveMenuPermissions(menuIds = []) {
    const ids = this.normalizeIds(menuIds);
    if (!ids.length) return { menuIds: [], permissions: [] };

    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT m.id, m.permission, m.name, m.type,
              COALESCE(p.code, m.permission) AS perm_code
         FROM menus m
         LEFT JOIN permissions p ON p.id = m.permission_id
        WHERE m.id IN (${placeholders})`,
      ids
    );

    const permissions = [
      ...new Set(rows.map((r) => r.perm_code || r.permission).filter((p) => p && String(p).trim())),
    ].sort();

    return {
      menuIds: ids,
      permissions,
      menus: rows.map((r) => ({
        id: r.id,
        permission: r.perm_code || r.permission,
        name: r.name,
        type: r.type,
      })),
    };
  }

  static async getUserRoleIds(userId) {
    const [rows] = await pool.execute(
      'SELECT role_id FROM user_roles WHERE user_id = ? ORDER BY role_id',
      [userId]
    );
    return rows.map((r) => Number(r.role_id));
  }

  static async getRoleSnapshot(roleId) {
    const [[role]] = await pool.execute(
      `SELECT id, name, code, description, status, data_scope
         FROM roles WHERE id = ? LIMIT 1`,
      [roleId]
    );
    if (!role) return null;
    const [menuRows] = await pool.execute(
      'SELECT menu_id FROM role_menus WHERE role_id = ? ORDER BY menu_id',
      [roleId]
    );
    const menuIds = menuRows.map((r) => Number(r.menu_id));
    let permissions;
    try {
      const [permRows] = await pool.execute(
        `SELECT p.code FROM permissions p
           JOIN role_permissions rp ON rp.permission_id = p.id
          WHERE rp.role_id = ? AND p.status = 1
          ORDER BY p.code`,
        [roleId]
      );
      permissions = permRows.map((r) => r.code);
    } catch {
      const resolved = await this.resolveMenuPermissions(menuIds);
      permissions = resolved.permissions;
    }
    return {
      id: role.id,
      name: role.name,
      code: role.code,
      description: role.description,
      status: role.status,
      data_scope: role.data_scope,
      menuIds,
      permissions,
    };
  }

  /**
   * 记录权限相关变更
   * @param {object} req Express req（可空）
   * @param {object} payload
   */
  static async logChange(req, payload = {}) {
    try {
      const {
        action = AuditAction.UPDATE,
        entityType,
        entityId,
        oldValue = null,
        newValue = null,
        summary = null,
      } = payload;

      const enrichedOld = oldValue && summary ? { ...oldValue, _summary: summary.old } : oldValue;
      const enrichedNew = newValue && summary ? { ...newValue, _summary: summary.new } : newValue;

      if (req) {
        await AuditService.logFromRequest(
          req,
          AuditModule.SYSTEM,
          action,
          entityType,
          String(entityId),
          enrichedOld,
          enrichedNew
        );
      } else {
        await AuditService.log({
          module: AuditModule.SYSTEM,
          action,
          entityType,
          entityId: String(entityId),
          oldValue: enrichedOld,
          newValue: enrichedNew,
        });
      }
    } catch (error) {
      logger.warn(`[PermissionChange] 审计写入失败: ${error.message}`);
    }
  }

  /** 角色菜单变更 */
  static async auditRoleMenus(req, roleId, oldMenuIds, newMenuIds, meta = {}) {
    const before = await this.resolveMenuPermissions(oldMenuIds);
    const after = await this.resolveMenuPermissions(newMenuIds);
    const menuDiff = this.diffIds(before.menuIds, after.menuIds);
    const oldPermSet = new Set(before.permissions);
    const newPermSet = new Set(after.permissions);
    const addedPerms = after.permissions.filter((p) => !oldPermSet.has(p));
    const removedPerms = before.permissions.filter((p) => !newPermSet.has(p));

    await this.logChange(req, {
      action: AuditAction.PERMISSION_ASSIGN,
      entityType: 'role_permissions',
      entityId: roleId,
      oldValue: {
        menuIds: before.menuIds,
        permissions: before.permissions,
        roleName: meta.roleName,
      },
      newValue: {
        menuIds: after.menuIds,
        permissions: after.permissions,
        roleName: meta.roleName,
        halfCheckedIds: meta.halfCheckedIds,
        menuDiff,
        permissionDiff: { added: addedPerms, removed: removedPerms },
      },
      summary: {
        old: { menuCount: before.menuIds.length, permCount: before.permissions.length },
        new: {
          menuCount: after.menuIds.length,
          permCount: after.permissions.length,
          addedMenus: menuDiff.added.length,
          removedMenus: menuDiff.removed.length,
          addedPerms: addedPerms.length,
          removedPerms: removedPerms.length,
        },
      },
    });
  }

  /** 用户角色变更 */
  static async auditUserRoles(req, userId, oldRoleIds, newRoleIds, meta = {}) {
    const roleDiff = this.diffIds(oldRoleIds, newRoleIds);
    await this.logChange(req, {
      action: AuditAction.ROLE_ASSIGN,
      entityType: 'user_roles',
      entityId: userId,
      oldValue: { roleIds: this.normalizeIds(oldRoleIds), username: meta.username },
      newValue: {
        roleIds: this.normalizeIds(newRoleIds),
        username: meta.username,
        roleDiff,
      },
    });
  }

  /** 角色 data_scope / 基础字段变更 */
  static async auditRoleProfile(req, roleId, oldSnap, newSnap) {
    await this.logChange(req, {
      action: AuditAction.UPDATE,
      entityType: 'role',
      entityId: roleId,
      oldValue: oldSnap,
      newValue: newSnap,
    });
  }
}

// 扩展 AuditAction 常量（不改枚举对象时使用字符串）
module.exports = PermissionChangeService;
