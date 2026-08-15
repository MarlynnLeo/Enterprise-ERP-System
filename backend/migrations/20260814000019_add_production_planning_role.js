/**
 * 新建权限组「生产计划」= 采购部门 + 销售部 + 生产计划员。
 * 谢爱萍从三组叠加改挂这一组，权限仍走角色模板。
 */
const RoleAccessService = require('../src/services/RoleAccessService');

const ROLE = {
  code: 'production_planning',
  name: '生产计划',
  description: '采购、销售与生产计划一体岗位',
  data_scope: 2,
};

const REPLACE_CODES = ['purchase', 'XX', 'production_planner'];

exports.up = async function up(knex) {
  const existing = await knex('roles').where({ code: ROLE.code }).first();
  if (!existing) {
    await knex('roles').insert({
      name: ROLE.name,
      code: ROLE.code,
      description: ROLE.description,
      status: 1,
      data_scope: ROLE.data_scope,
      is_super_admin: 0,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });
  } else {
    await knex('roles').where({ id: existing.id }).update({
      name: ROLE.name,
      description: ROLE.description,
      status: 1,
      data_scope: ROLE.data_scope,
      updated_at: knex.fn.now(),
    });
  }

  await RoleAccessService.applyAllWithKnex(knex);

  const planning = await knex('roles').where({ code: ROLE.code }).first('id');
  const user = await knex('users').where({ username: 'XAP' }).first('id');
  if (planning && user) {
    const remove = await knex('roles').whereIn('code', REPLACE_CODES).select('id');
    if (remove.length) {
      await knex('user_roles')
        .where({ user_id: user.id })
        .whereIn(
          'role_id',
          remove.map((role) => role.id)
        )
        .del();
    }
    const already = await knex('user_roles').where({ user_id: user.id, role_id: planning.id }).first();
    if (!already) {
      await knex('user_roles').insert({
        user_id: user.id,
        role_id: planning.id,
        created_at: knex.fn.now(),
      });
    }
    await knex('users').where({ id: user.id }).update({
      role: ROLE.code,
      position: ROLE.name,
      updated_at: knex.fn.now(),
    });
  }

  try {
    const PermissionService = require('../src/services/PermissionService');
    await PermissionService.clearUserPermissionsCache();
  } catch {
    // ignore
  }
};

exports.down = async function down(knex) {
  const planning = await knex('roles').where({ code: ROLE.code }).first('id');
  if (!planning) return;
  await knex('user_roles').where({ role_id: planning.id }).del();
  await knex('role_menus').where({ role_id: planning.id }).del();
  await knex('role_permissions').where({ role_id: planning.id }).del();
  await knex('roles').where({ id: planning.id }).del();
};
