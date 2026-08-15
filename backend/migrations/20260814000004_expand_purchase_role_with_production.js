/**
 * 采购部门 / 采购管理员权限组并入生产模块。
 * 只改角色模板（role_menus / role_permissions），不绑定任何具体账号。
 */

const { getProfile, selectAllowedMenuIds } = require('../src/authorization/roleAccessProfiles');

const TARGET_ROLE_CODES = ['purchase', 'purchase_manager'];

async function resyncRolePermissions(knex, roleId, menuIds) {
  await knex('role_permissions').where({ role_id: roleId }).del();
  if (!menuIds.length) return;

  const placeholders = menuIds.map(() => '?').join(',');
  await knex.raw(
    `
    INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
    SELECT DISTINCT ?, COALESCE(m.permission_id, p.id), NOW()
      FROM menus m
      LEFT JOIN permissions p
        ON p.code COLLATE utf8mb4_unicode_ci = m.permission COLLATE utf8mb4_unicode_ci
       AND p.status = 1
     WHERE m.id IN (${placeholders})
       AND m.permission IS NOT NULL
       AND m.permission <> ''
       AND COALESCE(m.permission_id, p.id) IS NOT NULL
    `,
    [roleId, ...menuIds]
  );
}

exports.up = async function up(knex) {
  const roles = await knex('roles').select('id', 'code').whereIn('code', TARGET_ROLE_CODES);
  const menus = await knex('menus').select('id', 'path', 'permission', 'type', 'parent_id', 'status');

  for (const role of roles) {
    const profile = getProfile(role.code);
    if (!profile) continue;
    const keepIds = selectAllowedMenuIds(menus, profile);
    await knex('role_menus').where({ role_id: role.id }).del();
    for (let index = 0; index < keepIds.length; index += 200) {
      const slice = keepIds.slice(index, index + 200);
      await knex('role_menus').insert(
        slice.map((menuId) => ({
          role_id: role.id,
          menu_id: menuId,
          created_at: knex.fn.now(),
        }))
      );
    }
    await resyncRolePermissions(knex, role.id, keepIds);
  }

  try {
    const PermissionService = require('../src/services/PermissionService');
    await PermissionService.clearUserPermissionsCache();
  } catch {
    // 迁移环境可能没有缓存
  }
};

exports.down = async function down() {
  console.warn(
    '[20260814000004] down: 不自动从采购权限组拆掉生产菜单，请在系统管理→权限设置中按岗位模板重置。'
  );
};
