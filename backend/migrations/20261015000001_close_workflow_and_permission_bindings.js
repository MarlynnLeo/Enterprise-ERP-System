/**
 * 20261015000001_close_workflow_and_permission_bindings.js
 * 
 * 权限与工作流闭环修复：
 * 1. 回填 menus 表中 permission_id 为 NULL 的菜单项对应权限主键 ID
 * 2. 补齐系统管理员（role_id=10）缺失的菜单运行时权限
 * 3. 为生产计划角色（production_planning）补充赋予 system:workflow:use 权限，确保工作流审批节点闭环
 */

exports.up = async function (knex) {
  // 1. 回填 menus 中 permission_id 为 NULL 的有效菜单项
  await knex.raw(`
    UPDATE menus m
    JOIN permissions p ON BINARY p.code = BINARY m.permission AND p.status = 1
    SET m.permission_id = p.id
    WHERE m.permission IS NOT NULL
      AND m.permission <> ''
      AND m.permission_id IS NULL
  `);

  // 2. 补齐角色菜单已授权但运行时 role_permissions 缺失的映射
  await knex.raw(`
    INSERT IGNORE INTO role_permissions (role_id, permission_id)
    SELECT DISTINCT rm.role_id, m.permission_id
    FROM role_menus rm
    JOIN menus m ON m.id = rm.menu_id AND m.permission_id IS NOT NULL
    WHERE NOT EXISTS (
      SELECT 1 FROM role_permissions rp
      WHERE rp.role_id = rm.role_id AND rp.permission_id = m.permission_id
    )
  `);

  // 3. 为生产计划岗位角色分配工作流使用权限 (system:workflow:use)
  const workflowUsePerm = await knex('permissions')
    .where({ code: 'system:workflow:use', status: 1 })
    .first();

  if (workflowUsePerm) {
    const planningRoles = await knex('roles')
      .whereIn('code', ['production_planning', 'production_planner'])
      .select('id');

    for (const role of planningRoles) {
      const exists = await knex('role_permissions')
        .where({ role_id: role.id, permission_id: workflowUsePerm.id })
        .first();

      if (!exists) {
        await knex('role_permissions').insert({
          role_id: role.id,
          permission_id: workflowUsePerm.id,
        });
      }
    }
  }
};

exports.down = async function () {
  // 向前兼容与权限闭环迁移，保持授权有效，不进行破坏性回滚
};
