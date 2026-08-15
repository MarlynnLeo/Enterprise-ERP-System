/**
 * 财务岗位对齐：向琴=会计助理，林选乐/倪海燕=会计管理员。
 * 会计助理只做凭证和应收应付日常，结账与财务设置留给管理员。
 */
const RoleAccessService = require('../src/services/RoleAccessService');

exports.up = async function up(knex) {
  const financeDept =
    (await knex('departments').where({ name: '财务部' }).first()) ||
    (await knex('departments').where({ code: '10002' }).first());
  if (!financeDept) throw new Error('财务部不存在');

  await knex('roles').where({ code: 'accountant' }).update({
    name: '会计助理',
    description: '凭证录入、应收应付与日常核算，不含结账和财务设置',
    updated_at: knex.fn.now(),
  });
  await knex('roles').where({ code: 'finance_manager' }).update({
    name: '会计管理员',
    description: '会计核算管理、结账与财务设置',
    updated_at: knex.fn.now(),
  });

  await RoleAccessService.applyAllWithKnex(knex);

  const assistant = await knex('roles').where({ code: 'accountant' }).first('id');
  const manager = await knex('roles').where({ code: 'finance_manager' }).first('id');
  if (!assistant || !manager) throw new Error('会计角色不存在');

  await knex('users').where({ username: 'XQ' }).update({
    department_id: financeDept.id,
    department: '财务部',
    position: '会计助理',
    role: 'accountant',
    updated_at: knex.fn.now(),
  });
  await knex('users').whereIn('username', ['LXL', 'NHY']).update({
    department_id: financeDept.id,
    department: '财务部',
    position: '会计管理员',
    role: 'finance_manager',
    updated_at: knex.fn.now(),
  });
  await knex('users').where({ username: 'ZYS' }).update({
    department_id: financeDept.id,
    department: '财务部',
    position: '出纳',
    updated_at: knex.fn.now(),
  });

  const xq = await knex('users').where({ username: 'XQ' }).first('id');
  if (xq) {
    await knex('user_roles').where({ user_id: xq.id, role_id: manager.id }).del();
    const already = await knex('user_roles').where({ user_id: xq.id, role_id: assistant.id }).first();
    if (!already) {
      await knex('user_roles').insert({
        user_id: xq.id,
        role_id: assistant.id,
        created_at: knex.fn.now(),
      });
    }
  }

  for (const username of ['LXL', 'NHY']) {
    const user = await knex('users').where({ username }).first('id');
    if (!user) continue;
    await knex('user_roles').where({ user_id: user.id, role_id: assistant.id }).del();
    const already = await knex('user_roles').where({ user_id: user.id, role_id: manager.id }).first();
    if (!already) {
      await knex('user_roles').insert({
        user_id: user.id,
        role_id: manager.id,
        created_at: knex.fn.now(),
      });
    }
  }

  try {
    const PermissionService = require('../src/services/PermissionService');
    await PermissionService.clearUserPermissionsCache();
  } catch {
    // ignore
  }
};

exports.down = async function down() {
  console.warn('[20260814000018] down: 不回滚会计助理与会计管理员拆分。');
};
