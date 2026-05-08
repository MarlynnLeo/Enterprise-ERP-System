/**
 * Harden fixed asset depreciation detail traceability.
 *
 * The finance workflow writes accumulated depreciation, net value and the
 * generated GL entry back to fixed_asset_depreciation_details. Older baseline
 * databases may not have those columns, so this migration is additive and
 * idempotent.
 */

async function hasIndex(knex, tableName, indexName) {
  const [rows] = await knex.raw(`SHOW INDEX FROM \`${tableName}\` WHERE Key_name = ?`, [
    indexName,
  ]);
  return rows.length > 0;
}

exports.up = async function up(knex) {
  const tableName = 'fixed_asset_depreciation_details';
  const exists = await knex.schema.hasTable(tableName);
  if (!exists) return;

  const hasAccumulated = await knex.schema.hasColumn(tableName, 'accumulated_depreciation');
  const hasNetValue = await knex.schema.hasColumn(tableName, 'net_value');
  const hasEntryId = await knex.schema.hasColumn(tableName, 'entry_id');

  if (!hasAccumulated || !hasNetValue || !hasEntryId) {
    await knex.schema.alterTable(tableName, (table) => {
      if (!hasAccumulated) {
        table.decimal('accumulated_depreciation', 15, 2).nullable().after('depreciation_amount');
      }
      if (!hasNetValue) {
        table.decimal('net_value', 15, 2).nullable().after('accumulated_depreciation');
      }
      if (!hasEntryId) {
        table.integer('entry_id').nullable().after('voucher_no');
      }
    });
  }

  if (!(await hasIndex(knex, tableName, 'idx_depreciation_entry_id'))) {
    await knex.schema.alterTable(tableName, (table) => {
      table.index(['entry_id'], 'idx_depreciation_entry_id');
    });
  }

  if (await hasIndex(knex, tableName, 'uniq_asset_depreciation_date')) {
    return;
  }

  const [duplicates] = await knex.raw(
    `SELECT asset_id, depreciation_date, COUNT(*) AS count
     FROM fixed_asset_depreciation_details
     GROUP BY asset_id, depreciation_date
     HAVING COUNT(*) > 1
     LIMIT 1`
  );

  if (duplicates.length === 0) {
    await knex.schema.alterTable(tableName, (table) => {
      table.unique(['asset_id', 'depreciation_date'], 'uniq_asset_depreciation_date');
    });
  } else if (!(await hasIndex(knex, tableName, 'idx_asset_depreciation_date_guard'))) {
    await knex.schema.alterTable(tableName, (table) => {
      table.index(['asset_id', 'depreciation_date'], 'idx_asset_depreciation_date_guard');
    });
  }
};

exports.down = async function down(knex) {
  const tableName = 'fixed_asset_depreciation_details';
  const exists = await knex.schema.hasTable(tableName);
  if (!exists) return;

  if (await hasIndex(knex, tableName, 'uniq_asset_depreciation_date')) {
    await knex.schema.alterTable(tableName, (table) => {
      table.dropUnique(['asset_id', 'depreciation_date'], 'uniq_asset_depreciation_date');
    });
  }

  if (await hasIndex(knex, tableName, 'idx_asset_depreciation_date_guard')) {
    await knex.schema.alterTable(tableName, (table) => {
      table.dropIndex(['asset_id', 'depreciation_date'], 'idx_asset_depreciation_date_guard');
    });
  }

  if (await hasIndex(knex, tableName, 'idx_depreciation_entry_id')) {
    await knex.schema.alterTable(tableName, (table) => {
      table.dropIndex(['entry_id'], 'idx_depreciation_entry_id');
    });
  }

  const hasEntryId = await knex.schema.hasColumn(tableName, 'entry_id');
  const hasNetValue = await knex.schema.hasColumn(tableName, 'net_value');
  const hasAccumulated = await knex.schema.hasColumn(tableName, 'accumulated_depreciation');

  if (hasEntryId || hasNetValue || hasAccumulated) {
    await knex.schema.alterTable(tableName, (table) => {
      if (hasEntryId) table.dropColumn('entry_id');
      if (hasNetValue) table.dropColumn('net_value');
      if (hasAccumulated) table.dropColumn('accumulated_depreciation');
    });
  }
};
