/**
 * 品质部下增加来料/线上/成品检验子部门与三类检验员权限组，
 * 并为品质部检验员开账号。未指定具体工位的人先挂品质部 + 质检员。
 */
const RoleAccessService = require('../src/services/RoleAccessService');
const PasswordSecurity = require('../src/utils/passwordSecurity');

const INITIAL_PASSWORD = 'KaconQc@2026';

const CHILD_DEPTS = [
  { name: '来料检验', code: 'LLJY', remark: '品质部来料检验（IQC）' },
  { name: '线上检验', code: 'XSJY', remark: '品质部线上/过程检验（IPQC）' },
  { name: '成品检验', code: 'CPJY', remark: '品质部成品检验（FQC）' },
];

const INSPECTOR_ROLES = [
  {
    code: 'incoming_inspector',
    name: '来料检验员',
    description: '来料检验作业，不含成品/过程检验与质量体系管理',
    data_scope: 4,
  },
  {
    code: 'process_inspector',
    name: '线上检验员',
    description: '线上过程检验与首检作业，不含来料/成品检验与质量体系管理',
    data_scope: 4,
  },
  {
    code: 'final_inspector',
    name: '成品检验员',
    description: '成品检验作业，不含来料/过程检验与质量体系管理',
    data_scope: 4,
  },
];

const QC_USERS = [
  { username: 'WLF', real_name: '韦兰凤' },
  { username: 'QXF', real_name: '钱小飞' },
  { username: 'WCH', real_name: '王翠华' },
  { username: 'LLJ', real_name: '骆丽君' },
  { username: 'YL', real_name: '杨林' },
  { username: 'SF', real_name: '舒凡' },
  { username: 'GXX', real_name: '郭芯芯' },
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

async function ensureUser(knex, spec, qualityDeptId, inspectorRoleId) {
  const existing =
    (await knex('users').where({ username: spec.username }).first()) ||
    (await knex('users').where({ real_name: spec.real_name }).first());

  if (existing) {
    await knex('users').where({ id: existing.id }).update({
      real_name: spec.real_name,
      department_id: existing.department_id || qualityDeptId,
      department: existing.department || '品质部',
      position: existing.position || '检验员',
      status: 1,
      updated_at: knex.fn.now(),
    });
    const already = await knex('user_roles')
      .where({ user_id: existing.id, role_id: inspectorRoleId })
      .first();
    if (!already) {
      await knex('user_roles').insert({
        user_id: existing.id,
        role_id: inspectorRoleId,
        created_at: knex.fn.now(),
      });
    }
    return existing.id;
  }

  const hashed = await PasswordSecurity.hashPassword(INITIAL_PASSWORD);
  const [userId] = await knex('users').insert({
    username: spec.username,
    password: hashed,
    real_name: spec.real_name,
    department_id: qualityDeptId,
    department: '品质部',
    position: '检验员',
    role: 'quality_inspector',
    status: 1,
    force_password_change: 1,
    employee_status: 'active',
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });
  await knex('user_roles').insert({
    user_id: userId,
    role_id: inspectorRoleId,
    created_at: knex.fn.now(),
  });
  return userId;
}

exports.up = async function up(knex) {
  const qualityDept =
    (await knex('departments').where({ name: '品质部' }).first()) ||
    (await knex('departments').where({ code: '10004' }).first());
  if (!qualityDept) {
    throw new Error('品质部不存在，无法创建检验子部门');
  }

  for (const dept of CHILD_DEPTS) {
    await ensureDept(knex, qualityDept.id, dept);
  }

  for (const role of INSPECTOR_ROLES) {
    await ensureRole(knex, role);
  }

  await RoleAccessService.applyAllWithKnex(knex);

  const inspector = await knex('roles').where({ code: 'quality_inspector' }).first('id');
  if (!inspector) {
    throw new Error('quality_inspector 角色不存在');
  }

  for (const user of QC_USERS) {
    await ensureUser(knex, user, qualityDept.id, inspector.id);
  }

  try {
    const PermissionService = require('../src/services/PermissionService');
    await PermissionService.clearUserPermissionsCache();
  } catch {
    // ignore
  }
};

exports.down = async function down(knex) {
  const roleCodes = INSPECTOR_ROLES.map((role) => role.code);
  const roles = await knex('roles').whereIn('code', roleCodes).select('id');
  const roleIds = roles.map((role) => role.id);
  if (roleIds.length) {
    await knex('user_roles').whereIn('role_id', roleIds).del();
    await knex('role_menus').whereIn('role_id', roleIds).del();
    await knex('role_permissions').whereIn('role_id', roleIds).del();
    await knex('roles').whereIn('id', roleIds).del();
  }
  console.warn('[20260814000009] down: 保留品质部检验子部门与已开账号，只撤三类检验员权限组。');
};
