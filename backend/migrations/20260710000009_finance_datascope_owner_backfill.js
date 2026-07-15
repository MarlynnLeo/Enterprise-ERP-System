/**
 * 财务单据 owner 回填 — DataScope 行级闭环
 * - 历史 AR/AP 发票 created_by 大量为 NULL，行级 SELF/DEPT 会失败关闭
 * - 优先：updated_by → 关联销售/采购订单 created_by → admin
 * - bank_transactions 同理
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

async function backfillIfColumn(knex, table, adminId) {
  const has = await knex.schema.hasTable(table);
  if (!has) return;
  const hasCol = await knex.schema.hasColumn(table, 'created_by');
  if (!hasCol) return;

  // updated_by
  if (await knex.schema.hasColumn(table, 'updated_by')) {
    await knex.raw(
      `UPDATE \`${table}\` SET created_by = updated_by
       WHERE created_by IS NULL AND updated_by IS NOT NULL`
    );
  }

  await knex.raw(
    `UPDATE \`${table}\` SET created_by = ?
     WHERE created_by IS NULL`,
    [adminId]
  );
}

exports.up = async function up(knex) {
  const adminId = await resolveAdminUserId(knex);

  // AR：优先从销售订单回填
  if (
    (await knex.schema.hasTable('ar_invoices')) &&
    (await knex.schema.hasColumn('ar_invoices', 'created_by'))
  ) {
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
    await knex.raw(
      `UPDATE ar_invoices SET created_by = ? WHERE created_by IS NULL`,
      [adminId]
    );
  }

  // AP：优先从采购订单回填
  if (
    (await knex.schema.hasTable('ap_invoices')) &&
    (await knex.schema.hasColumn('ap_invoices', 'created_by'))
  ) {
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
    await knex.raw(
      `UPDATE ap_invoices SET created_by = ? WHERE created_by IS NULL`,
      [adminId]
    );
  }

  for (const t of [
    'ar_receipts',
    'ap_payments',
    'gl_entries',
    'bank_transactions',
    'cash_transactions',
    'expenses',
  ]) {
    await backfillIfColumn(knex, t, adminId);
  }
};

exports.down = async function down() {
  // 不回滚历史 owner 回填
};
