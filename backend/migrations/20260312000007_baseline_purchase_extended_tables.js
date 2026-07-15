/**
 * 基线迁移（二期补充）- 采购模块扩展表
 * @description 采购申请、入库、退货、外委加工相关表
 * 注意：使用 CREATE TABLE IF NOT EXISTS 确保幂等性
 */

exports.up = async function(knex) {
  // ===== 采购申请 =====
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS purchase_requisitions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      requisition_number VARCHAR(50) UNIQUE NOT NULL,
      request_date DATE NOT NULL,
      requester VARCHAR(50),
      remarks TEXT,
      status VARCHAR(20) DEFAULT 'draft' NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS purchase_requisition_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      requisition_id INT NOT NULL,
      material_id INT,
      material_code VARCHAR(50) NOT NULL,
      material_name VARCHAR(100) NOT NULL,
      specification VARCHAR(200),
      unit VARCHAR(20),
      unit_id INT,
      quantity DECIMAL(10, 2) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (requisition_id) REFERENCES purchase_requisitions(id) ON DELETE CASCADE
    )
  `);

  // ===== 采购入库 =====
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS purchase_receipts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      receipt_no VARCHAR(50) UNIQUE NOT NULL,
      order_id INT,
      order_no VARCHAR(50),
      supplier_id INT,
      supplier_name VARCHAR(100) NOT NULL,
      warehouse_id INT,
      warehouse_name VARCHAR(100) NOT NULL,
      receipt_date DATE NOT NULL,
      operator VARCHAR(50),
      inspection_id INT,
      remarks TEXT,
      total_amount DECIMAL(12,2) DEFAULT 0,
      total_tax_amount DECIMAL(12,2) DEFAULT 0,
      from_inspection TINYINT NOT NULL DEFAULT 0,
      status ENUM('draft', 'confirmed', 'completed', 'cancelled') DEFAULT 'draft' NOT NULL,
      invoice_status VARCHAR(20) DEFAULT 'uninvoiced',
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_order_id (order_id),
      INDEX idx_supplier_id (supplier_id),
      INDEX idx_status (status)
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS purchase_receipt_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      receipt_id INT NOT NULL,
      order_item_id INT,
      material_id INT,
      material_code VARCHAR(50) NOT NULL,
      material_name VARCHAR(100) NOT NULL,
      specification VARCHAR(200),
      unit VARCHAR(20),
      unit_id INT,
      ordered_quantity DECIMAL(10,2) DEFAULT 0,
      quantity DECIMAL(10,2) DEFAULT 0,
      received_quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
      qualified_quantity DECIMAL(10,2) DEFAULT 0,
      batch_number VARCHAR(50),
      price DECIMAL(10,2) DEFAULT 0,
      tax_rate DECIMAL(5,2) DEFAULT 13,
      amount_excluding_tax DECIMAL(12,2),
      tax_amount DECIMAL(12,2),
      total_amount DECIMAL(12,2),
      remarks TEXT,
      from_inspection TINYINT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (receipt_id) REFERENCES purchase_receipts(id) ON DELETE CASCADE
    )
  `);

  // ===== 采购退货 =====
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS purchase_returns (
      id INT AUTO_INCREMENT PRIMARY KEY,
      return_no VARCHAR(50) UNIQUE NOT NULL,
      receipt_id INT,
      receipt_no VARCHAR(50),
      supplier_id INT,
      supplier_name VARCHAR(100) NOT NULL,
      warehouse_id INT,
      warehouse_name VARCHAR(100) NOT NULL,
      return_date DATE NOT NULL,
      reason TEXT,
      total_amount DECIMAL(12, 2) DEFAULT 0,
      operator VARCHAR(50),
      remarks TEXT,
      status VARCHAR(20) DEFAULT 'pending' NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_return_no (return_no),
      INDEX idx_receipt_id (receipt_id),
      INDEX idx_supplier_id (supplier_id),
      INDEX idx_status (status),
      INDEX idx_return_date (return_date)
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS purchase_return_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      return_id INT NOT NULL,
      receipt_item_id INT,
      material_id INT,
      material_code VARCHAR(50) NOT NULL,
      material_name VARCHAR(100) NOT NULL,
      specification VARCHAR(200),
      unit VARCHAR(20),
      unit_id INT,
      quantity DECIMAL(12, 3) NOT NULL,
      return_quantity DECIMAL(12, 3) NOT NULL,
      price DECIMAL(12, 2),
      return_reason VARCHAR(200),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_return_id (return_id),
      INDEX idx_material_id (material_id),
      FOREIGN KEY (return_id) REFERENCES purchase_returns(id) ON DELETE CASCADE
    )
  `);

  // ===== 外委加工 =====
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS outsourced_processings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      processing_no VARCHAR(50) UNIQUE NOT NULL,
      processing_date DATE NOT NULL,
      supplier_id INT,
      supplier_name VARCHAR(100) NOT NULL,
      expected_delivery_date DATE,
      contact_person VARCHAR(50),
      contact_phone VARCHAR(50),
      total_amount DECIMAL(12, 2) DEFAULT 0,
      remarks TEXT,
      status VARCHAR(20) DEFAULT 'pending' NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS outsourced_processing_materials (
      id INT AUTO_INCREMENT PRIMARY KEY,
      processing_id INT NOT NULL,
      material_id INT,
      material_code VARCHAR(50) NOT NULL,
      material_name VARCHAR(100) NOT NULL,
      specification VARCHAR(200),
      unit VARCHAR(20),
      unit_id INT,
      quantity DECIMAL(10, 2) NOT NULL,
      remark TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (processing_id) REFERENCES outsourced_processings(id) ON DELETE CASCADE
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS outsourced_processing_products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      processing_id INT NOT NULL,
      product_id INT,
      product_code VARCHAR(50) NOT NULL,
      product_name VARCHAR(100) NOT NULL,
      specification VARCHAR(200),
      unit VARCHAR(20),
      unit_id INT,
      quantity DECIMAL(10, 2) NOT NULL,
      unit_price DECIMAL(10, 2) NOT NULL,
      total_price DECIMAL(12, 2) NOT NULL,
      remark TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (processing_id) REFERENCES outsourced_processings(id) ON DELETE CASCADE
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS outsourced_processing_receipts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      receipt_no VARCHAR(50) UNIQUE NOT NULL,
      processing_id INT,
      processing_no VARCHAR(50) NOT NULL,
      supplier_id INT,
      supplier_name VARCHAR(100) NOT NULL,
      warehouse_id INT,
      warehouse_name VARCHAR(100) NOT NULL,
      receipt_date DATE NOT NULL,
      operator VARCHAR(50),
      remarks TEXT,
      status VARCHAR(20) DEFAULT 'pending' NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS outsourced_processing_receipt_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      receipt_id INT NOT NULL,
      product_id INT,
      product_code VARCHAR(50) NOT NULL,
      product_name VARCHAR(100) NOT NULL,
      specification VARCHAR(200),
      unit VARCHAR(20),
      unit_id INT,
      expected_quantity DECIMAL(10, 2) NOT NULL,
      actual_quantity DECIMAL(10, 2) NOT NULL,
      unit_price DECIMAL(10, 2) NOT NULL,
      total_price DECIMAL(12, 2) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (receipt_id) REFERENCES outsourced_processing_receipts(id) ON DELETE CASCADE
    )
  `);
};

exports.down = async function(knex) {
  const tables = [
    'outsourced_processing_receipt_items', 'outsourced_processing_receipts',
    'outsourced_processing_products', 'outsourced_processing_materials', 'outsourced_processings',
    'purchase_return_items', 'purchase_returns',
    'purchase_receipt_items', 'purchase_receipts',
    'purchase_requisition_items', 'purchase_requisitions'
  ];
  for (const table of tables) {
    await knex.raw(`DROP TABLE IF EXISTS \`${table}\``);
  }
};
