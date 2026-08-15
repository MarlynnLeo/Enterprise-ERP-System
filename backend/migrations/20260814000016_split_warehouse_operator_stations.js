/**
 * 仓储按作业拆岗：
 * - 王国柱：成品仓操作员（成品入库 + 销售出库）
 * - 褚秀琴/吴霞/陈诚：零部件仓操作员（零部件发料出库）
 * 成品检验员权限由 roleAccessProfiles.final_inspector 补齐入库。
 */
const RoleAccessService = require('../src/services/RoleAccessService');

const ROLES = [
  {
    code: 'finished_goods_operator',
    name: '成品仓操作员',
    description: '成品仓库入库与销售出库，不含零部件发料和仓储管理',
    data_scope: 4,
  },
  {
    code: 'component_warehouse_operator',
    name: '零部件仓操作员',
    description: '零部件仓库发料出库，不含成品入库和销售出库',
    data_scope: 4,
  },
];

async function ensureDept(knex, parentId, spec) {
  const existing =
    (await knex('departments').where({ parent_id: parentId, name: spec.name }).first()) ||
    (await knex('departments').where({ code: spec.code }).first());
  if (existing) {
    await knex('departments').where({ id: existing.id }).update({
      parent_id: parentId,
      name: spec.name,
      code: spec.code,
      status: 1,
      remark: spec.remark,
    });
    return existing.id;
  }
  const [id] = await knex('departments').insert({
    parent_id: parentId,
    name: spec.name,
    code: spec.code,
    status: 1,
    remark: spec.remark,
    created_at: knex.fn.now(),
  });
  return id;
}

async function ensureRole(knex, spec) {
  const existing = await knex('roles').where({ code: spec.code }).first();
  if (!existing) {
    await knex('roles').insert({
      name: spec.name,
      code: spec.code,
      description: spec.description,
      status: 1,
      data_scope: spec.data_scope,
      is_super_admin: 0,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });
    return;
  }
  await knex('roles').where({ id: existing.id }).update({
    name: spec.name,
    description: spec.description,
    status: 1,
    data_scope: spec.data_scope,
    updated_at: knex.fn.now(),
  });
}

async function rebindUser(knex, username, spec) {
  const user = await knex('users').where({ username }).first('id');
  if (!user) throw new Error(`用户 ${username} 不存在`);
  await knex('users').where({ id: user.id }).update({
    department_id: spec.departmentId,
    department: spec.departmentName,
    position: spec.position,
    role: spec.roleCode,
    status: 1,
    updated_at: knex.fn.now(),
  });

  const role = await knex('roles').where({ code: spec.roleCode }).first('id');
  const remove = await knex('roles')
    .whereIn('code', spec.removeRoleCodes || [])
    .select('id');
  if (remove.length) {
    await knex('user_roles')
      .where({ user_id: user.id })
      .whereIn(
        'role_id',
        remove.map((item) => item.id)
      )
      .del();
  }
  const already = await knex('user_roles').where({ user_id: user.id, role_id: role.id }).first();
  if (!already) {
    await knex('user_roles').insert({
      user_id: user.id,
      role_id: role.id,
      created_at: knex.fn.now(),
    });
  }
}

exports.up = async function up(knex) {
  const warehouse =
    (await knex('departments').where({ name: '仓储部' }).first()) ||
    (await knex('departments').where({ code: '10007' }).first());
  if (!warehouse) throw new Error('仓储部不存在');

  const fgDeptId = await ensureDept(knex, warehouse.id, {
    name: '成品仓库',
    code: 'CPC',
    remark: '仓储部成品仓库',
  });
  const componentDeptId = await ensureDept(knex, warehouse.id, {
    name: '零部件仓库',
    code: 'LBJC',
    remark: '仓储部零部件仓库，负责生产发料',
  });

  for (const role of ROLES) {
    await ensureRole(knex, role);
  }

  await RoleAccessService.applyAllWithKnex(knex);

  await rebindUser(knex, 'WGZ', {
    departmentId: fgDeptId,
    departmentName: '成品仓库',
    position: '成品仓操作员',
    roleCode: 'finished_goods_operator',
    removeRoleCodes: ['inventory_manager', 'inventory_operator'],
  });
  for (const username of ['CXQ', 'WX', 'CC']) {
    await rebindUser(knex, username, {
      departmentId: componentDeptId,
      departmentName: '零部件仓库',
      position: '零部件仓操作员',
      roleCode: 'component_warehouse_operator',
      removeRoleCodes: ['inventory_operator', 'inventory_manager'],
    });
  }

  const wgz = await knex('users').where({ username: 'WGZ' }).first('id');
  if (wgz) {
    await knex('departments').where({ id: fgDeptId }).update({ manager_id: wgz.id });
  }

  try {
    const PermissionService = require('../src/services/PermissionService');
    await PermissionService.clearUserPermissionsCache();
  } catch {
    // ignore
  }
};

exports.down = async function down() {
  console.warn('[20260814000016] down: 不回滚仓储分岗与成品检验入库权限。');
};
