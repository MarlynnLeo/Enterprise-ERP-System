/**
 * 基线迁移 - 质量管理表
 * @description 不合格品处理相关表：报废记录、返工任务、换货订单、质量成本
 */

exports.up = async function(knex) {
  // Nonconforming products must exist before downstream quality handling tables add FK references.
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS nonconforming_products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ncp_no VARCHAR(50) UNIQUE,
      inspection_id INT,
      inspection_no VARCHAR(50),
      material_id INT,
      material_code VARCHAR(50),
      material_name VARCHAR(200),
      product_id INT,
      product_code VARCHAR(50),
      product_name VARCHAR(200),
      batch_no VARCHAR(100),
      quantity DECIMAL(10,2) NOT NULL,
      unit VARCHAR(20),
      defect_type VARCHAR(100),
      defect_description TEXT,
      severity ENUM('minor', 'major', 'critical') DEFAULT 'minor',
      supplier_id INT,
      supplier_name VARCHAR(200),
      disposition ENUM('pending', 'return', 'replacement', 'rework', 'scrap', 'use_as_is') DEFAULT 'pending',
      disposition_reason TEXT,
      disposition_by VARCHAR(50),
      disposition_date DATETIME,
      handled_quantity DECIMAL(10,2) DEFAULT 0,
      handling_cost DECIMAL(10,2) DEFAULT 0,
      status ENUM('pending', 'processing', 'in_progress', 'completed', 'closed', 'cancelled') DEFAULT 'pending',
      current_location VARCHAR(100),
      isolation_area VARCHAR(100),
      responsible_party ENUM('supplier', 'internal', 'unknown') DEFAULT 'unknown',
      responsible_person VARCHAR(50),
      concession_status ENUM('none', 'pending', 'approved', 'rejected') DEFAULT 'none',
      concession_reason TEXT,
      concession_approver_id INT,
      concession_approval_date DATETIME,
      type VARCHAR(50),
      attachments JSON,
      note TEXT,
      created_by VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_by VARCHAR(50),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP NULL,
      INDEX idx_ncp_no (ncp_no),
      INDEX idx_inspection_id (inspection_id),
      INDEX idx_material_id (material_id),
      INDEX idx_supplier_id (supplier_id),
      INDEX idx_status (status),
      INDEX idx_disposition (disposition),
      INDEX idx_deleted_status (deleted_at, status),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS nonconforming_product_actions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ncp_id INT NOT NULL,
      action_type ENUM(
        'create', 'isolate', 'evaluate', 'dispose', 'close', 'delete',
        'auto_receipt', 'auto_return', 'auto_scrap', 'auto_rework', 'auto_replacement'
      ) NOT NULL,
      action_description TEXT,
      action_by VARCHAR(50),
      action_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ncp_id) REFERENCES nonconforming_products(id) ON DELETE CASCADE,
      INDEX idx_ncp_id (ncp_id),
      INDEX idx_action_date (action_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 报废记录表
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS scrap_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      scrap_no VARCHAR(50) UNIQUE NOT NULL,
      ncp_id INT,
      ncp_no VARCHAR(50),
      material_id INT,
      material_code VARCHAR(50),
      material_name VARCHAR(200),
      quantity DECIMAL(10,2) NOT NULL,
      scrap_reason TEXT,
      scrap_date DATE,
      scrap_cost DECIMAL(10,2) DEFAULT 0,
      disposal_method TEXT,
      status ENUM('pending', 'approved', 'rejected', 'completed', 'cancelled') DEFAULT 'pending',
      approver VARCHAR(50),
      approval_date DATE,
      created_by VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (ncp_id) REFERENCES nonconforming_products(id)
    )
  `);

  // 返工任务表
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS rework_tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      rework_no VARCHAR(50) UNIQUE NOT NULL,
      ncp_id INT,
      ncp_no VARCHAR(50),
      material_id INT,
      material_code VARCHAR(50),
      material_name VARCHAR(200),
      quantity DECIMAL(10,2) NOT NULL,
      rework_reason TEXT,
      rework_instructions TEXT,
      planned_date DATE,
      actual_date DATE,
      rework_cost DECIMAL(10,2) DEFAULT 0,
      progress DECIMAL(5,2) DEFAULT 0,
      status ENUM('pending', 'in_progress', 'completed', 'cancelled') DEFAULT 'pending',
      assigned_to VARCHAR(50),
      created_by VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (ncp_id) REFERENCES nonconforming_products(id)
    )
  `);

  // 换货订单表
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS replacement_orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      replacement_no VARCHAR(50) UNIQUE NOT NULL,
      ncp_id INT,
      ncp_no VARCHAR(50),
      return_no VARCHAR(50),
      purchase_order_no VARCHAR(50),
      supplier_id INT,
      supplier_name VARCHAR(200),
      material_id INT,
      material_code VARCHAR(50),
      material_name VARCHAR(200),
      quantity DECIMAL(10,2) NOT NULL,
      received_quantity DECIMAL(10,2) DEFAULT 0,
      replacement_reason TEXT,
      expected_date DATE,
      actual_date DATE,
      status ENUM('pending', 'partial', 'completed', 'cancelled') DEFAULT 'pending',
      note TEXT,
      created_by VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (ncp_id) REFERENCES nonconforming_products(id)
    )
  `);

  // 质量成本表
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS quality_costs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cost_type ENUM('rework', 'scrap', 'return', 'replacement') NOT NULL COMMENT '成本类型',
      reference_no VARCHAR(50) NOT NULL COMMENT '参考单号',
      material_code VARCHAR(50) COMMENT '物料编码',
      quantity DECIMAL(10,2) COMMENT '数量',
      cost DECIMAL(10,2) NOT NULL COMMENT '成本金额',
      operator VARCHAR(50) COMMENT '操作员',
      cost_date DATE NOT NULL COMMENT '成本日期',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (cost_type),
      INDEX (reference_no),
      INDEX (cost_date)
    )
  `);
};

exports.down = async function(knex) {
  const tables = [
    'quality_costs',
    'replacement_orders',
    'rework_tasks',
    'scrap_records',
    'nonconforming_product_actions',
    'nonconforming_products',
  ];
  for (const table of tables) {
    await knex.raw(`DROP TABLE IF EXISTS \`${table}\``);
  }
};
