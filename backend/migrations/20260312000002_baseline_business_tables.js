/**
 * 基线迁移 - 业务表
 * @description 采购、销售、库存、生产业务表
 */

exports.up = async function(knex) {
  // ===== BOM master data =====
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS bom_masters (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      version VARCHAR(50) NOT NULL,
      status TINYINT NOT NULL DEFAULT 1,
      remark TEXT,
      attachment VARCHAR(255),
      approved_by INT,
      approved_at DATETIME,
      created_by VARCHAR(50),
      updated_by VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_product_version (product_id, version),
      INDEX idx_bom_product_status (product_id, status),
      FOREIGN KEY (product_id) REFERENCES materials(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS bom_details (
      id INT AUTO_INCREMENT PRIMARY KEY,
      bom_id INT NOT NULL,
      material_id INT NOT NULL,
      quantity DECIMAL(10,2) NOT NULL,
      unit_id INT NOT NULL,
      remark TEXT,
      level INT NOT NULL DEFAULT 1,
      parent_id INT NOT NULL DEFAULT 0,
      has_sub_bom TINYINT NOT NULL DEFAULT 0,
      ref_bom_id INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_bom_details_bom_level (bom_id, level),
      INDEX idx_bom_details_material (material_id),
      INDEX idx_bom_details_unit (unit_id),
      INDEX idx_bom_details_parent (parent_id),
      FOREIGN KEY (bom_id) REFERENCES bom_masters(id) ON DELETE CASCADE,
      FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT,
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // ===== 采购模块 =====
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_no VARCHAR(50) NOT NULL UNIQUE COMMENT '订单编号',
      supplier_id INT NOT NULL COMMENT '供应商ID',
      order_date DATE NOT NULL COMMENT '订单日期',
      delivery_date DATE COMMENT '预计交货日期',
      total_amount DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '总金额',
      payment_terms VARCHAR(100) COMMENT '付款条件',
      delivery_method VARCHAR(100) COMMENT '交货方式',
      status ENUM('draft', 'approved', 'processing', 'completed', 'cancelled') DEFAULT 'draft',
      approver VARCHAR(50) COMMENT '审批人',
      approval_date DATETIME COMMENT '审批日期',
      creator VARCHAR(50) COMMENT '创建人',
      remarks TEXT COMMENT '备注',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX (supplier_id),
      INDEX (status)
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL COMMENT '订单ID',
      material_id INT NOT NULL COMMENT '物料ID',
      quantity DECIMAL(10,2) NOT NULL COMMENT '数量',
      received_quantity DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '累计收货数量',
      warehoused_quantity DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '累计入库数量',
      inspected_quantity DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '累计检验数量',
      qualified_quantity DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '累计合格数量',
      unqualified_quantity DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '累计不合格数量',
      unit_price DECIMAL(10,2) NOT NULL COMMENT '单价',
      tax_rate DECIMAL(5,2) DEFAULT 0 COMMENT '税率',
      amount DECIMAL(15,2) NOT NULL COMMENT '金额',
      delivery_date DATE COMMENT '交货日期',
      remarks TEXT COMMENT '备注',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES purchase_orders(id),
      INDEX (material_id)
    )
  `);

  // ===== 销售模块 =====
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS sales_quotations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      quotation_no VARCHAR(50) NOT NULL UNIQUE,
      customer_id INT NOT NULL,
      total_amount DECIMAL(15,2) NOT NULL,
      validity_date DATE NOT NULL,
      status ENUM('draft', 'sent', 'accepted', 'rejected', 'expired') DEFAULT 'draft',
      remarks TEXT,
      created_by INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS sales_quotation_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      quotation_id INT NOT NULL,
      product_id INT NOT NULL,
      quantity INT NOT NULL,
      unit_price DECIMAL(15,2) NOT NULL,
      discount_percent DECIMAL(5,2) DEFAULT 0,
      tax_percent DECIMAL(5,2) DEFAULT 0,
      total_price DECIMAL(15,2) NOT NULL,
      FOREIGN KEY (quotation_id) REFERENCES sales_quotations(id)
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS sales_orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_no VARCHAR(50) NOT NULL UNIQUE,
      customer_id INT NOT NULL,
      quotation_id INT,
      contract_code VARCHAR(100) COMMENT '合同编码',
      total_amount DECIMAL(15,2) NOT NULL,
      payment_terms VARCHAR(100),
      delivery_date DATE,
      status ENUM('draft', 'pending', 'confirmed', 'processing', 'in_production', 'in_procurement', 'ready_to_ship', 'partial_shipped', 'shipped', 'delivered', 'completed', 'cancelled') DEFAULT 'draft',
      remarks TEXT,
      created_by INT NOT NULL,
      is_locked BOOLEAN DEFAULT FALSE COMMENT '是否锁定库存',
      locked_at TIMESTAMP NULL,
      locked_by INT NULL,
      lock_reason VARCHAR(500) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS sales_order_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      material_id INT NOT NULL,
      quantity INT NOT NULL,
      unit_price DECIMAL(15,2) NOT NULL,
      discount_percent DECIMAL(5,2) DEFAULT 0,
      tax_percent DECIMAL(5,2) DEFAULT 0,
      total_price DECIMAL(15,2) NOT NULL,
      FOREIGN KEY (order_id) REFERENCES sales_orders(id),
      FOREIGN KEY (material_id) REFERENCES materials(id)
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS sales_outbound (
      id INT AUTO_INCREMENT PRIMARY KEY,
      outbound_no VARCHAR(50) NOT NULL UNIQUE,
      order_id INT NULL COMMENT '主订单ID',
      is_multi_order BOOLEAN DEFAULT FALSE,
      related_orders JSON COMMENT '关联订单ID列表',
      delivery_date DATE NOT NULL,
      status ENUM('draft', 'processing', 'completed', 'cancelled') DEFAULT 'draft',
      remarks TEXT,
      created_by INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS sales_outbound_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      outbound_id INT NOT NULL,
      product_id INT NOT NULL,
      quantity INT NOT NULL,
      source_order_id INT COMMENT '来源订单ID',
      source_order_no VARCHAR(50),
      FOREIGN KEY (outbound_id) REFERENCES sales_outbound(id),
      FOREIGN KEY (product_id) REFERENCES materials(id),
      INDEX idx_source_order_id (source_order_id)
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS sales_returns (
      id INT AUTO_INCREMENT PRIMARY KEY,
      return_no VARCHAR(50) NOT NULL UNIQUE,
      order_id INT NOT NULL,
      return_date DATE NOT NULL,
      return_reason TEXT NOT NULL,
      status ENUM('draft', 'pending', 'approved', 'completed', 'rejected') DEFAULT 'draft',
      remarks TEXT,
      created_by INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES sales_orders(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS sales_return_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      return_id INT NOT NULL,
      product_id INT NOT NULL,
      quantity INT NOT NULL,
      reason TEXT,
      FOREIGN KEY (return_id) REFERENCES sales_returns(id),
      FOREIGN KEY (product_id) REFERENCES materials(id)
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS sales_exchanges (
      id INT AUTO_INCREMENT PRIMARY KEY,
      exchange_no VARCHAR(50) NOT NULL UNIQUE,
      order_id INT NOT NULL,
      exchange_date DATE NOT NULL,
      exchange_reason TEXT NOT NULL,
      status ENUM('draft', 'pending', 'approved', 'completed', 'rejected') DEFAULT 'draft',
      remarks TEXT,
      created_by INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES sales_orders(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS sales_exchange_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      exchange_id INT NOT NULL,
      old_product_id INT NOT NULL,
      new_product_id INT NOT NULL,
      quantity INT NOT NULL,
      reason TEXT,
      FOREIGN KEY (exchange_id) REFERENCES sales_exchanges(id),
      FOREIGN KEY (old_product_id) REFERENCES materials(id),
      FOREIGN KEY (new_product_id) REFERENCES materials(id)
    )
  `);

  // ===== 库存模块 =====
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS inventory_reservations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL COMMENT '销售订单ID',
      order_no VARCHAR(50) NOT NULL,
      material_id INT NOT NULL,
      material_code VARCHAR(50) NOT NULL,
      material_name VARCHAR(200) NOT NULL,
      location_id INT NOT NULL,
      reserved_quantity DECIMAL(10,2) NOT NULL,
      status ENUM('active', 'released', 'consumed') DEFAULT 'active',
      reserved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      released_at TIMESTAMP NULL,
      created_by INT NOT NULL,
      remarks VARCHAR(500),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_order_material (order_id, material_id),
      INDEX idx_material_location (material_id, location_id),
      INDEX idx_status (status)
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS inventory_outbound (
      id INT AUTO_INCREMENT PRIMARY KEY,
      outbound_no VARCHAR(50) NOT NULL UNIQUE,
      outbound_date DATE NOT NULL,
      sales_order_id INT,
      customer_id INT,
      customer_name VARCHAR(100),
      total_amount DECIMAL(12,2) DEFAULT 0,
      status ENUM('draft', 'confirmed', 'completed', 'cancelled') DEFAULT 'draft',
      outbound_type VARCHAR(30) NOT NULL DEFAULT 'manual',
      remark TEXT,
      operator VARCHAR(50) NOT NULL,
      reference_id INT,
      reference_type VARCHAR(50),
      source_task_ids JSON,
      is_batch_outbound TINYINT NOT NULL DEFAULT 0,
      production_task_id INT,
      issue_reason VARCHAR(50),
      is_excess TINYINT NOT NULL DEFAULT 0,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX (outbound_no),
      INDEX (outbound_date),
      INDEX (status),
      INDEX idx_inventory_outbound_reference (reference_type, reference_id),
      INDEX idx_inventory_outbound_production_task (production_task_id)
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS inventory_outbound_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      outbound_id INT NOT NULL,
      material_id INT NOT NULL,
      quantity DECIMAL(10,2) NOT NULL,
      price DECIMAL(10,2),
      tax_rate DECIMAL(5,2),
      total_amount DECIMAL(12,2),
      planned_quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
      actual_quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
      shortage_quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
      is_shortage TINYINT NOT NULL DEFAULT 0,
      source_tasks JSON,
      unit_id INT NOT NULL,
      remark TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (outbound_id) REFERENCES inventory_outbound(id),
      FOREIGN KEY (material_id) REFERENCES materials(id),
      FOREIGN KEY (unit_id) REFERENCES units(id)
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS inventory_inbound (
      id INT AUTO_INCREMENT PRIMARY KEY,
      inbound_no VARCHAR(50) NOT NULL UNIQUE,
      inbound_date DATE NOT NULL,
      inbound_type VARCHAR(30) DEFAULT 'other',
      reference_type VARCHAR(30),
      reference_id INT,
      reference_no VARCHAR(50),
      location_id INT NOT NULL,
      status ENUM('draft', 'confirmed', 'completed', 'reversed', 'cancelled') DEFAULT 'draft',
      total_amount DECIMAL(10,2) DEFAULT 0,
      total_amount_unit VARCHAR(10),
      operator VARCHAR(50),
      inspection_id INT,
      inspection_no VARCHAR(50),
      remark TEXT,
      created_by INT,
      updated_by INT,
      is_deleted TINYINT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_inventory_inbound_location (location_id),
      INDEX idx_inventory_inbound_date (inbound_date),
      INDEX idx_inventory_inbound_status (status),
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS inventory_inbound_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      inbound_id INT NOT NULL,
      material_id INT NOT NULL,
      material_code VARCHAR(50),
      material_name VARCHAR(100),
      specification VARCHAR(200),
      quantity DECIMAL(10,2) NOT NULL,
      unit VARCHAR(20),
      unit_id INT NOT NULL,
      inspection_item_id INT,
      location_id INT NOT NULL,
      batch_number VARCHAR(50),
      remark TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_inventory_inbound_items_inbound (inbound_id),
      INDEX idx_inventory_inbound_items_material (material_id),
      INDEX idx_inventory_inbound_items_unit (unit_id),
      INDEX idx_inventory_inbound_items_location (location_id),
      FOREIGN KEY (inbound_id) REFERENCES inventory_inbound(id) ON DELETE RESTRICT,
      FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT,
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT,
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS inventory_transfers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      transfer_no VARCHAR(50) NOT NULL UNIQUE,
      transfer_date DATE NOT NULL,
      from_location_id INT NOT NULL,
      to_location_id INT NOT NULL,
      status ENUM('draft', 'pending', 'approved', 'completed', 'cancelled') DEFAULT 'draft',
      remark TEXT,
      creator VARCHAR(50),
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_inventory_transfers_status (status),
      INDEX idx_inventory_transfers_from (from_location_id),
      INDEX idx_inventory_transfers_to (to_location_id),
      FOREIGN KEY (from_location_id) REFERENCES locations(id) ON DELETE RESTRICT,
      FOREIGN KEY (to_location_id) REFERENCES locations(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS inventory_transfer_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      transfer_id INT NOT NULL,
      material_id INT NOT NULL,
      quantity DECIMAL(10,3) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_inventory_transfer_items_transfer (transfer_id),
      INDEX idx_inventory_transfer_items_material (material_id),
      FOREIGN KEY (transfer_id) REFERENCES inventory_transfers(id) ON DELETE RESTRICT,
      FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS manual_transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      transaction_no VARCHAR(50) NOT NULL,
      transaction_type ENUM('in', 'out') NOT NULL,
      business_type_code VARCHAR(50),
      transaction_date DATE NOT NULL,
      material_id INT NOT NULL,
      location_id INT NOT NULL,
      quantity DECIMAL(15,4) NOT NULL,
      unit_cost DECIMAL(18,6),
      remark TEXT,
      operator VARCHAR(50),
      created_by INT,
      approval_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
      approved_by VARCHAR(50),
      approved_at DATETIME,
      approval_remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_manual_transactions_no (transaction_no),
      INDEX idx_manual_transactions_material (material_id),
      INDEX idx_manual_transactions_location (location_id),
      INDEX idx_manual_transactions_date (transaction_date),
      INDEX idx_manual_transactions_type (transaction_type),
      INDEX idx_manual_transactions_business_type (business_type_code),
      INDEX idx_manual_transactions_approval (approval_status),
      INDEX idx_manual_transactions_created_by (created_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS inventory_ledger (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      material_id INT NOT NULL,
      location_id INT NOT NULL,
      transaction_type VARCHAR(20) NOT NULL,
      transaction_no VARCHAR(50),
      reference_no VARCHAR(50),
      reference_type VARCHAR(50),
      quantity DECIMAL(15,3) NOT NULL COMMENT 'Signed inventory movement quantity',
      before_quantity DECIMAL(15,3) NOT NULL DEFAULT 0,
      after_quantity DECIMAL(15,3) NOT NULL DEFAULT 0,
      unit_id INT,
      batch_number VARCHAR(50),
      operator VARCHAR(50) NOT NULL,
      remark TEXT,
      unit_cost DECIMAL(18,6) DEFAULT 0,
      total_value DECIMAL(18,2) DEFAULT 0,
      supplier_id INT,
      supplier_name VARCHAR(100),
      production_date DATE,
      expiry_date DATE,
      warehouse_name VARCHAR(100),
      issue_reason VARCHAR(50),
      is_excess TINYINT NOT NULL DEFAULT 0,
      bom_required_qty DECIMAL(15,4),
      total_issued_qty DECIMAL(15,4),
      purchase_order_id INT,
      purchase_order_no VARCHAR(100),
      receipt_id INT,
      receipt_no VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_ledger_material_location (material_id, location_id),
      INDEX idx_ledger_reference (reference_no, reference_type),
      INDEX idx_ledger_type_time (transaction_type, created_at),
      INDEX idx_ledger_transaction_no (transaction_no),
      INDEX idx_ledger_operator (operator),
      INDEX idx_ledger_material_location_time (material_id, location_id, created_at),
      INDEX idx_inventory_ledger_batch (batch_number),
      INDEX idx_inventory_ledger_mat_batch (material_id, batch_number),
      FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT,
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Unified inventory ledger'
  `);

  // ===== 生产模块 =====
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS production_plans (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      start_date DATE,
      end_date DATE,
      delivery_date DATE,
      product_id INT NOT NULL,
      bom_id INT,
      bom_version VARCHAR(50),
      quantity DECIMAL(10,2) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      remark VARCHAR(255),
      contract_code VARCHAR(100),
      plan_date DATE,
      pushed_quantity INT DEFAULT 0,
      version INT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_production_plans_product (product_id),
      INDEX idx_production_plans_status (status),
      FOREIGN KEY (product_id) REFERENCES materials(id)
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS production_tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) NOT NULL UNIQUE,
      plan_id INT,
      product_id INT NOT NULL,
      quantity DECIMAL(10,2) NOT NULL,
      completed_quantity DECIMAL(15,2) DEFAULT 0,
      start_date DATE,
      expected_end_date DATE,
      actual_start_time DATETIME,
      actual_end_date DATE,
      manager VARCHAR(50) NOT NULL,
      status ENUM('pending','allocated','preparing','material_issuing','material_partial_issued','material_issued','in_progress','paused','inspection','warehousing','completed','cancelled') DEFAULT 'pending',
      remarks TEXT,
      batch_number VARCHAR(50),
      pause_reason VARCHAR(255),
      pause_time DATETIME,
      completed_at DATETIME,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_production_tasks_plan (plan_id),
      INDEX idx_production_tasks_product (product_id),
      INDEX idx_production_tasks_status (status),
      FOREIGN KEY (plan_id) REFERENCES production_plans(id)
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS production_processes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      task_id INT NOT NULL,
      process_name VARCHAR(100) NOT NULL,
      sequence INT NOT NULL DEFAULT 0,
      quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
      planned_start_time DATETIME,
      planned_end_time DATETIME,
      actual_start_time DATETIME,
      actual_end_time DATETIME,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      description TEXT,
      remarks TEXT,
      standard_hours DECIMAL(10,2) DEFAULT 0,
      efficiency_rate DECIMAL(5,2),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_production_processes_task (task_id),
      INDEX idx_production_processes_status (status),
      FOREIGN KEY (task_id) REFERENCES production_tasks(id) ON DELETE CASCADE
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS production_reports (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      report_no VARCHAR(50) NOT NULL UNIQUE,
      task_id BIGINT NOT NULL,
      process_id INT,
      process_name VARCHAR(100),
      operator_id BIGINT NOT NULL,
      operator_name VARCHAR(50) NOT NULL,
      report_quantity INT NOT NULL,
      qualified_quantity INT NOT NULL,
      defective_quantity INT DEFAULT 0,
      completed_quantity DECIMAL(10,2) NOT NULL,
      unqualified_quantity DECIMAL(10,2) NOT NULL,
      work_hours DECIMAL(10,2) NOT NULL DEFAULT 0,
      report_time DATETIME NOT NULL,
      remarks TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_production_reports_task (task_id)
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS work_orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) NOT NULL UNIQUE COMMENT '工单编号',
      production_task_id INT COMMENT '关联生产任务ID',
      product_id INT NOT NULL COMMENT '产品ID',
      quantity DECIMAL(10,2) NOT NULL COMMENT '计划数量',
      completed_quantity DECIMAL(10,2) DEFAULT 0 COMMENT '完成数量',
      status ENUM('pending','in_progress','completed','cancelled') DEFAULT 'pending',
      priority INT DEFAULT 0 COMMENT '优先级',
      planned_start DATE COMMENT '计划开始日期',
      planned_end DATE COMMENT '计划结束日期',
      actual_start DATE COMMENT '实际开始日期',
      actual_end DATE COMMENT '实际结束日期',
      remark TEXT COMMENT '备注',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX (production_task_id),
      INDEX (product_id),
      INDEX (status)
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS work_order_materials (
      id INT AUTO_INCREMENT PRIMARY KEY,
      work_order_id INT NOT NULL,
      material_id INT NOT NULL,
      required_quantity DECIMAL(10,2) NOT NULL COMMENT '需求量',
      issued_quantity DECIMAL(10,2) DEFAULT 0 COMMENT '已发料量',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (work_order_id) REFERENCES work_orders(id),
      FOREIGN KEY (material_id) REFERENCES materials(id)
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS work_order_processes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      work_order_id INT NOT NULL,
      process_name VARCHAR(100) NOT NULL COMMENT '工序名称',
      sequence INT DEFAULT 0 COMMENT '工序顺序',
      status ENUM('pending','in_progress','completed') DEFAULT 'pending',
      start_time DATETIME,
      end_time DATETIME,
      operator VARCHAR(50) COMMENT '操作员',
      remark TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (work_order_id) REFERENCES work_orders(id)
    )
  `);
};

exports.down = async function(knex) {
  const tables = [
    'work_order_processes', 'work_order_materials', 'work_orders',
    'production_reports', 'production_processes', 'production_tasks', 'production_plans',
    'inventory_ledger', 'manual_transactions',
    'inventory_transfer_items', 'inventory_transfers',
    'inventory_inbound_items', 'inventory_inbound',
    'inventory_outbound_items', 'inventory_outbound', 'inventory_reservations',
    'sales_exchange_items', 'sales_exchanges', 'sales_return_items', 'sales_returns',
    'sales_outbound_items', 'sales_outbound', 'sales_order_items', 'sales_orders',
    'sales_quotation_items', 'sales_quotations',
    'purchase_order_items', 'purchase_orders',
    'bom_details', 'bom_masters'
  ];
  for (const table of tables) {
    await knex.raw(`DROP TABLE IF EXISTS \`${table}\``);
  }
};
