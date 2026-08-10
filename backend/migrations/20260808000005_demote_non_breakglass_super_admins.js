/**
 * 运营治理：超管占比过高（审计 P0）
 * - 仅保留 break-glass：username in (admin, system, codex_audit) 或 is_super_admin 角色本身
 * - 其他挂 admin/system_admin 的业务账号：移除超管角色，无其他角色时赋予 employee
 *
 * 可逆：down 不自动恢复（需人工从备份/角色管理恢复）
 */

const BREAK_GLASS_USERNAMES = new Set(['admin', 'system', 'codex_audit']);

exports.up = async function up(knex) {
  const superRoles = await knex('roles')
    .select('id', 'code')
    .where(function () {
      this.where('is_super_admin', 1).orWhereIn('code', ['admin', 'system_admin']);
    });
  const superRoleIds = superRoles.map((r) => r.id);
  if (!superRoleIds.length) return;

  let employeeRole = await knex('roles').where({ code: 'employee' }).first();
  if (!employeeRole) {
    const [id] = await knex('roles').insert({
      name: '普通员工',
      code: 'employee',
      description: '默认业务角色（去超管后兜底）',
      status: 1,
      is_super_admin: 0,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });
    employeeRole = { id };
  }

  const superUsers = await knex('users as u')
    .join('user_roles as ur', 'ur.user_id', 'u.id')
    .whereIn('ur.role_id', superRoleIds)
    .andWhere('u.status', 1)
    .select('u.id', 'u.username')
    .groupBy('u.id', 'u.username');

  let demoted = 0;
  for (const user of superUsers) {
    if (BREAK_GLASS_USERNAMES.has(String(user.username || '').toLowerCase())) {
      continue;
    }
    // 移除全部超管角色
    await knex('user_roles')
      .where({ user_id: user.id })
      .whereIn('role_id', superRoleIds)
      .del();

    const remaining = await knex('user_roles').where({ user_id: user.id }).first();
    if (!remaining) {
      await knex('user_roles').insert({
        user_id: user.id,
        role_id: employeeRole.id,
        created_at: knex.fn.now(),
      });
    }
    demoted += 1;
  }

  console.log(
    `[20260808000005] demoted ${demoted} non-break-glass super-admin user(s); keep ${[...BREAK_GLASS_USERNAMES].join(',')}`
  );
};

exports.down = async function down() {
  console.warn(
    '[20260808000005] down: 不自动恢复超管角色，请从备份或系统管理→用户角色手工恢复'
  );
};
