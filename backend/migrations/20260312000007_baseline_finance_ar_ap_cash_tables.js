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
    CREATE TABLE IF NOT EXISTS ar_invoices (
      id INT AUTO_INCREMENT PRIMARY KEY,
      invoice_number VARCHAR(50) NOT NULL,
      customer_invoice_number VARCHAR(100) NULL,
      customer_id INT NOT NULL,
      invoice_date DATE NOT NULL,
      due_date DATE NULL,
      total_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      paid_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      balance_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      currency_code VARCHAR(10) NOT NULL DEFAULT 'CNY',
      exchange_rate DECIMAL(12,6) NOT NULL DEFAULT 1.000000,
      status VARCHAR(30) NOT NULL DEFAULT '草稿',
      terms VARCHAR(255) NULL,
      notes TEXT NULL,
      source_type VARCHAR(50) NULL,
      source_id INT NULL,
      created_by INT NULL,
      updated_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_ar_invoices_invoice_number (invoice_number),
      INDEX idx_ar_invoices_customer_id (customer_id),
      INDEX idx_ar_invoices_invoice_date (invoice_date),
      INDEX idx_ar_invoices_due_date (due_date),
      INDEX idx_ar_invoices_status (status),
      INDEX idx_ar_invoices_balance (balance_amount),
      INDEX idx_ar_invoices_source (source_type, source_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS ar_invoice_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      invoice_id INT NOT NULL,
      product_id INT NULL,
      description VARCHAR(500) NULL,
      quantity DECIMAL(15,4) NOT NULL DEFAULT 0,
      unit_price DECIMAL(15,4) NOT NULL DEFAULT 0,
      amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_ar_invoice_items_invoice_id (invoice_id),
      INDEX idx_ar_invoice_items_product_id (product_id),
      CONSTRAINT fk_ar_invoice_items_invoice
        FOREIGN KEY (invoice_id) REFERENCES ar_invoices(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS ar_receipts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      receipt_number VARCHAR(50) NOT NULL,
      customer_id INT NOT NULL,
      receipt_date DATE NOT NULL,
      total_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      payment_method VARCHAR(50) NULL,
      reference_number VARCHAR(100) NULL,
      bank_account_id INT NULL,
      notes TEXT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'approved',
      voided_at DATETIME NULL,
      voided_by INT NULL,
      void_reason TEXT NULL,
      created_by INT NULL,
      updated_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_ar_receipts_receipt_number (receipt_number),
      INDEX idx_ar_receipts_customer_id (customer_id),
      INDEX idx_ar_receipts_receipt_date (receipt_date),
      INDEX idx_ar_receipts_payment_method (payment_method),
      INDEX idx_ar_receipts_status (status),
      INDEX idx_ar_receipts_bank_account_id (bank_account_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS ar_receipt_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      receipt_id INT NOT NULL,
      invoice_id INT NOT NULL,
      amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      discount_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_ar_receipt_items_receipt_id (receipt_id),
      INDEX idx_ar_receipt_items_invoice_id (invoice_id),
      CONSTRAINT fk_ar_receipt_items_receipt
        FOREIGN KEY (receipt_id) REFERENCES ar_receipts(id) ON DELETE CASCADE,
      CONSTRAINT fk_ar_receipt_items_invoice
        FOREIGN KEY (invoice_id) REFERENCES ar_invoices(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS ap_invoices (
      id INT AUTO_INCREMENT PRIMARY KEY,
      invoice_number VARCHAR(50) NOT NULL,
      supplier_invoice_number VARCHAR(100) NULL,
      supplier_id INT NOT NULL,
      invoice_date DATE NOT NULL,
      due_date DATE NULL,
      total_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      paid_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      balance_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      currency_code VARCHAR(10) NOT NULL DEFAULT 'CNY',
      exchange_rate DECIMAL(12,6) NOT NULL DEFAULT 1.000000,
      status VARCHAR(30) NOT NULL DEFAULT '草稿',
      terms VARCHAR(255) NULL,
      notes TEXT NULL,
      source_type VARCHAR(50) NULL,
      source_id INT NULL,
      created_by INT NULL,
      updated_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_ap_invoices_invoice_number (invoice_number),
      INDEX idx_ap_invoices_supplier_id (supplier_id),
      INDEX idx_ap_invoices_supplier_invoice_number (supplier_invoice_number),
      INDEX idx_ap_invoices_invoice_date (invoice_date),
      INDEX idx_ap_invoices_due_date (due_date),
      INDEX idx_ap_invoices_status (status),
      INDEX idx_ap_invoices_balance (balance_amount),
      INDEX idx_ap_invoices_source (source_type, source_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS ap_invoice_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      invoice_id INT NOT NULL,
      material_id INT NULL,
      description VARCHAR(500) NULL,
      quantity DECIMAL(15,4) NOT NULL DEFAULT 0,
      unit_price DECIMAL(15,4) NOT NULL DEFAULT 0,
      amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_ap_invoice_items_invoice_id (invoice_id),
      INDEX idx_ap_invoice_items_material_id (material_id),
      CONSTRAINT fk_ap_invoice_items_invoice
        FOREIGN KEY (invoice_id) REFERENCES ap_invoices(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS ap_payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      payment_number VARCHAR(50) NOT NULL,
      supplier_id INT NOT NULL,
      payment_date DATE NOT NULL,
      total_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      payment_method VARCHAR(50) NULL,
      reference_number VARCHAR(100) NULL,
      bank_account_id INT NULL,
      notes TEXT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'approved',
      voided_at DATETIME NULL,
      voided_by INT NULL,
      void_reason TEXT NULL,
      created_by INT NULL,
      updated_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_ap_payments_payment_number (payment_number),
      INDEX idx_ap_payments_supplier_id (supplier_id),
      INDEX idx_ap_payments_payment_date (payment_date),
      INDEX idx_ap_payments_payment_method (payment_method),
      INDEX idx_ap_payments_status (status),
      INDEX idx_ap_payments_bank_account_id (bank_account_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS ap_payment_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      payment_id INT NOT NULL,
      invoice_id INT NOT NULL,
      amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      discount_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_ap_payment_items_payment_id (payment_id),
      INDEX idx_ap_payment_items_invoice_id (invoice_id),
      CONSTRAINT fk_ap_payment_items_payment
        FOREIGN KEY (payment_id) REFERENCES ap_payments(id) ON DELETE CASCADE,
      CONSTRAINT fk_ap_payment_items_invoice
        FOREIGN KEY (invoice_id) REFERENCES ap_invoices(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS cash_transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      transaction_number VARCHAR(50) NOT NULL,
      transaction_type VARCHAR(30) NOT NULL,
      transaction_date DATE NOT NULL,
      amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      category VARCHAR(100) NULL,
      counterparty VARCHAR(200) NULL,
      description TEXT NULL,
      reference_number VARCHAR(100) NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      gl_entry_id INT NULL,
      created_by INT NULL,
      updated_by INT NULL,
      approved_by INT NULL,
      approved_at DATETIME NULL,
      reject_reason TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_cash_transactions_number (transaction_number),
      INDEX idx_cash_transactions_transaction_date (transaction_date),
      INDEX idx_cash_transactions_transaction_type (transaction_type),
      INDEX idx_cash_transactions_category (category),
      INDEX idx_cash_transactions_status (status),
      INDEX idx_cash_transactions_gl_entry_id (gl_entry_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const invoiceColumns = [
    ['ar_invoices', 'customer_invoice_number', 'VARCHAR(100) NULL AFTER invoice_number'],
    ['ar_invoices', 'source_type', 'VARCHAR(50) NULL AFTER notes'],
    ['ar_invoices', 'source_id', 'INT NULL AFTER source_type'],
    ['ar_invoices', 'created_by', 'INT NULL AFTER source_id'],
    ['ar_invoices', 'updated_by', 'INT NULL AFTER created_by'],
    ['ap_invoices', 'supplier_invoice_number', 'VARCHAR(100) NULL AFTER invoice_number'],
    ['ap_invoices', 'source_type', 'VARCHAR(50) NULL AFTER notes'],
    ['ap_invoices', 'source_id', 'INT NULL AFTER source_type'],
    ['ap_invoices', 'created_by', 'INT NULL AFTER source_id'],
    ['ap_invoices', 'updated_by', 'INT NULL AFTER created_by'],
  ];
  for (const [table, column, definition] of invoiceColumns) {
    await addColumnIfMissing(knex, table, column, definition);
  }

  const settlementColumns = [
    ['ar_receipts', 'status', "VARCHAR(30) NOT NULL DEFAULT 'approved' AFTER notes"],
    ['ar_receipts', 'voided_at', 'DATETIME NULL AFTER status'],
    ['ar_receipts', 'voided_by', 'INT NULL AFTER voided_at'],
    ['ar_receipts', 'void_reason', 'TEXT NULL AFTER voided_by'],
    ['ar_receipts', 'created_by', 'INT NULL AFTER void_reason'],
    ['ar_receipts', 'updated_by', 'INT NULL AFTER created_by'],
    ['ap_payments', 'status', "VARCHAR(30) NOT NULL DEFAULT 'approved' AFTER notes"],
    ['ap_payments', 'voided_at', 'DATETIME NULL AFTER status'],
    ['ap_payments', 'voided_by', 'INT NULL AFTER voided_at'],
    ['ap_payments', 'void_reason', 'TEXT NULL AFTER voided_by'],
    ['ap_payments', 'created_by', 'INT NULL AFTER void_reason'],
    ['ap_payments', 'updated_by', 'INT NULL AFTER created_by'],
  ];
  for (const [table, column, definition] of settlementColumns) {
    await addColumnIfMissing(knex, table, column, definition);
  }

  const cashColumns = [
    ['cash_transactions', 'status', "VARCHAR(30) NOT NULL DEFAULT 'draft' AFTER reference_number"],
    ['cash_transactions', 'gl_entry_id', 'INT NULL AFTER status'],
    ['cash_transactions', 'updated_by', 'INT NULL AFTER created_by'],
    ['cash_transactions', 'approved_by', 'INT NULL AFTER updated_by'],
    ['cash_transactions', 'approved_at', 'DATETIME NULL AFTER approved_by'],
    ['cash_transactions', 'reject_reason', 'TEXT NULL AFTER approved_at'],
  ];
  for (const [table, column, definition] of cashColumns) {
    await addColumnIfMissing(knex, table, column, definition);
  }

  await addIndexIfMissing(knex, 'ar_invoices', 'idx_ar_invoices_source', 'INDEX idx_ar_invoices_source (`source_type`, `source_id`)');
  await addIndexIfMissing(knex, 'ap_invoices', 'idx_ap_invoices_source', 'INDEX idx_ap_invoices_source (`source_type`, `source_id`)');
  await addIndexIfMissing(knex, 'cash_transactions', 'idx_cash_transactions_gl_entry_id', 'INDEX idx_cash_transactions_gl_entry_id (`gl_entry_id`)');
};

exports.down = async function down(knex) {
  const tables = [
    'cash_transactions',
    'ap_payment_items',
    'ap_payments',
    'ap_invoice_items',
    'ap_invoices',
    'ar_receipt_items',
    'ar_receipts',
    'ar_invoice_items',
    'ar_invoices',
  ];
  for (const table of tables) {
    await knex.raw(`DROP TABLE IF EXISTS \`${table}\``);
  }
};
