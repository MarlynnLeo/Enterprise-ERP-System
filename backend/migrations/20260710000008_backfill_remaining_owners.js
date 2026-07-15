/**
 * 回填剩余空 owner，保证 DataScope 列表不出现幽灵单
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
  const adminId = await resolveAdminUserId(knex);

  if (await knex.schema.hasColumn('inventory_inbound', 'created_by')) {
    await knex.raw(
      `
      UPDATE inventory_inbound i
      LEFT JOIN users u ON
        BINARY u.username = BINARY i.operator OR BINARY u.real_name = BINARY i.operator
      SET i.created_by = COALESCE(u.id, ?)
      WHERE i.created_by IS NULL
      `,
      [adminId]
    );
  }

  if (await knex.schema.hasColumn('quality_inspections', 'inspector_id')) {
    await knex.raw(
      `
      UPDATE quality_inspections qi
      LEFT JOIN users u ON
        BINARY u.username = BINARY qi.inspector_name
        OR BINARY u.real_name = BINARY qi.inspector_name
      SET qi.inspector_id = COALESCE(u.id, ?)
      WHERE qi.inspector_id IS NULL
      `,
      [adminId]
    );
  }
};

exports.down = async function down() {};
