async function hasTable(knex, tableName) {
  return knex.schema.hasTable(tableName);
}

async function addColumnIfMissing(knex, tableName, columnName, definition) {
  if (!(await hasTable(knex, tableName))) return;
  const exists = await knex.schema.hasColumn(tableName, columnName);
  if (!exists) {
    await knex.raw(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
  }
}

async function modifyColumnIfExists(knex, tableName, columnName, definition) {
  if (!(await hasTable(knex, tableName))) return;
  const exists = await knex.schema.hasColumn(tableName, columnName);
  if (exists) {
    await knex.raw(`ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${columnName}\` ${definition}`);
  }
}

exports.up = async function up(knex) {
  await addColumnIfMissing(knex, 'purchase_orders', 'tax_rate', 'DECIMAL(8,6) NOT NULL DEFAULT 0');
  await addColumnIfMissing(knex, 'purchase_orders', 'tax_amount', 'DECIMAL(15,2) NOT NULL DEFAULT 0');
  await addColumnIfMissing(knex, 'purchase_orders', 'subtotal', 'DECIMAL(15,2) NOT NULL DEFAULT 0');

  await addColumnIfMissing(knex, 'purchase_order_items', 'material_code', 'VARCHAR(100) NULL');
  await addColumnIfMissing(knex, 'purchase_order_items', 'material_name', 'VARCHAR(255) NULL');
  await addColumnIfMissing(knex, 'purchase_order_items', 'specification', 'VARCHAR(255) NULL');
  await addColumnIfMissing(knex, 'purchase_order_items', 'unit', 'VARCHAR(50) NULL');
  await addColumnIfMissing(knex, 'purchase_order_items', 'unit_id', 'INT NULL');
  await addColumnIfMissing(knex, 'purchase_order_items', 'price', 'DECIMAL(15,4) NOT NULL DEFAULT 0');
  await addColumnIfMissing(knex, 'purchase_order_items', 'total', 'DECIMAL(15,2) NOT NULL DEFAULT 0');
  await addColumnIfMissing(knex, 'purchase_order_items', 'tax_amount', 'DECIMAL(15,2) NOT NULL DEFAULT 0');
  await modifyColumnIfExists(knex, 'purchase_order_items', 'unit_price', 'DECIMAL(15,4) NOT NULL DEFAULT 0');
  await modifyColumnIfExists(knex, 'purchase_order_items', 'amount', 'DECIMAL(15,2) NOT NULL DEFAULT 0');
  await modifyColumnIfExists(knex, 'purchase_order_items', 'tax_rate', 'DECIMAL(8,6) NOT NULL DEFAULT 0');

  await addColumnIfMissing(knex, 'sales_orders', 'tax_rate', 'DECIMAL(8,6) NOT NULL DEFAULT 0');
  await addColumnIfMissing(knex, 'sales_orders', 'tax_amount', 'DECIMAL(15,2) NOT NULL DEFAULT 0');
  await addColumnIfMissing(knex, 'sales_orders', 'subtotal', 'DECIMAL(15,2) NOT NULL DEFAULT 0');

  await addColumnIfMissing(knex, 'sales_order_items', 'amount', 'DECIMAL(15,2) NOT NULL DEFAULT 0');
  await addColumnIfMissing(knex, 'sales_order_items', 'remark', 'TEXT NULL');
  await addColumnIfMissing(knex, 'sales_order_items', 'product_code', 'VARCHAR(100) NULL');
  await addColumnIfMissing(knex, 'sales_order_items', 'product_specs', 'VARCHAR(255) NULL');
  await modifyColumnIfExists(knex, 'sales_order_items', 'total_price', 'DECIMAL(15,2) NOT NULL DEFAULT 0');
  await modifyColumnIfExists(knex, 'sales_order_items', 'unit_price', 'DECIMAL(15,4) NOT NULL DEFAULT 0');
  await modifyColumnIfExists(knex, 'sales_order_items', 'tax_percent', 'DECIMAL(8,6) NOT NULL DEFAULT 0');

  await addColumnIfMissing(knex, 'sales_outbound', 'total_amount', 'DECIMAL(15,2) NOT NULL DEFAULT 0');
  await addColumnIfMissing(knex, 'sales_outbound_items', 'price', 'DECIMAL(15,4) NOT NULL DEFAULT 0');
  await addColumnIfMissing(knex, 'sales_outbound_items', 'amount', 'DECIMAL(15,2) NOT NULL DEFAULT 0');
  await addColumnIfMissing(knex, 'sales_outbound_items', 'unit_id', 'INT NULL');
  await addColumnIfMissing(knex, 'sales_outbound_items', 'remarks', 'TEXT NULL');
};

exports.down = async function down() {
  // Schema hardening is intentionally not rolled back.
};
