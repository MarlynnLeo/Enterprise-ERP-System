async function hasTable(knex, tableName) {
  return knex.schema.hasTable(tableName);
}

async function ensureAuditTable(knex) {
  if (await hasTable(knex, 'finance_data_repair_audit')) return;

  await knex.schema.createTable('finance_data_repair_audit', (table) => {
    table.increments('id').primary();
    table.string('repair_key', 100).notNullable();
    table.string('scope', 50).notNullable();
    table.string('metric', 100).notNullable();
    table.string('value', 100).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.index(['repair_key', 'scope'], 'idx_finance_repair_audit_scope');
  });
}

async function logRepair(trx, scope, metric, value) {
  await trx('finance_data_repair_audit').insert({
    repair_key: '20260518000003_repair_gl_draft_rounding',
    scope,
    metric,
    value: String(value ?? 0),
    created_at: trx.fn.now(),
  });
}

exports.up = async function up(knex) {
  await ensureAuditTable(knex);

  if (!(await hasTable(knex, 'gl_entries')) || !(await hasTable(knex, 'gl_entry_items'))) {
    return;
  }

  await knex.transaction(async (trx) => {
    const [creditResult] = await trx.raw(`
      UPDATE gl_entry_items target
      JOIN (
        SELECT e.id AS entry_id,
               MAX(CASE WHEN i.credit_amount > 0 THEN i.id ELSE NULL END) AS target_item_id,
               ROUND(SUM(i.debit_amount) - SUM(i.credit_amount), 2) AS diff_amount
        FROM gl_entries e
        JOIN gl_entry_items i ON i.entry_id = e.id
        WHERE e.status = 'draft'
          AND COALESCE(e.is_posted, 0) = 0
        GROUP BY e.id
        HAVING diff_amount = 0.01
           AND target_item_id IS NOT NULL
      ) x ON x.target_item_id = target.id
      SET target.credit_amount = ROUND(target.credit_amount + x.diff_amount, 2)
    `);
    await logRepair(trx, 'gl', 'draft_credit_rounding_adjustments', creditResult.affectedRows);

    const [debitResult] = await trx.raw(`
      UPDATE gl_entry_items target
      JOIN (
        SELECT e.id AS entry_id,
               MAX(CASE WHEN i.debit_amount > 0 THEN i.id ELSE NULL END) AS target_item_id,
               ROUND(SUM(i.debit_amount) - SUM(i.credit_amount), 2) AS diff_amount
        FROM gl_entries e
        JOIN gl_entry_items i ON i.entry_id = e.id
        WHERE e.status = 'draft'
          AND COALESCE(e.is_posted, 0) = 0
        GROUP BY e.id
        HAVING diff_amount = -0.01
           AND target_item_id IS NOT NULL
      ) x ON x.target_item_id = target.id
      SET target.debit_amount = ROUND(target.debit_amount - x.diff_amount, 2)
    `);
    await logRepair(trx, 'gl', 'draft_debit_rounding_adjustments', debitResult.affectedRows);
  });
};

exports.down = async function down() {
  // Financial rounding repair is intentionally not rolled back.
};
