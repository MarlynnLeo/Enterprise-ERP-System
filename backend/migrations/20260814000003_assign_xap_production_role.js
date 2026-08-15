/**
 * 谢爱萍（XAP）兼职生产：在采购/销售之外挂生产管理员。
 * 只改 user_roles，不改岗位模板（采购部门角色不加生产菜单）。
 */

exports.up = async function up(knex) {
  const user = await knex('users').where({ username: 'XAP' }).first('id');
  const role = await knex('roles').where({ code: 'production_manager' }).first('id');
  if (!user || !role) return;

  const exists = await knex('user_roles').where({ user_id: user.id, role_id: role.id }).first();
  if (!exists) {
    await knex('user_roles').insert({
      user_id: user.id,
      role_id: role.id,
      created_at: knex.fn.now(),
    });
  }

  try {
    const PermissionService = require('../src/services/PermissionService');
    await PermissionService.clearUserPermissionsCache(user.id);
  } catch {
    // 迁移环境可能没有缓存
  }
};

exports.down = async function down(knex) {
  const user = await knex('users').where({ username: 'XAP' }).first('id');
  const role = await knex('roles').where({ code: 'production_manager' }).first('id');
  if (!user || !role) return;
  await knex('user_roles').where({ user_id: user.id, role_id: role.id }).del();
};
