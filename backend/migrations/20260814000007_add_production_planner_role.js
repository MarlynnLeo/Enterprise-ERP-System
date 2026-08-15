/**
 * 新增系统权限组「生产计划员」，并把谢爱萍从生产管理员改挂此组。
 * 菜单/权限由 roleAccessProfiles.production_planner 写入。
 */
const RoleAccessService = require('../src/services/RoleAccessService');

exports.up = async function up(knex) {
  const existing = await knex('roles').where({ code: 'production_planner' }).first();
  if (!existing) {
    await knex('roles').insert({
      name: '生产计划员',
      code: 'production_planner',
      description: '编制与下推生产计划，不包含全厂生产执行',
      status: 1,
      data_scope: 2,
      is_super_admin: 0,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });
  } else {
    await knex('roles').where({ id: existing.id }).update({
      name: '生产计划员',
      description: '编制与下推生产计划，不包含全厂生产执行',
      status: 1,
      updated_at: knex.fn.now(),
    });
  }

  await RoleAccessService.applyAllWithKnex(knex);

  const planner = await knex('roles').where({ code: 'production_planner' }).first('id');
  const manager = await knex('roles').where({ code: 'production_manager' }).first('id');
  const user = await knex('users').where({ username: 'XAP' }).first('id');
  if (planner && user) {
    const already = await knex('user_roles').where({ user_id: user.id, role_id: planner.id }).first();
    if (!already) {
      await knex('user_roles').insert({
        user_id: user.id,
        role_id: planner.id,
        created_at: knex.fn.now(),
      });
    }
  }
  if (manager && user) {
    await knex('user_roles').where({ user_id: user.id, role_id: manager.id }).del();
  }

  try {
    const PermissionService = require('../src/services/PermissionService');
    await PermissionService.clearUserPermissionsCache();
  } catch {
    // ignore
  }
};

exports.down = async function down(knex) {
  const planner = await knex('roles').where({ code: 'production_planner' }).first('id');
  if (!planner) return;
  await knex('user_roles').where({ role_id: planner.id }).del();
  await knex('role_menus').where({ role_id: planner.id }).del();
  await knex('role_permissions').where({ role_id: planner.id }).del();
  await knex('roles').where({ id: planner.id }).del();
};
