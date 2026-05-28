async function hasColumn(knex, tableName, columnName) {
  const exists = await knex.schema.hasTable(tableName);
  if (!exists) return false;
  return knex.schema.hasColumn(tableName, columnName);
}

async function hasIndex(knex, tableName, indexName) {
  const [rows] = await knex.raw(
    `SELECT 1
       FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND index_name = ?
      LIMIT 1`,
    [tableName, indexName]
  );
  return rows.length > 0;
}

async function addColumnIfMissing(knex, tableName, columnName, definition) {
  if (!(await hasColumn(knex, tableName, columnName))) {
    await knex.raw(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
  }
}

exports.up = async function up(knex) {
  const tableExists = await knex.schema.hasTable('asset_categories');
  if (!tableExists) return;

  await addColumnIfMissing(
    knex,
    'asset_categories',
    'default_useful_life',
    'INT NOT NULL DEFAULT 5 AFTER code'
  );
  await addColumnIfMissing(
    knex,
    'asset_categories',
    'default_depreciation_method',
    "VARCHAR(50) NOT NULL DEFAULT 'straight_line' AFTER default_useful_life"
  );
  await addColumnIfMissing(
    knex,
    'asset_categories',
    'default_salvage_rate',
    'DECIMAL(5,2) NOT NULL DEFAULT 5.00 AFTER default_depreciation_method'
  );

  const hasUsefulLife = await hasColumn(knex, 'asset_categories', 'useful_life');
  if (hasUsefulLife) {
    await knex.raw(`
      UPDATE asset_categories
         SET default_useful_life = GREATEST(1, CEIL(COALESCE(useful_life, 60) / 12))
       WHERE default_useful_life IS NULL OR default_useful_life = 5
    `);
  }

  const hasDepreciationMethod = await hasColumn(knex, 'asset_categories', 'depreciation_method');
  if (hasDepreciationMethod) {
    await knex.raw(`
      UPDATE asset_categories
         SET default_depreciation_method = COALESCE(depreciation_method, default_depreciation_method, 'straight_line')
       WHERE default_depreciation_method IS NULL OR default_depreciation_method = ''
    `);
  }

  const hasResidualRate = await hasColumn(knex, 'asset_categories', 'residual_rate');
  if (hasResidualRate) {
    await knex.raw(`
      UPDATE asset_categories
         SET default_salvage_rate = COALESCE(residual_rate, default_salvage_rate, 5.00)
       WHERE default_salvage_rate IS NULL
    `);
  }

  if (!(await hasIndex(knex, 'asset_categories', 'uk_asset_categories_code'))) {
    const [duplicates] = await knex.raw(`
      SELECT code
        FROM asset_categories
       WHERE code IS NOT NULL AND code <> ''
       GROUP BY code
      HAVING COUNT(*) > 1
      LIMIT 1
    `);
    if (duplicates.length === 0) {
      await knex.raw('ALTER TABLE `asset_categories` ADD UNIQUE INDEX uk_asset_categories_code (`code`)');
    }
  }
};

exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable('asset_categories'))) return;

  const columns = ['default_salvage_rate', 'default_depreciation_method', 'default_useful_life'];
  for (const column of columns) {
    if (await hasColumn(knex, 'asset_categories', column)) {
      await knex.raw(`ALTER TABLE \`asset_categories\` DROP COLUMN \`${column}\``);
    }
  }
};
