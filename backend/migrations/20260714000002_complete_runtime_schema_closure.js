/**
 * Complete runtime schema closure discovered by rebuilding the database from scratch.
 *
 * This migration is intentionally idempotent: production installations may already
 * contain part of the historical schema, while a new installation needs every table,
 * column and view below.
 */

async function addColumnIfMissing(knex, tableName, columnName, defineColumn) {
  if (!(await knex.schema.hasTable(tableName))) return;
  if (await knex.schema.hasColumn(tableName, columnName)) return;

  await knex.schema.alterTable(tableName, (table) => {
    defineColumn(table);
  });
}

exports.up = async function up(knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS production_plan_materials (
      id INT NOT NULL AUTO_INCREMENT,
      plan_id INT NOT NULL,
      material_id INT NOT NULL,
      required_quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
      stock_quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
      level INT DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      gross_required_quantity DECIMAL(18,6) NOT NULL DEFAULT 0,
      issue_quantity DECIMAL(18,6) NOT NULL DEFAULT 0,
      shortage_quantity DECIMAL(18,6) NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      KEY idx_plan (plan_id),
      KEY idx_material (material_id),
      KEY idx_plan_material (plan_id, material_id),
      CONSTRAINT fk_plan_materials_plan
        FOREIGN KEY (plan_id) REFERENCES production_plans(id) ON DELETE RESTRICT,
      CONSTRAINT fk_plan_materials_material
        FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Production plan material requirements'
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS work_stations (
      id INT NOT NULL AUTO_INCREMENT,
      code VARCHAR(50) NOT NULL,
      name VARCHAR(100) NOT NULL,
      line_code VARCHAR(50),
      line_name VARCHAR(100),
      station_type ENUM('assembly','test','pack','other') DEFAULT 'assembly',
      capacity INT DEFAULT 1,
      equipment_id INT,
      is_active TINYINT(1) DEFAULT 1,
      sort_order INT DEFAULT 0,
      description TEXT,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_work_stations_code (code),
      KEY idx_work_stations_line (line_code),
      KEY idx_work_stations_type (station_type),
      KEY idx_work_stations_active (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Assembly work stations'
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS process_inspection_punch_records (
      id INT NOT NULL AUTO_INCREMENT,
      inspection_id INT,
      inspector_id INT NOT NULL,
      inspector_name VARCHAR(50) NOT NULL,
      production_line_id INT,
      production_line_name VARCHAR(100),
      process_id INT,
      process_name VARCHAR(100),
      punch_time DATETIME NOT NULL,
      punch_type ENUM('start','end','patrol','visit') DEFAULT 'patrol',
      remark VARCHAR(255),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_punch_inspection (inspection_id),
      KEY idx_punch_inspector (inspector_id),
      KEY idx_punch_time (punch_time),
      KEY idx_punch_line (production_line_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Process inspection punch records'
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS quality_standards (
      id INT NOT NULL AUTO_INCREMENT,
      standard_no VARCHAR(50) NOT NULL,
      standard_name VARCHAR(100) NOT NULL,
      standard_type ENUM('factory','customer','industry','national') NOT NULL,
      target_type ENUM('material','product','process') NOT NULL,
      target_id INT NOT NULL,
      version VARCHAR(20) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      description TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      is_aql TINYINT(1) DEFAULT 0,
      aql_level VARCHAR(10),
      PRIMARY KEY (id),
      UNIQUE KEY uk_quality_standard_no (standard_no),
      KEY idx_quality_standard_target (target_type, target_id),
      KEY idx_quality_standard_active (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Quality inspection standards'
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS quality_standard_items (
      id INT NOT NULL AUTO_INCREMENT,
      standard_id INT NOT NULL,
      item_name VARCHAR(100) NOT NULL,
      item_standard VARCHAR(200) NOT NULL,
      method VARCHAR(200),
      is_required TINYINT(1) NOT NULL DEFAULT 1,
      sequence INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_quality_standard_items_standard (standard_id),
      CONSTRAINT fk_quality_standard_items_standard
        FOREIGN KEY (standard_id) REFERENCES quality_standards(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Quality inspection standard items'
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS quality_aql_standards (
      id INT NOT NULL AUTO_INCREMENT,
      code VARCHAR(50) NOT NULL,
      name VARCHAR(100) NOT NULL,
      batch_min INT NOT NULL,
      batch_max INT NOT NULL,
      sample_size INT NOT NULL,
      aql_level DECIMAL(5,2) NOT NULL,
      accept_limit INT NOT NULL,
      reject_limit INT NOT NULL,
      status VARCHAR(20) DEFAULT 'active',
      creator_id INT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_quality_aql_code (code),
      KEY idx_quality_aql_status (status),
      KEY idx_quality_aql_lookup (aql_level, batch_min, batch_max)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AQL sampling standards'
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS process_inspection_rules (
      id INT NOT NULL AUTO_INCREMENT,
      process_id INT,
      product_id INT,
      inspection_interval INT DEFAULT 30,
      sample_rate INT DEFAULT 10,
      punch_interval INT DEFAULT 10,
      template_id INT,
      is_enabled TINYINT(1) DEFAULT 1,
      note VARCHAR(255),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_process_inspection_rule_process (process_id),
      KEY idx_process_inspection_rule_product (product_id),
      KEY idx_process_inspection_rule_enabled (is_enabled)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Process inspection rule configuration'
  `);

  await addColumnIfMissing(knex, 'inspection_items', 'dimension_value', (table) => {
    table.decimal('dimension_value', 10, 3).nullable();
  });
  await addColumnIfMissing(knex, 'inspection_items', 'tolerance_upper', (table) => {
    table.decimal('tolerance_upper', 10, 3).nullable();
  });
  await addColumnIfMissing(knex, 'inspection_items', 'tolerance_lower', (table) => {
    table.decimal('tolerance_lower', 10, 3).nullable();
  });
  await addColumnIfMissing(knex, 'inspection_items', 'standard_id', (table) => {
    table.bigInteger('standard_id').nullable();
  });

  await addColumnIfMissing(knex, 'performance_indicators', 'deleted_at', (table) => {
    table.dateTime('deleted_at').nullable().index();
  });
  await addColumnIfMissing(knex, 'print_settings', 'deleted_at', (table) => {
    table.timestamp('deleted_at').nullable().index();
  });

  await addColumnIfMissing(knex, 'hr_employees', 'position_allowance', (table) => {
    table.decimal('position_allowance', 10, 2).defaultTo(150);
  });
  await addColumnIfMissing(knex, 'hr_employees', 'housing_allowance', (table) => {
    table.decimal('housing_allowance', 10, 2).defaultTo(78.57);
  });
  await addColumnIfMissing(knex, 'hr_employees', 'meal_allowance', (table) => {
    table.decimal('meal_allowance', 10, 2).defaultTo(102.14);
  });
  await addColumnIfMissing(knex, 'hr_employees', 'overtime_rate', (table) => {
    table.decimal('overtime_rate', 10, 2).defaultTo(20);
  });

  const attendanceColumns = [
    ['full_work_days', 'decimal'],
    ['actual_work_days', 'decimal'],
    ['absent_from_position', 'decimal'],
    ['personal_leave_days', 'decimal'],
    ['sick_leave_days', 'decimal'],
    ['total_leave_days', 'decimal'],
    ['public_holiday_days', 'decimal'],
    ['serious_late_overtime', 'decimal'],
    ['normal_overtime', 'decimal'],
    ['saturday_overtime', 'decimal'],
    ['weekend_overtime', 'decimal'],
    ['late_count', 'integer'],
    ['missing_punch_count', 'integer'],
    ['total_violation_count', 'integer'],
  ];
  for (const [columnName, type] of attendanceColumns) {
    await addColumnIfMissing(knex, 'hr_attendance', columnName, (table) => {
      if (type === 'decimal') table.decimal(columnName, 5, 2).defaultTo(0);
      else table.integer(columnName).defaultTo(0);
    });
  }
  await addColumnIfMissing(knex, 'hr_attendance', 'remark', (table) => {
    table.string('remark', 500).nullable();
  });

  await addColumnIfMissing(knex, 'expense_categories', 'sort_order', (table) => {
    table.integer('sort_order').defaultTo(0).index();
  });
  await addColumnIfMissing(knex, 'expense_categories', 'gl_account_code', (table) => {
    table.string('gl_account_code', 20).nullable();
  });

  await addColumnIfMissing(knex, 'notifications', 'source', (table) => {
    table.string('source', 50).notNullable().defaultTo('system').index();
  });
  await addColumnIfMissing(knex, 'notifications', 'metadata', (table) => {
    table.text('metadata').nullable();
  });
  if (await knex.schema.hasTable('notifications')) {
    await knex.raw('ALTER TABLE notifications MODIFY user_id INT NULL');
  }

  const communicationIntegerColumns = [
    'like_count',
    'favorite_count',
    'recipient_count',
    'read_count',
  ];
  for (const columnName of communicationIntegerColumns) {
    await addColumnIfMissing(knex, 'technical_communications', columnName, (table) => {
      table.integer(columnName).defaultTo(0).index();
    });
  }
  await addColumnIfMissing(knex, 'technical_communications', 'visibility', (table) => {
    table.enu('visibility', ['public', 'private']).defaultTo('public').index();
  });

  await addColumnIfMissing(knex, 'purchase_orders', 'contract_code', (table) => {
    table.string('contract_code', 100).nullable().index();
  });
  await addColumnIfMissing(knex, 'purchase_order_items', 'amount_excluding_tax', (table) => {
    table.decimal('amount_excluding_tax', 15, 2).nullable();
  });

  if (await knex.schema.hasTable('inventory_ledger')) {
    await knex.raw(`
      CREATE OR REPLACE VIEW v_batch_stock AS
      SELECT
        material_id,
        location_id,
        COALESCE(batch_number, '') AS batch_number,
        SUM(quantity) AS current_quantity,
        MIN(created_at) AS receipt_date,
        MAX(expiry_date) AS expiry_date,
        AVG(NULLIF(unit_cost, 0)) AS unit_cost,
        ANY_VALUE(supplier_name) AS supplier_name,
        ANY_VALUE(warehouse_name) AS warehouse_name,
        MAX(purchase_order_id) AS purchase_order_id,
        MAX(purchase_order_no) AS purchase_order_no,
        MAX(receipt_id) AS receipt_id,
        MAX(receipt_no) AS receipt_no
      FROM inventory_ledger
      GROUP BY material_id, location_id, COALESCE(batch_number, '')
      HAVING SUM(quantity) > 0
    `);
  }
};

exports.down = async function down() {
  // Deliberately non-destructive. These objects are shared by long-lived business data,
  // and dropping them during a rollback could destroy production traceability records.
};
