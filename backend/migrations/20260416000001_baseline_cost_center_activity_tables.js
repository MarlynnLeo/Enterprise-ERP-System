async function hasTable(knex, tableName) {
  return knex.schema.hasTable(tableName);
}

async function hasColumn(knex, tableName, columnName) {
  if (!(await hasTable(knex, tableName))) return false;
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

async function addIndexIfMissing(knex, tableName, indexName, definition) {
  if ((await hasTable(knex, tableName)) && !(await hasIndex(knex, tableName, indexName))) {
    await knex.raw(`ALTER TABLE \`${tableName}\` ADD ${definition}`);
  }
}

exports.up = async function up(knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS cost_centers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) NOT NULL,
      name VARCHAR(100) NOT NULL,
      type VARCHAR(50) NOT NULL DEFAULT 'production',
      parent_id INT NULL,
      department_id INT NULL,
      manager VARCHAR(100) NULL,
      description TEXT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_cost_centers_code (code),
      INDEX idx_cost_centers_parent_id (parent_id),
      INDEX idx_cost_centers_department_id (department_id),
      INDEX idx_cost_centers_type (type),
      INDEX idx_cost_centers_is_active (is_active),
      INDEX idx_cost_centers_deleted_at (deleted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS cost_activities (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) NOT NULL,
      name VARCHAR(100) NOT NULL,
      description TEXT NULL,
      cost_pool DECIMAL(15,2) NOT NULL DEFAULT 0,
      cost_driver_type VARCHAR(50) NOT NULL,
      driver_rate DECIMAL(15,4) NOT NULL DEFAULT 0,
      status TINYINT(1) NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_cost_activities_code (code),
      INDEX idx_cost_activities_status (status),
      INDEX idx_cost_activities_driver_type (cost_driver_type),
      INDEX idx_cost_activities_deleted_at (deleted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS product_activities (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      activity_id INT NOT NULL,
      driver_quantity DECIMAL(15,4) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_product_activities_product_activity (product_id, activity_id),
      INDEX idx_product_activities_product_id (product_id),
      INDEX idx_product_activities_activity_id (activity_id),
      CONSTRAINT fk_product_activities_activity
        FOREIGN KEY (activity_id) REFERENCES cost_activities(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS overhead_allocation_config (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      allocation_base VARCHAR(50) NOT NULL DEFAULT 'labor_cost',
      rate DECIMAL(15,6) NOT NULL DEFAULT 0,
      cost_center_id INT NULL,
      product_id INT NULL,
      product_category VARCHAR(100) NULL,
      effective_date DATE NOT NULL,
      expiry_date DATE NULL,
      priority INT NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_overhead_alloc_active_dates (is_active, effective_date, expiry_date),
      INDEX idx_overhead_alloc_cost_center (cost_center_id),
      INDEX idx_overhead_alloc_product (product_id),
      INDEX idx_overhead_alloc_category (product_category),
      INDEX idx_overhead_alloc_priority (priority),
      INDEX idx_overhead_alloc_deleted_at (deleted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS cost_settings_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      settings_id INT NULL,
      setting_name VARCHAR(100) NOT NULL,
      overhead_rate DECIMAL(10,4) DEFAULT 0,
      labor_rate DECIMAL(10,2) DEFAULT 0,
      costing_method VARCHAR(50) DEFAULT 'weighted_average',
      wage_payment_method VARCHAR(50) DEFAULT 'hourly',
      piece_rate DECIMAL(10,2) DEFAULT 0,
      overhead_allocation_rules JSON NULL,
      effective_from DATE NULL,
      effective_to DATE NULL,
      changed_by VARCHAR(100) NULL,
      change_reason VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_cost_settings_history_settings_id (settings_id),
      INDEX idx_cost_settings_history_effective (effective_from, effective_to)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS cost_supplement_configs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      reason_code VARCHAR(50) NOT NULL,
      reason_name VARCHAR(100) NOT NULL,
      is_included_in_cost TINYINT(1) NOT NULL DEFAULT 1,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_cost_supplement_reason_code (reason_code),
      INDEX idx_cost_supplement_active (is_active),
      INDEX idx_cost_supplement_included (is_included_in_cost)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const costSettingsColumns = [
    ['overhead_allocation_rules', 'JSON NULL AFTER piece_rate'],
    ['fallback_material_ratio', 'DECIMAL(10,4) NOT NULL DEFAULT 0.6000 AFTER overhead_allocation_rules'],
    ['fallback_labor_ratio', 'DECIMAL(10,4) NOT NULL DEFAULT 0.2500 AFTER fallback_material_ratio'],
    ['fallback_overhead_ratio', 'DECIMAL(10,4) NOT NULL DEFAULT 0.1500 AFTER fallback_labor_ratio'],
  ];
  for (const [column, definition] of costSettingsColumns) {
    await addColumnIfMissing(knex, 'cost_settings', column, definition);
  }

  if (await hasTable(knex, 'production_tasks')) {
    const productionTaskColumns = [
      ['cost_center_id', 'INT NULL'],
      ['material_cost', 'DECIMAL(15,2) NOT NULL DEFAULT 0'],
      ['labor_cost', 'DECIMAL(15,2) NOT NULL DEFAULT 0'],
      ['overhead_cost', 'DECIMAL(15,2) NOT NULL DEFAULT 0'],
      ['actual_cost', 'DECIMAL(15,2) NOT NULL DEFAULT 0'],
    ];
    for (const [column, definition] of productionTaskColumns) {
      await addColumnIfMissing(knex, 'production_tasks', column, definition);
    }
    await addIndexIfMissing(knex, 'production_tasks', 'idx_production_tasks_cost_center_id', 'INDEX idx_production_tasks_cost_center_id (`cost_center_id`)');
  }

  await addIndexIfMissing(knex, 'cost_settings', 'idx_cost_settings_is_active', 'INDEX idx_cost_settings_is_active (`is_active`)');

  const [rules] = await knex('overhead_allocation_config')
    .where({ name: 'Default labor cost allocation' })
    .limit(1);
  if (!rules) {
    await knex('overhead_allocation_config').insert({
      name: 'Default labor cost allocation',
      allocation_base: 'labor_cost',
      rate: 0.5,
      effective_date: '2020-01-01',
      priority: 0,
      is_active: 1,
    });
  }
};

exports.down = async function down(knex) {
  const tables = [
    'cost_supplement_configs',
    'cost_settings_history',
    'overhead_allocation_config',
    'product_activities',
    'cost_activities',
    'cost_centers',
  ];
  for (const table of tables) {
    await knex.raw(`DROP TABLE IF EXISTS \`${table}\``);
  }
};
