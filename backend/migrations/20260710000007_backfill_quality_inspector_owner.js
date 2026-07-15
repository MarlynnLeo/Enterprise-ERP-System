/**
 * 质检单 owner 回填：inspector_id 为空时
 * 1) inspector_name → users
 * 2) 否则 admin
 * 保证 quality_inspection DataScope 历史数据可判定
 */

async function resolveAdminUserId(knex) {
  const viaRole = await knex('users as u')
    .join('user_roles as ur', 'ur.user_id', 'u.id')
    .join('roles as r', 'r.id', 'ur.role_id')
    .where('r.code', 'admin')
    .select('u.id')
    .first();
  if (viaRole?.id) return viaRole.id;
  const admin = await knex('users').where({ username: 'admin' }).first();
  return admin?.id || 1;
}

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('quality_inspections'))) return;
  if (!(await knex.schema.hasColumn('quality_inspections', 'inspector_id'))) return;

  const adminId = await resolveAdminUserId(knex);

  // 按 inspector_name 映射
  if (await knex.schema.hasColumn('quality_inspections', 'inspector_name')) {
    await knex.raw(
      `
      UPDATE quality_inspections qi
      LEFT JOIN users u ON
        BINARY u.username = BINARY qi.inspector_name
        OR BINARY u.real_name = BINARY qi.inspector_name
      SET qi.inspector_id = COALESCE(u.id, ?)
      WHERE qi.inspector_id IS NULL
        AND qi.deleted_at IS NULL
      `,
      [adminId]
    );
  }

  // 剩余孤儿
  await knex('quality_inspections')
    .whereNull('inspector_id')
    .update({ inspector_id: adminId });
};

exports.down = async function down() {
  // 不回滚历史 owner
};
