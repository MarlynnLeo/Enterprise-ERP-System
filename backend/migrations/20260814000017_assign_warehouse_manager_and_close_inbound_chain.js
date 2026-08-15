/**
 * 徐秀霞改为仓储部仓库管理员。
 * 来料合格入库、零部件发料看任务，由角色模板落地。
 */
const RoleAccessService = require('../src/services/RoleAccessService');

exports.up = async function up(knex) {
  const warehouse =
    (await knex('departments').where({ name: '仓储部' }).first()) ||
    (await knex('departments').where({ code: '10007' }).first());
  const managerRole = await knex('roles').where({ code: 'inventory_manager' }).first('id');
  const operatorRole = await knex('roles').where({ code: 'inventory_operator' }).first('id');
  const user = await knex('users').where({ username: 'XXX' }).first('id');
  if (!warehouse || !managerRole || !user) {
    throw new Error('仓储部、库存管理员角色或徐秀霞账号不存在');
  }

  await knex('users').where({ id: user.id }).update({
    department_id: warehouse.id,
    department: '仓储部',
    position: '仓库管理员',
    role: 'inventory_manager',
    status: 1,
    updated_at: knex.fn.now(),
  });

  if (operatorRole) {
    await knex('user_roles').where({ user_id: user.id, role_id: operatorRole.id }).del();
  }
  const already = await knex('user_roles').where({ user_id: user.id, role_id: managerRole.id }).first();
  if (!already) {
    await knex('user_roles').insert({
      user_id: user.id,
      role_id: managerRole.id,
      created_at: knex.fn.now(),
    });
  }
  await knex('departments').where({ id: warehouse.id }).update({ manager_id: user.id });

  await RoleAccessService.applyAllWithKnex(knex);

  try {
    const PermissionService = require('../src/services/PermissionService');
    await PermissionService.clearUserPermissionsCache();
  } catch {
    // ignore
  }
};

exports.down = async function down() {
  console.warn('[20260814000017] down: 不回滚徐秀霞仓库管理员与来料入库链路。');
};
