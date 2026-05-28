/**
 * Remove orphan general-ledger entry item rows left by test data repairs.
 * These detail rows cannot be surfaced safely because their header voucher no
 * longer exists.
 */

const REPAIR_KEY = '20260521000009_repair_gl_orphan_entry_items';

async function audit(trx, metric, value) {
  const hasAuditTable = await trx.schema.hasTable('finance_data_repair_audit');
  if (!hasAuditTable) return;

  await trx('finance_data_repair_audit').insert({
    repair_key: REPAIR_KEY,
    scope: 'finance_gl',
    metric,
    value: String(value),
  });
}

async function countOrphans(trx) {
  const row = await trx('gl_entry_items as item')
    .leftJoin('gl_entries as entry', 'entry.id', 'item.entry_id')
    .whereNull('entry.id')
    .count({ count: '*' })
    .first();

  return Number(row?.count || 0);
}

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    const before = await countOrphans(trx);
    await audit(trx, 'gl_entry_items_orphans_before', before);

    if (before > 0) {
      await trx('gl_entry_items')
        .whereNotExists(function orphanHeader() {
          this.select(1)
            .from('gl_entries')
            .whereRaw('gl_entries.id = gl_entry_items.entry_id');
        })
        .del();
    }

    const after = await countOrphans(trx);
    await audit(trx, 'gl_entry_items_orphans_after', after);
  });
};

exports.down = async function down() {
  // Test-data cleanup is intentionally not reversible.
};
