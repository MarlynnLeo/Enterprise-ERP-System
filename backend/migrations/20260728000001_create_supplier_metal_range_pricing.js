/**
 * Create supplier metal range pricing tables and snapshot columns on purchase documents.
 */

async function addColumnIfMissing(knex, tableName, columnName, defineColumn) {
  if (!(await knex.schema.hasTable(tableName))) return;
  if (await knex.schema.hasColumn(tableName, columnName)) return;
  await knex.schema.alterTable(tableName, (table) => defineColumn(table));
}

exports.up = async function up(knex) {
  await knex.schema.dropTableIfExists('supplier_metal_price_item_bands');
  await knex.schema.dropTableIfExists('supplier_metal_price_items');
  await knex.schema.dropTableIfExists('supplier_metal_price_bands');
  await knex.schema.dropTableIfExists('supplier_metal_price_schemes');

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS supplier_metal_price_schemes (
      id INT NOT NULL AUTO_INCREMENT,
      supplier_id INT NOT NULL,
      name VARCHAR(100) NOT NULL,
      metal_symbol VARCHAR(32) NOT NULL DEFAULT 'ALUMINUM',
      metal_unit VARCHAR(50) NOT NULL DEFAULT 'CNY/ton',
      band_step DECIMAL(18,4) NOT NULL DEFAULT 1000,
      is_enabled TINYINT(1) NOT NULL DEFAULT 1,
      is_default TINYINT(1) NOT NULL DEFAULT 0,
      effective_from DATE NULL,
      effective_to DATE NULL,
      remark TEXT NULL,
      created_by INT NULL,
      updated_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_supplier_metal_scheme_enabled (supplier_id, is_enabled),
      INDEX idx_supplier_metal_scheme_symbol (supplier_id, metal_symbol),
      CONSTRAINT fk_supplier_metal_scheme_supplier
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS supplier_metal_price_bands (
      id INT NOT NULL AUTO_INCREMENT,
      scheme_id INT NOT NULL,
      band_index INT NOT NULL DEFAULT 0,
      metal_price_min DECIMAL(18,4) NOT NULL,
      metal_price_max DECIMAL(18,4) NOT NULL,
      label VARCHAR(100) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_supplier_metal_band_index (scheme_id, band_index),
      INDEX idx_supplier_metal_band_range (scheme_id, metal_price_min, metal_price_max),
      CONSTRAINT fk_supplier_metal_band_scheme
        FOREIGN KEY (scheme_id) REFERENCES supplier_metal_price_schemes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS supplier_metal_price_items (
      id INT NOT NULL AUTO_INCREMENT,
      scheme_id INT NOT NULL,
      material_id INT NULL,
      material_code VARCHAR(100) NOT NULL,
      material_name VARCHAR(255) NULL,
      specification VARCHAR(255) NULL,
      processing_fee DECIMAL(18,6) NULL,
      unit_weight_g DECIMAL(18,6) NULL,
      price_step DECIMAL(18,6) NULL,
      remark TEXT NULL,
      is_enabled TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_supplier_metal_item_code (scheme_id, material_code),
      INDEX idx_supplier_metal_item_material (scheme_id, material_id),
      INDEX idx_supplier_metal_item_code (material_code),
      CONSTRAINT fk_supplier_metal_item_scheme
        FOREIGN KEY (scheme_id) REFERENCES supplier_metal_price_schemes(id) ON DELETE CASCADE,
      CONSTRAINT fk_supplier_metal_item_material
        FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS supplier_metal_price_item_bands (
      id INT NOT NULL AUTO_INCREMENT,
      item_id INT NOT NULL,
      band_id INT NOT NULL,
      unit_price DECIMAL(18,6) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_supplier_metal_item_band (item_id, band_id),
      CONSTRAINT fk_supplier_metal_item_band_item
        FOREIGN KEY (item_id) REFERENCES supplier_metal_price_items(id) ON DELETE CASCADE,
      CONSTRAINT fk_supplier_metal_item_band_band
        FOREIGN KEY (band_id) REFERENCES supplier_metal_price_bands(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await addColumnIfMissing(knex, 'purchase_orders', 'metal_symbol', (table) => { table.string('metal_symbol', 32).nullable(); });
  await addColumnIfMissing(knex, 'purchase_orders', 'metal_price', (table) => { table.decimal('metal_price', 18, 6).nullable(); });
  await addColumnIfMissing(knex, 'purchase_orders', 'metal_price_source', (table) => { table.string('metal_price_source', 80).nullable(); });
  await addColumnIfMissing(knex, 'purchase_orders', 'metal_price_date', (table) => { table.date('metal_price_date').nullable(); });
  await addColumnIfMissing(knex, 'purchase_orders', 'metal_price_scheme_id', (table) => { table.integer('metal_price_scheme_id').nullable(); });

  await addColumnIfMissing(knex, 'purchase_order_items', 'metal_symbol', (table) => { table.string('metal_symbol', 32).nullable(); });
  await addColumnIfMissing(knex, 'purchase_order_items', 'metal_price', (table) => { table.decimal('metal_price', 18, 6).nullable(); });
  await addColumnIfMissing(knex, 'purchase_order_items', 'metal_price_min', (table) => { table.decimal('metal_price_min', 18, 4).nullable(); });
  await addColumnIfMissing(knex, 'purchase_order_items', 'metal_price_max', (table) => { table.decimal('metal_price_max', 18, 4).nullable(); });
  await addColumnIfMissing(knex, 'purchase_order_items', 'metal_price_band_label', (table) => { table.string('metal_price_band_label', 100).nullable(); });
  await addColumnIfMissing(knex, 'purchase_order_items', 'price_source', (table) => { table.string('price_source', 50).nullable(); });
  await addColumnIfMissing(knex, 'purchase_order_items', 'metal_price_scheme_id', (table) => { table.integer('metal_price_scheme_id').nullable(); });
  await addColumnIfMissing(knex, 'purchase_order_items', 'metal_price_item_id', (table) => { table.integer('metal_price_item_id').nullable(); });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('supplier_metal_price_item_bands');
  await knex.schema.dropTableIfExists('supplier_metal_price_items');
  await knex.schema.dropTableIfExists('supplier_metal_price_bands');
  await knex.schema.dropTableIfExists('supplier_metal_price_schemes');
};
