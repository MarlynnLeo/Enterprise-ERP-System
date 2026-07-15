/**
 * 历史单据 owner 兜底回填
 * - 能映射 operator/manager 的优先映射
 * - 仍为空的归到 admin 用户，避免 DEPT/SELF 下「幽灵单据」无人可管
 *   （admin data_scope=ALL 仍可全局治理；业务角色按 owner 隔离）
 */

async function resolveAdminUserId(knex) {
  const admin = await knex('users')
    .where({ role: 'admin' })
    .orWhere('username', 'admin')
    .orderBy('id', 'asc')
    .first();
  if (admin?.id) return admin.id;

  const viaRole = await knex('users as u')
    .join('user_roles as ur', 'ur.user_id', 'u.id')
    .join('roles as r', 'r.id', 'ur.role_id')
    .where('r.code', 'admin')
    .select('u.id')
    .first();
  return viaRole?.id || 1;
}

exports.up = async function up(knex) {
  const adminId = await resolveAdminUserId(knex);

  // inventory_inbound
  if (await knex.schema.hasColumn('inventory_inbound', 'created_by')) {
    await knex.raw(`
      UPDATE inventory_inbound i
      LEFT JOIN users u ON
        BINARY u.username = BINARY i.operator OR BINARY u.real_name = BINARY i.operator
      SET i.created_by = COALESCE(u.id, ?)
      WHERE i.created_by IS NULL
    `, [adminId]);
  }

  // inventory_outbound
  if (await knex.schema.hasColumn('inventory_outbound', 'created_by')) {
    await knex.raw(`
      UPDATE inventory_outbound o
      LEFT JOIN users u ON
        BINARY u.username = BINARY o.operator OR BINARY u.real_name = BINARY o.operator
      SET o.created_by = COALESCE(u.id, ?)
      WHERE o.created_by IS NULL
    `, [adminId]);
  }

  // production_tasks
  if (await knex.schema.hasColumn('production_tasks', 'created_by')) {
    await knex.raw(`
      UPDATE production_tasks t
      LEFT JOIN users u ON
        BINARY u.username = BINARY t.manager OR BINARY u.real_name = BINARY t.manager
      SET t.created_by = COALESCE(u.id, ?)
      WHERE t.created_by IS NULL
    `, [adminId]);
  }

  // purchase_orders
  if (await knex.schema.hasColumn('purchase_orders', 'created_by')) {
    await knex.raw(`
      UPDATE purchase_orders
      SET created_by = ?
      WHERE created_by IS NULL
    `, [adminId]);
  }
};

exports.down = async function down() {
  // 不回滚历史 owner 回填
};
