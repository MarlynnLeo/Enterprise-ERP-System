async function hasColumn(knex, tableName, columnName) {
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
  if (!(await hasIndex(knex, tableName, indexName))) {
    await knex.raw(`ALTER TABLE \`${tableName}\` ADD ${definition}`);
  }
}

exports.up = async function up(knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS wip_snapshots (
      id INT AUTO_INCREMENT PRIMARY KEY,
      period_id INT NOT NULL,
      snapshot_date DATE NOT NULL,
      task_id INT NOT NULL,
      task_code VARCHAR(50) NULL,
      product_id INT NULL,
      product_name VARCHAR(200) NULL,
      cost_center_id INT NULL,
      planned_quantity DECIMAL(15,4) DEFAULT 0,
      completed_quantity DECIMAL(15,4) DEFAULT 0,
      material_cost DECIMAL(15,2) DEFAULT 0,
      labor_cost DECIMAL(15,2) DEFAULT 0,
      overhead_cost DECIMAL(15,2) DEFAULT 0,
      total_cost DECIMAL(15,2) DEFAULT 0,
      completion_rate DECIMAL(5,2) DEFAULT 0,
      equivalent_units DECIMAL(15,4) DEFAULT 0,
      wip_material_cost DECIMAL(15,2) DEFAULT 0,
      wip_labor_cost DECIMAL(15,2) DEFAULT 0,
      wip_overhead_cost DECIMAL(15,2) DEFAULT 0,
      wip_total_cost DECIMAL(15,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_period (period_id),
      INDEX idx_task (task_id),
      INDEX idx_snapshot_date (snapshot_date),
      UNIQUE KEY uk_wip_snapshot_task (period_id, snapshot_date, task_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await addColumnIfMissing(knex, 'wip_snapshots', 'cost_center_id', 'INT NULL AFTER product_name');
  await knex.raw(`
    UPDATE wip_snapshots ws
    JOIN production_tasks pt ON pt.id = ws.task_id
       SET ws.cost_center_id = pt.cost_center_id
     WHERE ws.cost_center_id IS NULL
  `);

  await knex.raw(`
    DELETE ws
      FROM wip_snapshots ws
      JOIN wip_snapshots keep
        ON keep.period_id = ws.period_id
       AND keep.snapshot_date = ws.snapshot_date
       AND keep.task_id = ws.task_id
       AND keep.id > ws.id
  `);

  await addIndexIfMissing(
    knex,
    'wip_snapshots',
    'idx_wip_snapshots_cost_center',
    'INDEX idx_wip_snapshots_cost_center (`cost_center_id`)'
  );
  await addIndexIfMissing(
    knex,
    'wip_snapshots',
    'uk_wip_snapshot_task',
    'UNIQUE INDEX uk_wip_snapshot_task (`period_id`, `snapshot_date`, `task_id`)'
  );
};

exports.down = async function down(knex) {
  if (await hasIndex(knex, 'wip_snapshots', 'uk_wip_snapshot_task')) {
    await knex.raw('ALTER TABLE `wip_snapshots` DROP INDEX `uk_wip_snapshot_task`');
  }
  if (await hasIndex(knex, 'wip_snapshots', 'idx_wip_snapshots_cost_center')) {
    await knex.raw('ALTER TABLE `wip_snapshots` DROP INDEX `idx_wip_snapshots_cost_center`');
  }
  if (await hasColumn(knex, 'wip_snapshots', 'cost_center_id')) {
    await knex.raw('ALTER TABLE `wip_snapshots` DROP COLUMN `cost_center_id`');
  }
};
