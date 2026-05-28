exports.config = { transaction: false };

const EMPTY_UNUSED_TABLES = [
  'accounting_periods',
  'batch_inventory',
  'batch_traceability_relations',
  'bom_change_logs',
  'bom_references',
  'fifo_outbound_queue',
  'material_supply_records',
  'material_template_mappings',
  'partial_outbound_config',
  'reconciliation_items',
  'refresh_tokens',
  'role_data_departments',
  'security_logs',
  'todo_notifications',
  'traceability_chain_steps',
  'traceability_chains',
];

const CORE_INDEXES = [
  ['ap_payments', 'idx_ap_payments_bank_account_id', ['bank_account_id']],
  ['ar_receipts', 'idx_ar_receipts_bank_account_id', ['bank_account_id']],
  ['asset_impairments', 'idx_asset_impairments_gl_entry_id', ['gl_entry_id']],
  ['expenses', 'idx_expenses_payment_bank_account_id', ['payment_bank_account_id']],
  ['expenses', 'idx_expenses_payment_transaction_id', ['payment_transaction_id']],
  ['gl_entry_items', 'idx_gl_entry_items_cost_center_id', ['cost_center_id']],
  ['gl_entry_items', 'idx_gl_entry_items_customer_id', ['customer_id']],
  ['gl_entry_items', 'idx_gl_entry_items_supplier_id', ['supplier_id']],
  ['gl_entry_items', 'idx_gl_entry_items_employee_id', ['employee_id']],
  ['inventory_ledger', 'idx_inventory_ledger_receipt_id', ['receipt_id']],
  ['inventory_ledger', 'idx_inventory_ledger_purchase_order_id', ['purchase_order_id']],
  ['inventory_ledger', 'idx_inventory_ledger_supplier_id', ['supplier_id']],
  ['inventory_outbound', 'idx_inventory_outbound_customer_id', ['customer_id']],
  ['materials', 'idx_materials_unit_id', ['unit_id']],
  ['production_plans', 'idx_production_plans_bom_id', ['bom_id']],
  ['production_tasks', 'idx_production_tasks_product_id', ['product_id']],
  ['purchase_receipt_items', 'idx_purchase_receipt_items_order_item_id', ['order_item_id']],
  ['purchase_receipt_items', 'idx_purchase_receipt_items_unit_id', ['unit_id']],
  ['quality_inspections', 'idx_quality_inspections_task_id', ['task_id']],
  ['quality_inspections', 'idx_quality_inspections_template_id', ['template_id']],
  ['quality_inspections', 'idx_quality_inspections_inspector_id', ['inspector_id']],
  ['quality_inspections', 'idx_quality_inspections_aql_standard_id', ['aql_standard_id']],
  ['sales_outbound_items', 'idx_sales_outbound_items_source_order_id', ['source_order_id']],
  ['standard_costs', 'idx_standard_costs_version_id', ['version_id']],
];

function q(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

function normalizeRows(result) {
  return Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
}

async function currentDatabase(knex) {
  const rows = normalizeRows(await knex.raw('SELECT DATABASE() AS db_name'));
  return rows[0].db_name;
}

async function tableExists(knex, tableName) {
  const [rows] = await knex.raw(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = ?`,
    [tableName]
  );
  return Number(rows[0].cnt) > 0;
}

async function tableIsEmpty(knex, tableName) {
  const [rows] = await knex.raw(`SELECT COUNT(*) AS cnt FROM ${q(tableName)}`);
  return Number(rows[0].cnt) === 0;
}

async function indexExists(knex, tableName, indexName) {
  const [rows] = await knex.raw(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND index_name = ?`,
    [tableName, indexName]
  );
  return Number(rows[0].cnt) > 0;
}

async function exactIndexExists(knex, tableName, columns) {
  const [rows] = await knex.raw(
    `SELECT index_name,
            GROUP_CONCAT(column_name ORDER BY seq_in_index) AS cols
       FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = ?
      GROUP BY index_name
     HAVING cols = ?`,
    [tableName, columns.join(',')]
  );
  return rows.length > 0;
}

async function columnExists(knex, tableName, columnName) {
  const [rows] = await knex.raw(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND column_name = ?`,
    [tableName, columnName]
  );
  return Number(rows[0].cnt) > 0;
}

async function addIndexIfUseful(knex, tableName, indexName, columns) {
  if (!(await tableExists(knex, tableName))) return;
  if (await indexExists(knex, tableName, indexName)) return;
  for (const column of columns) {
    if (!(await columnExists(knex, tableName, column))) return;
  }
  if (await exactIndexExists(knex, tableName, columns)) return;

  await knex.raw(
    `ALTER TABLE ${q(tableName)} ADD INDEX ${q(indexName)} (${columns.map(q).join(', ')})`
  );
}

async function fetchExactDuplicateIndexes(knex) {
  const dbName = await currentDatabase(knex);
  const [rows] = await knex.raw(
    `SELECT table_name AS tableName,
            index_name AS indexName,
            non_unique AS nonUnique,
            GROUP_CONCAT(column_name ORDER BY seq_in_index) AS cols
       FROM information_schema.statistics
      WHERE table_schema = ?
        AND index_name <> 'PRIMARY'
      GROUP BY table_name, index_name, non_unique`,
    [dbName]
  );

  const [fkRows] = await knex.raw(
    `SELECT table_name AS tableName,
            constraint_name AS constraintName
       FROM information_schema.key_column_usage
      WHERE table_schema = ?
        AND referenced_table_name IS NOT NULL`,
    [dbName]
  );
  const fkConstraintNames = new Set(
    fkRows.map((row) => `${row.tableName}.${row.constraintName}`)
  );

  const groups = new Map();
  for (const row of rows) {
    const key = `${row.tableName}|${row.cols}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({
      tableName: row.tableName,
      indexName: row.indexName,
      nonUnique: Number(row.nonUnique),
      columns: row.cols,
      isForeignKeyName: fkConstraintNames.has(`${row.tableName}.${row.indexName}`),
    });
  }

  return [...groups.values()].filter((group) => group.length > 1);
}

function indexScore(index) {
  let score = 0;
  if (index.nonUnique === 0) score += 100;
  if (index.isForeignKeyName) score += 80;
  if (/^(uk_|unique_)/i.test(index.indexName)) score += 40;
  if (/^idx_/i.test(index.indexName)) score += 20;
  if (/^fk_/i.test(index.indexName)) score += 10;
  return score;
}

async function dropExactDuplicateIndexes(knex) {
  const duplicateGroups = await fetchExactDuplicateIndexes(knex);
  for (const group of duplicateGroups) {
    const sorted = [...group].sort((a, b) => {
      const scoreDiff = indexScore(b) - indexScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      return a.indexName.localeCompare(b.indexName);
    });
    const keep = sorted[0];
    const drops = sorted
      .slice(1)
      .filter((index) => !index.isForeignKeyName)
      .filter((index) => index.indexName !== keep.indexName);

    for (const index of drops) {
      if (!(await indexExists(knex, index.tableName, index.indexName))) continue;
      try {
        await knex.raw(`ALTER TABLE ${q(index.tableName)} DROP INDEX ${q(index.indexName)}`);
      } catch (error) {
        if (!String(error.message || '').includes('needed in a foreign key constraint')) {
          throw error;
        }
      }
    }
  }
}

async function archiveEmptyUnusedTables(knex) {
  for (const tableName of EMPTY_UNUSED_TABLES) {
    const archiveName = `archive_20260522_${tableName}`;
    if (!(await tableExists(knex, tableName))) continue;
    if (await tableExists(knex, archiveName)) continue;
    if (!(await tableIsEmpty(knex, tableName))) continue;
    await knex.raw(`RENAME TABLE ${q(tableName)} TO ${q(archiveName)}`);
  }
}

exports.up = async function up(knex) {
  await dropExactDuplicateIndexes(knex);

  for (const [tableName, indexName, columns] of CORE_INDEXES) {
    await addIndexIfUseful(knex, tableName, indexName, columns);
  }

  await archiveEmptyUnusedTables(knex);
};

exports.down = async function down(knex) {
  for (const tableName of EMPTY_UNUSED_TABLES.slice().reverse()) {
    const archiveName = `archive_20260522_${tableName}`;
    if (await tableExists(knex, tableName)) continue;
    if (!(await tableExists(knex, archiveName))) continue;
    await knex.raw(`RENAME TABLE ${q(archiveName)} TO ${q(tableName)}`);
  }
};
