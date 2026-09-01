/**
 * 系统角色岗位范围服务
 *
 * 把 roleAccessProfiles 落到 role_menus / role_permissions。
 * 已登记的系统角色：保存权限、新建菜单、按模板重置都走这里。
 */

const {
  getProfile,
  menuAllowed,
  selectAllowedMenuIds,
  describeRoleAccess,
  listManagedProfiles,
} = require('../authorization/roleAccessProfiles');
const {
  syncRolePermissionsFromMenus,
  supplementalPermissionCodesForRole,
} = require('./PermissionRegistry');
const { logger } = require('../utils/logger');
const { isSuperAdminRole } = require('../authorization/superAdmin');

const ALL_DATA_SCOPE = 1;

function chunk(items, size = 200) {
  const result = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

class RoleAccessService {
  static describe(code, isSuperAdmin = false) {
    return describeRoleAccess(code, isSuperAdmin);
  }

  static listProfiles() {
    return listManagedProfiles();
  }

  static async forceAllDataScope(conn, roleId) {
    await conn.execute(
      'UPDATE roles SET data_scope = ? WHERE id = ? AND COALESCE(data_scope, 0) <> ?',
      [ALL_DATA_SCOPE, roleId, ALL_DATA_SCOPE]
    );
  }

  static async grantAllAccess(conn, roleId) {
    await this.forceAllDataScope(conn, roleId);
    await conn.execute('DELETE FROM role_menus WHERE role_id = ?', [roleId]);
    await conn.execute(
      `INSERT INTO role_menus (role_id, menu_id)
       SELECT ?, id FROM menus WHERE status = 1`,
      [roleId]
    );

    await conn.execute('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
    await conn.execute(
      `INSERT INTO role_permissions (role_id, permission_id, created_at)
       SELECT ?, id, NOW() FROM permissions WHERE status = 1`,
      [roleId]
    );

    const [[{ menus }]] = await conn.execute(
      'SELECT COUNT(*) AS menus FROM role_menus WHERE role_id = ?',
      [roleId]
    );
    const [[{ permissions }]] = await conn.execute(
      'SELECT COUNT(*) AS permissions FROM role_permissions WHERE role_id = ?',
      [roleId]
    );
    logger.info(
      `[RoleAccess] 超级管理员角色 ${roleId} 已授予全部权限: menus=${menus}, permissions=${permissions}`
    );
    return { menus: Number(menus), permissions: Number(permissions) };
  }

  static shouldGrantNewMenu(role, menu, { parentAssigned = false } = {}) {
    if (isSuperAdminRole(role)) return true;
    const profile = getProfile(role?.code);
    if (profile) return menuAllowed(menu, profile);
    return Number(menu?.type) === 2 && Boolean(parentAssigned);
  }

  static async clampMenuIds(conn, role, menuIds = []) {
    const ids = [
      ...new Set((Array.isArray(menuIds) ? menuIds : []).map((id) => Number(id))),
    ].filter((id) => Number.isInteger(id) && id > 0);

    if (isSuperAdminRole(role) || !ids.length) return ids;

    const profile = getProfile(role?.code);
    if (!profile) return ids;

    const placeholders = ids.map(() => '?').join(',');
    const [menus] = await conn.execute(
      `SELECT id, path, permission, type, parent_id, status FROM menus WHERE id IN (${placeholders})`,
      ids
    );
    return selectAllowedMenuIds(menus, profile);
  }

  static async applyRole(conn, role, menus = null) {
    await this.forceAllDataScope(conn, role.id);
    if (isSuperAdminRole(role)) {
      const granted = await this.grantAllAccess(conn, role.id);
      return {
        role: role.code,
        skipped: 'super_admin',
        permissionsAfter: granted.permissions,
        menusAfter: granted.menus,
      };
    }

    const profile = getProfile(role.code);
    if (!profile) {
      return {
        role: role.code,
        skipped: 'custom',
        permissionsAfter: null,
        menusAfter: null,
      };
    }

    let allMenus = menus;
    if (!allMenus) {
      const [rows] = await conn.execute(
        'SELECT id, path, permission, type, parent_id, status FROM menus'
      );
      allMenus = rows;
    }

    const [beforeMenus] = await conn.execute(
      'SELECT COUNT(*) AS total FROM role_menus WHERE role_id = ?',
      [role.id]
    );
    const keepIds = selectAllowedMenuIds(allMenus, profile);

    await conn.execute('DELETE FROM role_menus WHERE role_id = ?', [role.id]);
    for (const group of chunk(keepIds)) {
      const values = group.map(() => '(?, ?)').join(',');
      const params = [];
      for (const menuId of group) {
        params.push(role.id, menuId);
      }
      await conn.execute(`INSERT INTO role_menus (role_id, menu_id) VALUES ${values}`, params);
    }

    const sync = await syncRolePermissionsFromMenus(conn, role.id, keepIds);
    logger.info(
      `[RoleAccess] ${role.code} menus ${Number(beforeMenus[0]?.total || 0)} → ${keepIds.length}, perms inserted=${sync.inserted}`
    );

    return {
      role: role.code,
      name: role.name,
      skipped: null,
      menusBefore: Number(beforeMenus[0]?.total || 0),
      menusAfter: keepIds.length,
      permissionsAfter: sync.inserted,
    };
  }

  static async applyAllProfiles(conn) {
    const [roles] = await conn.execute(
      'SELECT id, code, name, is_super_admin FROM roles ORDER BY id'
    );
    const [menus] = await conn.execute(
      'SELECT id, path, permission, type, parent_id, status FROM menus'
    );
    const summary = [];
    for (const role of roles) {
      const result = await this.applyRole(conn, role, menus);
      if (!result.skipped) summary.push(result);
    }
    return summary;
  }

  static async grantPermissionCodesWithKnex(knex, roleId, codes = [], source = 'profile') {
    const uniqueCodes = [...new Set(codes)].filter(Boolean);
    if (!uniqueCodes.length) return 0;

    for (const code of uniqueCodes) {
      const existing = await knex('permissions').where({ code }).first('id');
      if (!existing) {
        const moduleName = String(code).includes(':') ? String(code).split(':')[0] : code;
        await knex('permissions').insert({
          code,
          name: code,
          module: moduleName,
          status: 1,
          source,
          created_at: knex.fn.now(),
          updated_at: knex.fn.now(),
        });
      }
    }

    const placeholders = uniqueCodes.map(() => '?').join(',');
    await knex.raw(
      `INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
       SELECT ?, p.id, NOW()
         FROM permissions p
        WHERE p.status = 1 AND p.code IN (${placeholders})`,
      [roleId, ...uniqueCodes]
    );
    return uniqueCodes.length;
  }

  static async grantSupplementalPermissionsWithKnex(knex, role, registeredCodes = []) {
    const codes = supplementalPermissionCodesForRole(role, registeredCodes);
    if (!codes.length) return 0;
    return this.grantPermissionCodesWithKnex(knex, role.id, codes, 'profile');
  }

  static async applyAllWithKnex(knex) {
    const roles = await knex('roles').select('id', 'code', 'name', 'is_super_admin');
    const menus = await knex('menus').select(
      'id',
      'path',
      'permission',
      'type',
      'parent_id',
      'status'
    );
    const registeredCodes = (await knex('permissions').where({ status: 1 }).select('code')).map(
      (permission) => permission.code
    );
    const summary = [];
    const superAdminRoleIds = [];

    for (const role of roles) {
      await knex('roles').where({ id: role.id }).update({ data_scope: ALL_DATA_SCOPE });
      if (isSuperAdminRole(role)) {
        await knex('role_menus').where({ role_id: role.id }).del();
        await knex.raw(
          `INSERT INTO role_menus (role_id, menu_id)
           SELECT ?, id FROM menus WHERE status = 1`,
          [role.id]
        );
        superAdminRoleIds.push(role.id);
        continue;
      }
      const profile = getProfile(role.code);
      if (!profile) {
        await this.grantSupplementalPermissionsWithKnex(knex, role, registeredCodes);
        continue;
      }

      const keepIds = selectAllowedMenuIds(menus, profile);
      await knex('role_menus').where({ role_id: role.id }).del();
      for (const group of chunk(keepIds)) {
        await knex('role_menus').insert(
          group.map((menuId) => ({
            role_id: role.id,
            menu_id: menuId,
            created_at: knex.fn.now(),
          }))
        );
      }
      await knex('role_permissions').where({ role_id: role.id }).del();
      const keepIdSet = new Set(keepIds);
      const menuCodes = menus
        .filter((menu) => keepIdSet.has(Number(menu.id)))
        .map((menu) => menu.permission)
        .filter(Boolean);
      await this.grantPermissionCodesWithKnex(knex, role.id, menuCodes, 'menu');
      await this.grantSupplementalPermissionsWithKnex(knex, role, registeredCodes);
      summary.push({ role: role.code, menusAfter: keepIds.length });
    }

    // Managed-role synchronization may register previously missing exact permissions.
    // Refresh super admins last so their persisted permission graph includes those rows too.
    for (const roleId of superAdminRoleIds) {
      await knex('role_permissions').where({ role_id: roleId }).del();
      await knex.raw(
        `INSERT INTO role_permissions (role_id, permission_id, created_at)
         SELECT ?, id, NOW() FROM permissions WHERE status = 1`,
        [roleId]
      );
    }
    return summary;
  }
}

module.exports = RoleAccessService;
