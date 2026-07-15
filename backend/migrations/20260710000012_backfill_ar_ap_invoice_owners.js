/**
 * 回填 AR/AP 发票空 created_by（自动生成链路曾漏写列）
 * 优先：源单 created_by → updated_by → admin
 */

async function resolveAdminUserId(knex) {
  const admin = await knex('users')
    .where({ username: 'admin' })
    .orWhere('role', 'admin')
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

  if (await knex.schema.hasTable('ar_invoices')) {
    if (await knex.schema.hasTable('sales_orders')) {
      await knex.raw(
        `UPDATE ar_invoices a
         INNER JOIN sales_orders so
           ON a.source_type = 'sales_order' AND a.source_id = so.id
         SET a.created_by = so.created_by
         WHERE a.created_by IS NULL AND so.created_by IS NOT NULL`
      );
    }
    if (await knex.schema.hasColumn('ar_invoices', 'updated_by')) {
      await knex.raw(
        `UPDATE ar_invoices SET created_by = updated_by
         WHERE created_by IS NULL AND updated_by IS NOT NULL`
      );
    }
    await knex.raw(`UPDATE ar_invoices SET created_by = ? WHERE created_by IS NULL`, [adminId]);
    if (await knex.schema.hasColumn('ar_invoices', 'updated_by')) {
      await knex.raw(
        `UPDATE ar_invoices SET updated_by = created_by WHERE updated_by IS NULL AND created_by IS NOT NULL`
      );
    }
  }

  if (await knex.schema.hasTable('ap_invoices')) {
    if (await knex.schema.hasTable('purchase_receipts')) {
      await knex.raw(
        `UPDATE ap_invoices a
         INNER JOIN purchase_receipts pr
           ON a.source_type = 'purchase_receipt' AND a.source_id = pr.id
         SET a.created_by = pr.created_by
         WHERE a.created_by IS NULL AND pr.created_by IS NOT NULL`
      );
    }
    if (await knex.schema.hasTable('purchase_orders')) {
      await knex.raw(
        `UPDATE ap_invoices a
         INNER JOIN purchase_orders po
           ON a.source_type = 'purchase_order' AND a.source_id = po.id
         SET a.created_by = po.created_by
         WHERE a.created_by IS NULL AND po.created_by IS NOT NULL`
      );
    }
    if (await knex.schema.hasColumn('ap_invoices', 'updated_by')) {
      await knex.raw(
        `UPDATE ap_invoices SET created_by = updated_by
         WHERE created_by IS NULL AND updated_by IS NOT NULL`
      );
    }
    await knex.raw(`UPDATE ap_invoices SET created_by = ? WHERE created_by IS NULL`, [adminId]);
    if (await knex.schema.hasColumn('ap_invoices', 'updated_by')) {
      await knex.raw(
        `UPDATE ap_invoices SET updated_by = created_by WHERE updated_by IS NULL AND created_by IS NOT NULL`
      );
    }
  }
};

exports.down = async function down() {
  // 不回滚 owner 回填
};
