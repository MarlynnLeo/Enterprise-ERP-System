exports.config = { transaction: false };

function q(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
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

async function addColumn(knex, tableName, columnName, ddl) {
  if (await tableExists(knex, tableName) && !(await columnExists(knex, tableName, columnName))) {
    await knex.raw(`ALTER TABLE ${q(tableName)} ADD COLUMN ${ddl}`);
  }
}

async function addIndex(knex, tableName, indexName, ddl) {
  if (await tableExists(knex, tableName) && !(await indexExists(knex, tableName, indexName))) {
    await knex.raw(`ALTER TABLE ${q(tableName)} ADD ${ddl}`);
  }
}

exports.up = async function up(knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS inventory_stock_balances (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      material_id INT NOT NULL,
      location_id INT NOT NULL,
      batch_number VARCHAR(191) NOT NULL DEFAULT '',
      quantity DECIMAL(18,6) NOT NULL DEFAULT 0,
      unit_cost DECIMAL(18,6) NULL,
      total_value DECIMAL(18,6) NULL,
      version BIGINT UNSIGNED NOT NULL DEFAULT 0,
      last_ledger_id BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_stock_balance_bucket (material_id, location_id, batch_number),
      INDEX idx_stock_balance_material_location (material_id, location_id),
      INDEX idx_stock_balance_quantity (quantity)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Inventory stock balance buckets locked before ledger writes'
  `);

  if (await tableExists(knex, 'inventory_ledger')) {
    await knex.raw(`
      INSERT INTO inventory_stock_balances (
        material_id, location_id, batch_number, quantity, unit_cost, total_value,
        version, last_ledger_id, created_at, updated_at
      )
      SELECT
        material_id,
        location_id,
        COALESCE(NULLIF(batch_number, ''), '') AS batch_number,
        COALESCE(SUM(quantity), 0) AS quantity,
        NULL,
        COALESCE(SUM(COALESCE(total_value, 0)), 0),
        0,
        MAX(id),
        NOW(),
        NOW()
      FROM inventory_ledger
      WHERE material_id IS NOT NULL AND location_id IS NOT NULL
      GROUP BY material_id, location_id, COALESCE(NULLIF(batch_number, ''), '')
      ON DUPLICATE KEY UPDATE
        quantity = VALUES(quantity),
        total_value = VALUES(total_value),
        last_ledger_id = VALUES(last_ledger_id),
        updated_at = NOW()
    `);

    await addColumn(
      knex,
      'inventory_ledger',
      'idempotency_key',
      "idempotency_key VARCHAR(191) NULL COMMENT 'Business idempotency key' AFTER receipt_no"
    );
    await addIndex(
      knex,
      'inventory_ledger',
      'idx_inventory_ledger_bucket_created',
      'INDEX idx_inventory_ledger_bucket_created (material_id, location_id, batch_number, created_at)'
    );
    await addIndex(
      knex,
      'inventory_ledger',
      'uk_inventory_ledger_idempotency',
      'UNIQUE INDEX uk_inventory_ledger_idempotency (idempotency_key)'
    );
  }

  if (await tableExists(knex, 'inventory_reservations')) {
    await addColumn(
      knex,
      'inventory_reservations',
      'reservation_key',
      "reservation_key VARCHAR(191) NULL COMMENT 'Active order-line reservation key' AFTER remarks"
    );
    await addColumn(
      knex,
      'inventory_reservations',
      'request_id',
      "request_id VARCHAR(191) NULL COMMENT 'Idempotent request token' AFTER reservation_key"
    );
    await knex.raw(`
      UPDATE inventory_reservations winner
      JOIN (
        SELECT MIN(id) AS keep_id,
               SUM(reserved_quantity) AS merged_quantity,
               order_id,
               material_id,
               location_id,
               COUNT(*) AS duplicate_count
          FROM inventory_reservations
         WHERE status = 'active'
         GROUP BY order_id, material_id, location_id
        HAVING duplicate_count > 1
      ) dup ON dup.keep_id = winner.id
       SET winner.reserved_quantity = dup.merged_quantity,
           winner.updated_at = NOW()
    `);
    await knex.raw(`
      UPDATE inventory_reservations duplicate_row
      JOIN (
        SELECT MIN(id) AS keep_id,
               order_id,
               material_id,
               location_id,
               COUNT(*) AS duplicate_count
          FROM inventory_reservations
         WHERE status = 'active'
         GROUP BY order_id, material_id, location_id
        HAVING duplicate_count > 1
      ) dup ON dup.order_id = duplicate_row.order_id
            AND dup.material_id = duplicate_row.material_id
            AND dup.location_id = duplicate_row.location_id
            AND duplicate_row.id <> dup.keep_id
       SET duplicate_row.status = 'released',
           duplicate_row.released_at = COALESCE(duplicate_row.released_at, NOW()),
           duplicate_row.reservation_key = NULL,
           duplicate_row.updated_at = NOW()
       WHERE duplicate_row.status = 'active'
    `);
    await knex.raw(`
      UPDATE inventory_reservations
         SET reservation_key = CONCAT('SO:', order_id, ':', material_id, ':', location_id)
       WHERE status = 'active'
         AND reservation_key IS NULL
    `);
    await addIndex(
      knex,
      'inventory_reservations',
      'uk_inventory_reservation_active_key',
      'UNIQUE INDEX uk_inventory_reservation_active_key (reservation_key)'
    );
    await addIndex(
      knex,
      'inventory_reservations',
      'idx_inventory_reservation_status_bucket',
      'INDEX idx_inventory_reservation_status_bucket (status, material_id, location_id)'
    );
  }

  if (await tableExists(knex, 'purchase_receipts')) {
    await addColumn(
      knex,
      'purchase_receipts',
      'idempotency_key',
      "idempotency_key VARCHAR(191) NULL COMMENT 'Client idempotency key' AFTER inspection_id"
    );
    await addColumn(
      knex,
      'purchase_receipts',
      'idempotency_hash',
      "idempotency_hash CHAR(64) NULL COMMENT 'SHA-256 payload hash for idempotency checks' AFTER idempotency_key"
    );
    await addColumn(
      knex,
      'purchase_receipts',
      'active_inspection_key',
      "active_inspection_key VARCHAR(191) NULL COMMENT 'Unique active receipt per inspection' AFTER idempotency_hash"
    );
    await knex.raw(`
      UPDATE purchase_receipts pr
      JOIN (
        SELECT MIN(id) AS keep_id, inspection_id
          FROM purchase_receipts
         WHERE inspection_id IS NOT NULL
           AND COALESCE(status, '') <> 'cancelled'
         GROUP BY inspection_id
      ) k ON k.keep_id = pr.id
       SET pr.active_inspection_key = CONCAT('INSPECTION:', pr.inspection_id)
     WHERE pr.active_inspection_key IS NULL
    `);
    await addIndex(
      knex,
      'purchase_receipts',
      'uk_purchase_receipts_idempotency_key',
      'UNIQUE INDEX uk_purchase_receipts_idempotency_key (idempotency_key)'
    );
    await addIndex(
      knex,
      'purchase_receipts',
      'uk_purchase_receipts_active_inspection',
      'UNIQUE INDEX uk_purchase_receipts_active_inspection (active_inspection_key)'
    );
  }

  if (await tableExists(knex, 'purchase_orders')) {
    await addColumn(
      knex,
      'purchase_orders',
      'created_by',
      "created_by INT NULL COMMENT 'Creator user id for data-scope authorization'"
    );
    if (await columnExists(knex, 'purchase_orders', 'creator')) {
      await knex.raw(`
        UPDATE purchase_orders po
        JOIN users u ON u.username = po.creator OR u.real_name = po.creator
           SET po.created_by = u.id
         WHERE po.created_by IS NULL
           AND po.creator IS NOT NULL
      `);
    }
    await addIndex(
      knex,
      'purchase_orders',
      'idx_purchase_orders_created_by',
      'INDEX idx_purchase_orders_created_by (created_by)'
    );
  }

  if (await tableExists(knex, 'audit_logs')) {
    await addColumn(knex, 'audit_logs', 'old_value', 'old_value MEDIUMTEXT NULL AFTER entity_id');
    await addColumn(knex, 'audit_logs', 'new_value', 'new_value MEDIUMTEXT NULL AFTER old_value');
    await addColumn(knex, 'audit_logs', 'field_diff', 'field_diff JSON NULL AFTER new_value');
    await addColumn(knex, 'audit_logs', 'target_table', 'target_table VARCHAR(100) NULL AFTER entity_id');
    await addColumn(knex, 'audit_logs', 'target_id', 'target_id VARCHAR(500) NULL AFTER target_table');
    await addColumn(knex, 'audit_logs', 'request_id', 'request_id VARCHAR(100) NULL AFTER id');
    await addColumn(knex, 'audit_logs', 'method', 'method VARCHAR(10) NULL AFTER action');
    await addColumn(knex, 'audit_logs', 'path', 'path VARCHAR(500) NULL AFTER method');
    await addIndex(knex, 'audit_logs', 'idx_audit_logs_entity_created', 'INDEX idx_audit_logs_entity_created (entity_type, entity_id, created_at)');
    await addIndex(knex, 'audit_logs', 'idx_audit_logs_request_id', 'INDEX idx_audit_logs_request_id (request_id)');
  }

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS role_data_departments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      role_id INT NOT NULL,
      department_id INT NOT NULL,
      UNIQUE KEY uk_role_dept (role_id, department_id),
      INDEX idx_role_data_departments_dept (department_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Role custom data-scope departments'
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS role_data_locations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      role_id INT NOT NULL,
      location_id INT NOT NULL,
      UNIQUE KEY uk_role_location (role_id, location_id),
      INDEX idx_role_data_locations_location (location_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Role custom data-scope warehouses/locations'
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS domain_events (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_name VARCHAR(100) NOT NULL,
      aggregate_type VARCHAR(100) NULL,
      aggregate_id VARCHAR(100) NULL,
      dedup_key VARCHAR(191) NULL,
      payload JSON NOT NULL,
      status ENUM('pending','processing','processed','failed') NOT NULL DEFAULT 'pending',
      attempts INT NOT NULL DEFAULT 0,
      available_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      locked_at DATETIME NULL,
      processed_at DATETIME NULL,
      error_message TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_domain_events_dedup (dedup_key),
      INDEX idx_domain_events_pending (status, available_at, id),
      INDEX idx_domain_events_aggregate (aggregate_type, aggregate_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Transactional outbox for business domain events'
  `);
};

exports.down = async function down(knex) {
  await knex.raw('DROP TABLE IF EXISTS domain_events');
  await knex.raw('DROP TABLE IF EXISTS role_data_locations');
  await knex.raw('DROP TABLE IF EXISTS role_data_departments');
  await knex.raw('DROP TABLE IF EXISTS inventory_stock_balances');

  const dropIndex = async (tableName, indexName) => {
    if (await indexExists(knex, tableName, indexName)) {
      await knex.raw(`ALTER TABLE ${q(tableName)} DROP INDEX ${q(indexName)}`);
    }
  };

  const dropColumn = async (tableName, columnName) => {
    if (await columnExists(knex, tableName, columnName)) {
      await knex.raw(`ALTER TABLE ${q(tableName)} DROP COLUMN ${q(columnName)}`);
    }
  };

  await dropIndex('inventory_ledger', 'uk_inventory_ledger_idempotency');
  await dropIndex('inventory_ledger', 'idx_inventory_ledger_bucket_created');
  await dropColumn('inventory_ledger', 'idempotency_key');

  await dropIndex('inventory_reservations', 'uk_inventory_reservation_active_key');
  await dropIndex('inventory_reservations', 'idx_inventory_reservation_status_bucket');
  await dropColumn('inventory_reservations', 'request_id');
  await dropColumn('inventory_reservations', 'reservation_key');

  await dropIndex('purchase_receipts', 'uk_purchase_receipts_active_inspection');
  await dropIndex('purchase_receipts', 'uk_purchase_receipts_idempotency_key');
  await dropColumn('purchase_receipts', 'active_inspection_key');
  await dropColumn('purchase_receipts', 'idempotency_hash');
  await dropColumn('purchase_receipts', 'idempotency_key');

  await dropIndex('purchase_orders', 'idx_purchase_orders_created_by');
  await dropColumn('purchase_orders', 'created_by');

  await dropIndex('audit_logs', 'idx_audit_logs_request_id');
  await dropIndex('audit_logs', 'idx_audit_logs_entity_created');
  await dropColumn('audit_logs', 'path');
  await dropColumn('audit_logs', 'method');
  await dropColumn('audit_logs', 'request_id');
  await dropColumn('audit_logs', 'target_id');
  await dropColumn('audit_logs', 'target_table');
  await dropColumn('audit_logs', 'field_diff');
  await dropColumn('audit_logs', 'new_value');
  await dropColumn('audit_logs', 'old_value');
};
