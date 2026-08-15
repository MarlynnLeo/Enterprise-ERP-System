/**
 * 1. 黄立果归生产部，倪海燕归财务部。
 * 2. 生产部车间组对齐：按钮开关组更名为 B系列组。
 * 3. 车间上线账号挂生产操作员，部门落到对应生产组。
 */
const RoleAccessService = require('../src/services/RoleAccessService');
const PasswordSecurity = require('../src/utils/passwordSecurity');

const INITIAL_PASSWORD = 'KaconOp@2026';

const GROUP_DEPTS = [
  {
    name: 'B系列组',
    code: 'BXLZ',
    remark: '生产部 B 系列组',
    aliases: ['按钮开关组', 'ANKGZ'],
  },
  { name: '行程组', code: 'XXZ', remark: '生产部行程组', aliases: [] },
  { name: '新产品组', code: 'XCPZ', remark: '生产部新产品组', aliases: [] },
  { name: '脚踏组A', code: 'JTZA', remark: '生产部脚踏A组', aliases: ['脚踏A组'] },
  { name: '脚踏组B', code: 'JTZB', remark: '生产部脚踏B组', aliases: ['脚踏B组'] },
];

const SHOP_USERS = [
  { username: 'XHY', real_name: '徐海英', deptName: 'B系列组' },
  { username: 'YYZ', real_name: '杨叶子', deptName: '行程组' },
  { username: 'ZR', real_name: '赵瑞', deptName: '新产品组' },
  { username: 'NXJ', real_name: '倪晓洁', deptName: '脚踏组A' },
  { username: 'XLX', real_name: '肖丽霞', deptName: '脚踏组B' },
];

async function findDept(knex, spec) {
  return (
    (await knex('departments').where({ name: spec.name }).first()) ||
    (await knex('departments').where({ code: spec.code }).first()) ||
    (spec.aliases.length
      ? await knex('departments').whereIn('name', spec.aliases).orWhereIn('code', spec.aliases).first()
      : null)
  );
}

async function ensureGroup(knex, parentId, spec) {
  const existing = await findDept(knex, spec);
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

async function ensureShopUser(knex, spec, dept, operatorRoleId) {
  const existing =
    (await knex('users').where({ username: spec.username }).first()) ||
    (await knex('users').where({ real_name: spec.real_name }).first());

  let userId;
  if (existing) {
    await knex('users').where({ id: existing.id }).update({
      real_name: spec.real_name,
      department_id: dept.id,
      department: dept.name,
      position: existing.position || '生产操作员',
      status: 1,
      updated_at: knex.fn.now(),
    });
    userId = existing.id;
  } else {
    const hashed = await PasswordSecurity.hashPassword(INITIAL_PASSWORD);
    const [id] = await knex('users').insert({
      username: spec.username,
      password: hashed,
      real_name: spec.real_name,
      department_id: dept.id,
      department: dept.name,
      position: '生产操作员',
      role: 'production_operator',
      status: 1,
      force_password_change: 1,
      employee_status: 'active',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });
    userId = id;
  }

  const already = await knex('user_roles')
    .where({ user_id: userId, role_id: operatorRoleId })
    .first();
  if (!already) {
    await knex('user_roles').insert({
      user_id: userId,
      role_id: operatorRoleId,
      created_at: knex.fn.now(),
    });
  }

  await knex('departments').where({ id: dept.id }).update({ manager_id: userId });
  return userId;
}

exports.up = async function up(knex) {
  const productionDept =
    (await knex('departments').where({ name: '生产部' }).first()) ||
    (await knex('departments').where({ code: '10005' }).first());
  const financeDept =
    (await knex('departments').where({ name: '财务部' }).first()) ||
    (await knex('departments').where({ code: '10002' }).first());
  if (!productionDept) throw new Error('生产部不存在');
  if (!financeDept) throw new Error('财务部不存在');

  await knex('users').where({ username: 'HLG' }).update({
    department_id: productionDept.id,
    department: '生产部',
    updated_at: knex.fn.now(),
  });
  await knex('users').where({ username: 'NHY' }).update({
    department_id: financeDept.id,
    department: '财务部',
    updated_at: knex.fn.now(),
  });

  const groupIds = {};
  for (const spec of GROUP_DEPTS) {
    groupIds[spec.name] = await ensureGroup(knex, productionDept.id, spec);
  }

  const operator = await knex('roles').where({ code: 'production_operator' }).first('id');
  if (!operator) throw new Error('production_operator 角色不存在');

  await RoleAccessService.applyAllWithKnex(knex);

  for (const user of SHOP_USERS) {
    const deptId = groupIds[user.deptName];
    await ensureShopUser(
      knex,
      user,
      { id: deptId, name: user.deptName },
      operator.id
    );
  }

  try {
    const PermissionService = require('../src/services/PermissionService');
    await PermissionService.clearUserPermissionsCache();
  } catch {
    // ignore
  }
};

exports.down = async function down() {
  console.warn('[20260814000010] down: 不回滚部门调整与车间账号。');
};
