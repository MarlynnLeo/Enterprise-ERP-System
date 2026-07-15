/**
 * 基线迁移 - 财务与税务表
 * @description 总账、费用、资产、现金、税务模块表
 */

exports.up = async function(knex) {
  // ===== 总账模块 =====
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS gl_accounts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      account_code VARCHAR(50) NOT NULL,
      account_name VARCHAR(100) NOT NULL,
      account_type VARCHAR(20) NOT NULL,
      type ENUM('asset', 'liability', 'equity', 'revenue', 'expense') NOT NULL DEFAULT 'expense',
      parent_id INT,
      level INT DEFAULT 1,
      is_debit BOOLEAN DEFAULT true,
      is_active BOOLEAN DEFAULT true,
      currency_code VARCHAR(10) DEFAULT 'CNY',
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX (account_code),
      INDEX (parent_id)
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS gl_periods (
      id INT AUTO_INCREMENT PRIMARY KEY,
      period_name VARCHAR(50) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      is_closed BOOLEAN DEFAULT false,
      is_adjusting BOOLEAN DEFAULT false,
      fiscal_year INT,
      closed_by VARCHAR(100) DEFAULT NULL,
      closed_at TIMESTAMP NULL DEFAULT NULL,
      closing_date DATE,
      reopened_by VARCHAR(100),
      reopened_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX (start_date, end_date)
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS gl_entries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      entry_number VARCHAR(50) NOT NULL,
      entry_date DATE NOT NULL,
      posting_date DATE,
      document_type VARCHAR(50),
      document_number VARCHAR(50),
      period_id INT,
      description TEXT,
      is_posted BOOLEAN DEFAULT false,
      is_reversed BOOLEAN DEFAULT false,
      reversal_entry_id INT NULL,
      voucher_word VARCHAR(10) DEFAULT '记',
      voucher_number INT,
      created_by INT DEFAULT NULL,
      approved_by VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX (entry_date),
      INDEX (period_id),
      INDEX (entry_number),
      INDEX (created_by)
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS gl_entry_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      entry_id INT NOT NULL,
      account_id INT NOT NULL,
      debit_amount DECIMAL(15,2) DEFAULT 0,
      credit_amount DECIMAL(15,2) DEFAULT 0,
      currency_code VARCHAR(10) DEFAULT 'CNY',
      exchange_rate DECIMAL(15,5) DEFAULT 1,
      cost_center_id INT,
      project_id INT,
      customer_id INT,
      supplier_id INT,
      employee_id INT,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX (entry_id),
      INDEX (account_id),
      FOREIGN KEY (entry_id) REFERENCES gl_entries(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES gl_accounts(id) ON DELETE RESTRICT
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS gl_period_balances (
      id INT AUTO_INCREMENT PRIMARY KEY,
      period_id INT NOT NULL,
      account_id INT NOT NULL,
      debit_balance DECIMAL(15,2) DEFAULT 0,
      credit_balance DECIMAL(15,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (period_id) REFERENCES gl_periods(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES gl_accounts(id) ON DELETE CASCADE,
      UNIQUE KEY unique_period_account (period_id, account_id),
      INDEX (period_id),
      INDEX (account_id)
    )
  `);

  // ===== 费用模块 =====
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS expense_categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      code VARCHAR(50) NOT NULL,
      parent_id INT NULL,
      description TEXT,
      status TINYINT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      expense_no VARCHAR(50) NOT NULL UNIQUE,
      category_id INT,
      amount DECIMAL(15,2) NOT NULL,
      expense_date DATE NOT NULL,
      description TEXT,
      status ENUM('draft', 'pending', 'approved', 'rejected', 'paid') DEFAULT 'draft',
      created_by INT,
      approved_by INT,
      remarks TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // ===== 资产模块 =====
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS asset_depreciation (
      id INT AUTO_INCREMENT PRIMARY KEY,
      asset_id INT NOT NULL,
      depreciation_date DATE NOT NULL,
      depreciation_amount DECIMAL(15,2) NOT NULL,
      accumulated_depreciation DECIMAL(15,2) NOT NULL,
      net_value DECIMAL(15,2) NOT NULL,
      period_id INT,
      gl_entry_id INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (asset_id),
      INDEX (depreciation_date)
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS asset_categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      code VARCHAR(50) NOT NULL,
      depreciation_method VARCHAR(50) DEFAULT 'straight_line',
      useful_life INT DEFAULT 60,
      residual_rate DECIMAL(5,2) DEFAULT 5.00,
      description TEXT,
      status TINYINT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // ===== 税务模块 =====
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tax_invoices (
      id INT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
      invoice_type ENUM('进项', '销项') NOT NULL,
      invoice_number VARCHAR(50) NOT NULL UNIQUE,
      invoice_code VARCHAR(20),
      invoice_date DATE NOT NULL,
      supplier_id INT,
      customer_id INT,
      supplier_or_customer_name VARCHAR(100),
      supplier_tax_number VARCHAR(50),
      amount_excluding_tax DECIMAL(15,2) NOT NULL,
      tax_rate DECIMAL(5,2) NOT NULL,
      tax_amount DECIMAL(15,2) NOT NULL,
      total_amount DECIMAL(15,2) NOT NULL,
      status ENUM('未认证', '已认证', '已抵扣', '已作废') DEFAULT '未认证',
      certification_date DATE,
      deduction_date DATE,
      related_document_type VARCHAR(50),
      related_document_id INT,
      gl_entry_id INT,
      remark TEXT,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_invoice_number (invoice_number),
      INDEX idx_invoice_date (invoice_date),
      INDEX idx_invoice_type (invoice_type),
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='税务发票表'
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tax_returns (
      id INT PRIMARY KEY AUTO_INCREMENT,
      return_period VARCHAR(20) NOT NULL,
      return_type ENUM('增值税', '企业所得税', '个人所得税') NOT NULL,
      sales_amount DECIMAL(15,2) DEFAULT 0,
      sales_output_tax DECIMAL(15,2) DEFAULT 0,
      purchase_amount DECIMAL(15,2) DEFAULT 0,
      purchase_input_tax DECIMAL(15,2) DEFAULT 0,
      input_tax_deduction DECIMAL(15,2) DEFAULT 0,
      tax_payable DECIMAL(15,2) DEFAULT 0,
      tax_paid DECIMAL(15,2) DEFAULT 0,
      tax_balance DECIMAL(15,2) DEFAULT 0,
      total_revenue DECIMAL(15,2) DEFAULT 0,
      total_cost DECIMAL(15,2) DEFAULT 0,
      total_expense DECIMAL(15,2) DEFAULT 0,
      taxable_income DECIMAL(15,2) DEFAULT 0,
      income_tax_rate DECIMAL(5,2) DEFAULT 25.00,
      income_tax_payable DECIMAL(15,2) DEFAULT 0,
      status ENUM('草稿', '已申报', '已缴纳', '已作废') DEFAULT '草稿',
      declaration_date DATE,
      payment_date DATE,
      gl_entry_id INT,
      remark TEXT,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_return_period (return_period),
      UNIQUE KEY uk_period_type (return_period, return_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='税务申报表'
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tax_account_config (
      id INT PRIMARY KEY AUTO_INCREMENT,
      config_key VARCHAR(50) NOT NULL UNIQUE,
      config_name VARCHAR(100) NOT NULL,
      account_id INT NOT NULL,
      description TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='税务科目配置表'
  `);
};

exports.down = async function(knex) {
  const tables = [
    'tax_account_config', 'tax_returns', 'tax_invoices',
    'asset_categories', 'asset_depreciation',
    'expenses', 'expense_categories',
    'gl_period_balances', 'gl_entry_items', 'gl_entries', 'gl_periods', 'gl_accounts'
  ];
  for (const table of tables) {
    await knex.raw(`DROP TABLE IF EXISTS \`${table}\``);
  }
};
