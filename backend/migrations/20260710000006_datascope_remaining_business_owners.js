/**
 * 剩余业务单据 owner 字段闭环：
 * - purchase_requisitions / purchase_receipts / purchase_returns
 * - inventory_transfers
 * 并做历史回填（operator/requester/creator → users.id，否则 admin）
 */

async function ensureColumn(knex, table, column, builder) {
  const has = await knex.schema.hasColumn(table, column);
  if (!has) {
    await knex.schema.alterTable(table, builder);
  }
}

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

async function backfillFromUserText(knex, table, textColumn, adminId) {
  const hasCreated = await knex.schema.hasColumn(table, 'created_by');
  const hasText = await knex.schema.hasColumn(table, textColumn);
  if (!hasCreated || !hasText) return;

  await knex.raw(
    `
    UPDATE \`${table}\` t
    LEFT JOIN users u ON
      BINARY u.username = BINARY t.\`${textColumn}\`
      OR BINARY u.real_name = BINARY t.\`${textColumn}\`
    SET t.created_by = COALESCE(u.id, ?)
    WHERE t.created_by IS NULL
    `,
    [adminId]
  );
}

exports.up = async function up(knex) {
  const adminId = await resolveAdminUserId(knex);

  for (const table of [
    'purchase_requisitions',
    'purchase_receipts',
    'purchase_returns',
    'inventory_transfers',
  ]) {
    const exists = await knex.schema.hasTable(table);
    if (!exists) continue;
    await ensureColumn(knex, table, 'created_by', (t) => {
      t.integer('created_by').nullable().comment('Creator user id for data-scope authorization');
    });
  }

  // requisition: requester 常为 username
  await backfillFromUserText(knex, 'purchase_requisitions', 'requester', adminId);
  await backfillFromUserText(knex, 'purchase_receipts', 'operator', adminId);
  await backfillFromUserText(knex, 'purchase_returns', 'operator', adminId);
  await backfillFromUserText(knex, 'inventory_transfers', 'creator', adminId);

  // 仍为空 → admin
  for (const table of [
    'purchase_requisitions',
    'purchase_receipts',
    'purchase_returns',
    'inventory_transfers',
  ]) {
    if (!(await knex.schema.hasTable(table))) continue;
    if (!(await knex.schema.hasColumn(table, 'created_by'))) continue;
    await knex(table).whereNull('created_by').update({ created_by: adminId });
  }
};

exports.down = async function down(knex) {
  for (const table of [
    'purchase_requisitions',
    'purchase_receipts',
    'purchase_returns',
    'inventory_transfers',
  ]) {
    if (!(await knex.schema.hasTable(table))) continue;
    if (await knex.schema.hasColumn(table, 'created_by')) {
      await knex.schema.alterTable(table, (t) => t.dropColumn('created_by'));
    }
  }
};
