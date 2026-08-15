/**
 * 仓储部下增加成品仓库，并为王国柱开成品仓库管理员账号。
 * 权限走系统角色 inventory_manager，不按人名写权限。
 */
const RoleAccessService = require('../src/services/RoleAccessService');
const PasswordSecurity = require('../src/utils/passwordSecurity');

const INITIAL_PASSWORD = 'KaconWh@2026';

const FG_DEPT = {
  name: '成品仓库',
  code: 'CPC',
  remark: '仓储部成品仓库',
};

const FG_USER = {
  username: 'WGZ',
  real_name: '王国柱',
  position: '成品仓库管理员',
};

async function ensureFgDept(knex, parentId) {
  const existing =
    (await knex('departments').where({ parent_id: parentId, name: FG_DEPT.name }).first()) ||
    (await knex('departments').where({ code: FG_DEPT.code }).first());
  if (existing) {
    await knex('departments').where({ id: existing.id }).update({
      parent_id: parentId,
      name: FG_DEPT.name,
      code: FG_DEPT.code,
      status: 1,
      remark: FG_DEPT.remark,
    });
    return existing.id;
  }
  const [id] = await knex('departments').insert({
    parent_id: parentId,
    name: FG_DEPT.name,
    code: FG_DEPT.code,
    status: 1,
    remark: FG_DEPT.remark,
    created_at: knex.fn.now(),
  });
  return id;
}

exports.up = async function up(knex) {
  const warehouseDept =
    (await knex('departments').where({ name: '仓储部' }).first()) ||
    (await knex('departments').where({ code: '10007' }).first());
  if (!warehouseDept) {
    throw new Error('仓储部不存在');
  }

  const managerRole = await knex('roles').where({ code: 'inventory_manager' }).first('id');
  if (!managerRole) {
    throw new Error('inventory_manager 角色不存在');
  }

  const fgDeptId = await ensureFgDept(knex, warehouseDept.id);

  await RoleAccessService.applyAllWithKnex(knex);

  const existing =
    (await knex('users').where({ username: FG_USER.username }).first()) ||
    (await knex('users').where({ real_name: FG_USER.real_name }).first());

  let userId;
  if (existing) {
    await knex('users').where({ id: existing.id }).update({
      real_name: FG_USER.real_name,
      department_id: fgDeptId,
      department: FG_DEPT.name,
      position: FG_USER.position,
      role: 'inventory_manager',
      status: 1,
      updated_at: knex.fn.now(),
    });
    userId = existing.id;
  } else {
    const hashed = await PasswordSecurity.hashPassword(INITIAL_PASSWORD);
    const [id] = await knex('users').insert({
      username: FG_USER.username,
      password: hashed,
      real_name: FG_USER.real_name,
      department_id: fgDeptId,
      department: FG_DEPT.name,
      position: FG_USER.position,
      role: 'inventory_manager',
      status: 1,
      force_password_change: 1,
      employee_status: 'active',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });
    userId = id;
  }

  const already = await knex('user_roles')
    .where({ user_id: userId, role_id: managerRole.id })
    .first();
  if (!already) {
    await knex('user_roles').insert({
      user_id: userId,
      role_id: managerRole.id,
      created_at: knex.fn.now(),
    });
  }

  await knex('departments').where({ id: fgDeptId }).update({ manager_id: userId });

  try {
    const PermissionService = require('../src/services/PermissionService');
    await PermissionService.clearUserPermissionsCache();
  } catch {
    // ignore
  }
};

exports.down = async function down() {
  console.warn('[20260814000012] down: 保留成品仓库与王国柱账号。');
};
