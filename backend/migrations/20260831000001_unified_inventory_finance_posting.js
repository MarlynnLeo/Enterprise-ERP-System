'use strict';

const RoleAccessService = require('../src/services/RoleAccessService');

const VIEW_PERMISSION = 'finance:inventory:view';
const APPROVE_PERMISSION = 'finance:inventory:approve';
const REVERSE_PERMISSION = 'finance:inventory:reverse';
const MENU_PATH = '/finance/inventory-posting';

async function ensurePermission(knex, code, name) {
  let permission = await knex('permissions').where({ code }).first('id');
  if (!permission) {
    const [id] = await knex('permissions').insert({
      code,
      name,
      module: 'finance',
      status: 1,
      source: 'migration',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });
    permission = { id };
  }
  return permission.id;
}

async function ensureFinanceMenu(knex, viewPermissionId) {
  const financeRoot = await knex('menus').where({ path: '/finance' }).first('id');
  if (!financeRoot) return;

  let menu = await knex('menus').where({ path: MENU_PATH }).first('id');
  const values = {
    parent_id: financeRoot.id,
    name: '库存过账审核',
    path: MENU_PATH,
    component: 'finance/inventory/InventoryPostingApproval',
    icon: 'Stamp',
    permission: VIEW_PERMISSION,
    permission_id: viewPermissionId,
    type: 1,
    visible: 1,
    status: 1,
    sort_order: 18,
    updated_at: knex.fn.now(),
  };

  if (menu) {
    await knex('menus').where({ id: menu.id }).update(values);
  } else {
    const [id] = await knex('menus').insert({
      ...values,
      created_at: knex.fn.now(),
    });
    menu = { id };
  }

  const actions = [
    [APPROVE_PERMISSION, '审核过账', 1],
    [REVERSE_PERMISSION, '反审核冲销', 2],
  ];
  for (const [permission, name, sortOrder] of actions) {
    const permissionRow = await knex('permissions').where({ code: permission }).first('id');
    const existing = await knex('menus').where({ permission, type: 2 }).first('id');
    const actionValues = {
      parent_id: menu.id,
      name,
      path: '',
      component: '',
      icon: '',
      permission,
      permission_id: permissionRow?.id || null,
      type: 2,
      visible: 1,
      status: 1,
      sort_order: 900 + sortOrder,
      updated_at: knex.fn.now(),
    };
    if (existing) {
      await knex('menus').where({ id: existing.id }).update(actionValues);
    } else {
      await knex('menus').insert({ ...actionValues, created_at: knex.fn.now() });
    }
  }
}

exports.up = async function up(knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS inventory_posting_documents (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      posting_no VARCHAR(64) NOT NULL,
      source_type VARCHAR(64) NOT NULL,
      source_id BIGINT NULL,
      source_no VARCHAR(100) NOT NULL,
      posting_sequence INT UNSIGNED NOT NULL DEFAULT 1,
      posting_kind VARCHAR(24) NOT NULL DEFAULT 'movement',
      original_posting_document_id BIGINT UNSIGNED NULL,
      movement_direction VARCHAR(16) NOT NULL DEFAULT 'mixed',
      transaction_date DATE NOT NULL,
      finance_status VARCHAR(32) NOT NULL DEFAULT 'pending',
      business_approved_by_id BIGINT NULL,
      business_approved_by VARCHAR(100) NULL,
      business_approved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finance_approved_by BIGINT NULL,
      finance_approved_label VARCHAR(100) NULL,
      finance_approved_at DATETIME NULL,
      rejected_by BIGINT NULL,
      rejected_label VARCHAR(100) NULL,
      rejected_at DATETIME NULL,
      reversed_by BIGINT NULL,
      reversed_label VARCHAR(100) NULL,
      reversed_at DATETIME NULL,
      snapshot_hash CHAR(64) NULL,
      snapshot_version INT UNSIGNED NOT NULL DEFAULT 1,
      locked TINYINT(1) NOT NULL DEFAULT 0,
      is_legacy TINYINT(1) NOT NULL DEFAULT 0,
      total_quantity DECIMAL(20,6) NOT NULL DEFAULT 0,
      total_value DECIMAL(20,6) NULL,
      remark VARCHAR(1000) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_inventory_posting_no (posting_no),
      UNIQUE KEY uk_inventory_posting_source_version
        (source_type, source_no, posting_sequence, posting_kind),
      KEY idx_inventory_posting_status_date (finance_status, transaction_date),
      KEY idx_inventory_posting_source (source_type, source_id, source_no),
      KEY idx_inventory_posting_original (original_posting_document_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='Finance-controlled inventory posting document';
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS inventory_posting_lines (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      posting_document_id BIGINT UNSIGNED NOT NULL,
      line_no INT UNSIGNED NOT NULL,
      source_line_key VARCHAR(191) NULL,
      material_id INT NOT NULL,
      location_id INT NOT NULL,
      transaction_type VARCHAR(50) NOT NULL,
      reference_type VARCHAR(64) NOT NULL,
      reference_no VARCHAR(100) NOT NULL,
      signed_quantity DECIMAL(20,6) NOT NULL,
      unit_id INT NULL,
      batch_number VARCHAR(191) NULL,
      unit_cost DECIMAL(20,6) NULL,
      total_value DECIMAL(20,6) NULL,
      transaction_date DATE NOT NULL,
      operator VARCHAR(100) NOT NULL,
      payload_json JSON NOT NULL,
      snapshot_hash CHAR(64) NOT NULL,
      posted_quantity DECIMAL(20,6) NULL,
      posted_value DECIMAL(20,6) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_inventory_posting_line_no (posting_document_id, line_no),
      UNIQUE KEY uk_inventory_posting_line_source_key (posting_document_id, source_line_key),
      KEY idx_inventory_posting_line_stock (material_id, location_id),
      KEY idx_inventory_posting_line_reference (reference_type, reference_no),
      CONSTRAINT fk_inventory_posting_line_document
        FOREIGN KEY (posting_document_id) REFERENCES inventory_posting_documents(id)
        ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='Immutable inventory movement snapshots awaiting finance approval';
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS inventory_posting_events (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      posting_document_id BIGINT UNSIGNED NOT NULL,
      event_type VARCHAR(40) NOT NULL,
      from_status VARCHAR(32) NULL,
      to_status VARCHAR(32) NULL,
      actor_id BIGINT NULL,
      actor_label VARCHAR(100) NULL,
      remark VARCHAR(1000) NULL,
      event_data JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_inventory_posting_event_document (posting_document_id, created_at),
      CONSTRAINT fk_inventory_posting_event_document
        FOREIGN KEY (posting_document_id) REFERENCES inventory_posting_documents(id)
        ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='Append-only inventory posting state transitions';
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS inventory_valuation_adjustments (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      ledger_id BIGINT NOT NULL,
      posting_document_id BIGINT UNSIGNED NULL,
      adjustment_type VARCHAR(40) NOT NULL,
      old_unit_cost DECIMAL(20,6) NULL,
      new_unit_cost DECIMAL(20,6) NOT NULL,
      value_delta DECIMAL(20,6) NOT NULL,
      reason VARCHAR(1000) NOT NULL,
      actor_id BIGINT NULL,
      actor_label VARCHAR(100) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_inventory_valuation_ledger (ledger_id, created_at),
      KEY idx_inventory_valuation_posting (posting_document_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='Append-only inventory valuation changes';
  `);

  if (await knex.schema.hasTable('inventory_ledger')) {
    if (await knex.schema.hasColumn('inventory_ledger', 'transaction_type')) {
      await knex.raw(
        'ALTER TABLE inventory_ledger MODIFY COLUMN transaction_type VARCHAR(50) NOT NULL'
      );
    }
    if (!(await knex.schema.hasColumn('inventory_ledger', 'posting_document_id'))) {
      await knex.raw(
        'ALTER TABLE inventory_ledger ADD COLUMN posting_document_id BIGINT UNSIGNED NULL AFTER idempotency_key'
      );
    }
    if (!(await knex.schema.hasColumn('inventory_ledger', 'posting_line_id'))) {
      await knex.raw(
        'ALTER TABLE inventory_ledger ADD COLUMN posting_line_id BIGINT UNSIGNED NULL AFTER posting_document_id'
      );
    }
    if (!(await knex.schema.hasColumn('inventory_ledger', 'reversal_of_ledger_id'))) {
      await knex.raw(
        'ALTER TABLE inventory_ledger ADD COLUMN reversal_of_ledger_id BIGINT NULL AFTER posting_line_id'
      );
    }
    const [postingIndexes] = await knex.raw(
      "SHOW INDEX FROM inventory_ledger WHERE Key_name = 'idx_inventory_ledger_posting'"
    );
    if (!postingIndexes.length) {
      await knex.raw(
        'ALTER TABLE inventory_ledger ADD INDEX idx_inventory_ledger_posting (posting_document_id, posting_line_id)'
      );
    }
  }

  // Existing ledger rows are archived as already-posted legacy documents. They are never re-queued.
  await knex.raw(`
    INSERT IGNORE INTO inventory_posting_documents (
      posting_no, source_type, source_no, posting_sequence, posting_kind,
      movement_direction, transaction_date, finance_status,
      business_approved_by, business_approved_at,
      finance_approved_label, finance_approved_at,
      snapshot_hash, locked, is_legacy, total_quantity, total_value,
      remark, created_at, updated_at
    )
    SELECT
      CONCAT('LEGACY-', UPPER(SUBSTRING(SHA2(CONCAT(source_type, '|', source_no), 256), 1, 32))),
      source_type,
      source_no,
      1,
      'movement',
      CASE WHEN MIN(quantity) >= 0 THEN 'inbound'
           WHEN MAX(quantity) <= 0 THEN 'outbound'
           ELSE 'mixed' END,
      COALESCE(MIN(transaction_date), DATE(MIN(created_at))),
      'approved',
      'legacy-migration',
      MIN(created_at),
      'legacy-migration',
      MIN(created_at),
      SHA2(CONCAT(source_type, '|', source_no, '|', COUNT(*), '|', SUM(quantity)), 256),
      1,
      1,
      SUM(ABS(quantity)),
      SUM(ABS(COALESCE(total_value, 0))),
      '旧架构历史台账归档，不进入财务待审队列',
      MIN(created_at),
      MAX(COALESCE(updated_at, created_at))
    FROM (
      SELECT il.*,
             COALESCE(NULLIF(il.reference_type, ''), 'legacy') AS source_type,
             COALESCE(NULLIF(il.reference_no, ''), CONCAT('LEDGER-', il.id)) AS source_no
        FROM inventory_ledger il
       WHERE il.posting_document_id IS NULL
    ) legacy
    GROUP BY source_type, source_no
  `);

  await knex.raw(`
    INSERT IGNORE INTO inventory_posting_lines (
      posting_document_id, line_no, source_line_key, material_id, location_id,
      transaction_type, reference_type, reference_no, signed_quantity, unit_id,
      batch_number, unit_cost, total_value, transaction_date, operator,
      payload_json, snapshot_hash, posted_quantity, posted_value, created_at, updated_at
    )
    SELECT d.id,
           ROW_NUMBER() OVER (PARTITION BY d.id ORDER BY il.id),
           CONCAT('legacy-ledger-', il.id),
           il.material_id,
           il.location_id,
           il.transaction_type,
           COALESCE(NULLIF(il.reference_type, ''), 'legacy'),
           COALESCE(NULLIF(il.reference_no, ''), CONCAT('LEDGER-', il.id)),
           il.quantity,
           il.unit_id,
           il.batch_number,
           il.unit_cost,
           il.total_value,
           il.transaction_date,
           il.operator,
           JSON_OBJECT('legacyLedgerId', il.id),
           SHA2(CONCAT('legacy-ledger-', il.id), 256),
           il.quantity,
           il.total_value,
           il.created_at,
           COALESCE(il.updated_at, il.created_at)
      FROM inventory_ledger il
      JOIN inventory_posting_documents d
        ON d.is_legacy = 1
       AND d.source_type COLLATE utf8mb4_unicode_ci =
           COALESCE(NULLIF(il.reference_type, ''), 'legacy') COLLATE utf8mb4_unicode_ci
       AND d.source_no COLLATE utf8mb4_unicode_ci =
           COALESCE(NULLIF(il.reference_no, ''), CONCAT('LEDGER-', il.id)) COLLATE utf8mb4_unicode_ci
     WHERE il.posting_document_id IS NULL
  `);

  await knex.raw(`
    UPDATE inventory_ledger il
    JOIN inventory_posting_lines pl
      ON pl.source_line_key = CONCAT('legacy-ledger-', il.id)
    SET il.posting_document_id = pl.posting_document_id,
        il.posting_line_id = pl.id
    WHERE il.posting_document_id IS NULL
  `);

  await knex.raw('DROP TRIGGER IF EXISTS trg_inventory_ledger_locked_update');
  await knex.raw(`
    CREATE TRIGGER trg_inventory_ledger_locked_update
    BEFORE UPDATE ON inventory_ledger
    FOR EACH ROW
    BEGIN
      IF OLD.posting_document_id IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM inventory_posting_documents d
            WHERE d.id = OLD.posting_document_id
              AND d.locked = 1
              AND d.is_legacy = 0
         )
         AND (
           NOT (OLD.material_id <=> NEW.material_id)
           OR NOT (OLD.location_id <=> NEW.location_id)
           OR NOT (OLD.transaction_type <=> NEW.transaction_type)
           OR NOT (OLD.quantity <=> NEW.quantity)
           OR NOT (OLD.unit_id <=> NEW.unit_id)
           OR NOT (OLD.batch_number <=> NEW.batch_number)
           OR NOT (OLD.transaction_date <=> NEW.transaction_date)
           OR NOT (OLD.unit_cost <=> NEW.unit_cost)
           OR NOT (OLD.total_value <=> NEW.total_value)
           OR NOT (OLD.posting_document_id <=> NEW.posting_document_id)
           OR NOT (OLD.posting_line_id <=> NEW.posting_line_id)
           OR NOT (OLD.reversal_of_ledger_id <=> NEW.reversal_of_ledger_id)
         )
      THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Finance-posted inventory ledger rows are immutable';
      END IF;
    END
  `);

  await knex.raw('DROP TRIGGER IF EXISTS trg_inventory_ledger_locked_delete');
  await knex.raw(`
    CREATE TRIGGER trg_inventory_ledger_locked_delete
    BEFORE DELETE ON inventory_ledger
    FOR EACH ROW
    BEGIN
      IF OLD.posting_document_id IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM inventory_posting_documents d
            WHERE d.id = OLD.posting_document_id
              AND d.locked = 1
              AND d.is_legacy = 0
         )
      THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Finance-posted inventory ledger rows cannot be deleted';
      END IF;
    END
  `);

  const viewPermissionId = await ensurePermission(knex, VIEW_PERMISSION, '查看库存过账审核');
  await ensurePermission(knex, APPROVE_PERMISSION, '审核库存过账');
  await ensurePermission(knex, REVERSE_PERMISSION, '反审核库存过账');
  await ensureFinanceMenu(knex, viewPermissionId);

  await RoleAccessService.applyAllWithKnex(knex);
};

exports.down = async function down(knex) {
  await knex.raw('DROP TRIGGER IF EXISTS trg_inventory_ledger_locked_delete');
  await knex.raw('DROP TRIGGER IF EXISTS trg_inventory_ledger_locked_update');

  const menu = await knex('menus').where({ path: MENU_PATH }).first('id');
  if (menu) {
    await knex('role_menus').where({ menu_id: menu.id }).del();
    await knex('menus').where({ parent_id: menu.id }).del();
    await knex('menus').where({ id: menu.id }).del();
  }

  if (await knex.schema.hasColumn('inventory_ledger', 'reversal_of_ledger_id')) {
    await knex.schema.alterTable('inventory_ledger', (table) => {
      table.dropColumn('reversal_of_ledger_id');
    });
  }
  if (await knex.schema.hasColumn('inventory_ledger', 'posting_line_id')) {
    await knex.schema.alterTable('inventory_ledger', (table) => {
      table.dropColumn('posting_line_id');
    });
  }
  if (await knex.schema.hasColumn('inventory_ledger', 'posting_document_id')) {
    await knex.schema.alterTable('inventory_ledger', (table) => {
      table.dropColumn('posting_document_id');
    });
  }

  await knex.raw('DROP TABLE IF EXISTS inventory_valuation_adjustments');
  await knex.raw('DROP TABLE IF EXISTS inventory_posting_events');
  await knex.raw('DROP TABLE IF EXISTS inventory_posting_lines');
  await knex.raw('DROP TABLE IF EXISTS inventory_posting_documents');
};
