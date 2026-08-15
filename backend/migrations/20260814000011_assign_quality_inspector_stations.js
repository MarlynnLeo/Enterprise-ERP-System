/**
 * 品质部检验员按工位改挂子部门与专岗权限组。
 * 权限仍来自 incoming_inspector / process_inspector / final_inspector，不按人名写权限。
 */
const ASSIGNMENTS = [
  { username: 'GXX', deptName: '来料检验', deptCode: 'LLJY', roleCode: 'incoming_inspector', position: '来料检验员' },
  { username: 'LLJ', deptName: '来料检验', deptCode: 'LLJY', roleCode: 'incoming_inspector', position: '来料检验员' },
  { username: 'YL', deptName: '成品检验', deptCode: 'CPJY', roleCode: 'final_inspector', position: '成品检验员' },
  { username: 'WCH', deptName: '成品检验', deptCode: 'CPJY', roleCode: 'final_inspector', position: '成品检验员' },
  { username: 'SF', deptName: '成品检验', deptCode: 'CPJY', roleCode: 'final_inspector', position: '成品检验员' },
  { username: 'WLF', deptName: '线上检验', deptCode: 'XSJY', roleCode: 'process_inspector', position: '线上检验员' },
  { username: 'QXF', deptName: '线上检验', deptCode: 'XSJY', roleCode: 'process_inspector', position: '线上检验员' },
];

exports.up = async function up(knex) {
  const inspectorCodes = ['quality_inspector', 'incoming_inspector', 'process_inspector', 'final_inspector'];
  const roles = await knex('roles').whereIn('code', inspectorCodes).select('id', 'code');
  const roleIdByCode = Object.fromEntries(roles.map((role) => [role.code, role.id]));
  const missingRole = inspectorCodes.find((code) => !roleIdByCode[code]);
  if (missingRole) {
    throw new Error(`缺少角色 ${missingRole}`);
  }

  for (const spec of ASSIGNMENTS) {
    const user = await knex('users').where({ username: spec.username }).first('id');
    if (!user) {
      throw new Error(`用户 ${spec.username} 不存在`);
    }
    const dept =
      (await knex('departments').where({ name: spec.deptName }).first()) ||
      (await knex('departments').where({ code: spec.deptCode }).first());
    if (!dept) {
      throw new Error(`部门 ${spec.deptName} 不存在`);
    }

    await knex('users').where({ id: user.id }).update({
      department_id: dept.id,
      department: spec.deptName,
      position: spec.position,
      role: spec.roleCode,
      updated_at: knex.fn.now(),
    });

    await knex('user_roles')
      .where({ user_id: user.id })
      .whereIn('role_id', inspectorCodes.map((code) => roleIdByCode[code]))
      .del();

    await knex('user_roles').insert({
      user_id: user.id,
      role_id: roleIdByCode[spec.roleCode],
      created_at: knex.fn.now(),
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
  const qualityDept =
    (await knex('departments').where({ name: '品质部' }).first()) ||
    (await knex('departments').where({ code: '10004' }).first());
  const inspector = await knex('roles').where({ code: 'quality_inspector' }).first('id');
  const stationRoles = await knex('roles')
    .whereIn('code', ['incoming_inspector', 'process_inspector', 'final_inspector'])
    .select('id');
  if (!qualityDept || !inspector) return;

  const usernames = ASSIGNMENTS.map((item) => item.username);
  const users = await knex('users').whereIn('username', usernames).select('id');
  for (const user of users) {
    await knex('users').where({ id: user.id }).update({
      department_id: qualityDept.id,
      department: '品质部',
      position: '检验员',
      role: 'quality_inspector',
      updated_at: knex.fn.now(),
    });
    if (stationRoles.length) {
      await knex('user_roles')
        .where({ user_id: user.id })
        .whereIn(
          'role_id',
          stationRoles.map((role) => role.id)
        )
        .del();
    }
    const already = await knex('user_roles')
      .where({ user_id: user.id, role_id: inspector.id })
      .first();
    if (!already) {
      await knex('user_roles').insert({
        user_id: user.id,
        role_id: inspector.id,
        created_at: knex.fn.now(),
      });
    }
  }
};
