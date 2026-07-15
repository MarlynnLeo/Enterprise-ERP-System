/**
 * 基线迁移（二期补充）- 杂项业务表
 * @description 费用管理、装箱单、8D报告、追溯过程、成本预警配置、用户定价设置
 * 注意：使用 CREATE TABLE IF NOT EXISTS 确保幂等性
 */

exports.up = async function(knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS equipment (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      model VARCHAR(100),
      manufacturer VARCHAR(100),
      purchase_date DATE,
      inspection_date DATE,
      next_inspection_date DATE,
      location VARCHAR(100),
      status ENUM('normal','maintenance','repair','scrapped') DEFAULT 'normal',
      responsible_person VARCHAR(50),
      description TEXT,
      specs TEXT,
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_equipment_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='设备台账表'
  `);

  // ===== 费用管理 =====
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS expense_categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL COMMENT '类型名称',
      code VARCHAR(50) NOT NULL UNIQUE COMMENT '类型编码',
      parent_id INT DEFAULT NULL COMMENT '父类型ID',
      description TEXT COMMENT '描述',
      status TINYINT DEFAULT 1 COMMENT '状态: 1启用 0禁用',
      sort_order INT DEFAULT 0 COMMENT '排序',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_parent (parent_id),
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='费用类型表'
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      expense_number VARCHAR(50) NOT NULL UNIQUE COMMENT '费用编号',
      category_id INT NOT NULL COMMENT '费用类型ID',
      title VARCHAR(200) NOT NULL COMMENT '费用标题',
      amount DECIMAL(15,2) NOT NULL COMMENT '金额',
      expense_date DATE NOT NULL COMMENT '费用发生日期',
      payee VARCHAR(200) COMMENT '收款方/供应商',
      invoice_number VARCHAR(100) COMMENT '发票号码',
      description TEXT COMMENT '费用说明',
      attachment_path VARCHAR(500) COMMENT '附件路径',
      status ENUM('draft', 'pending', 'approved', 'rejected', 'paid', 'cancelled') DEFAULT 'draft' COMMENT '状态',
      submitted_by INT COMMENT '提交人ID',
      submitted_at DATETIME COMMENT '提交时间',
      approved_by INT COMMENT '审批人ID',
      approved_at DATETIME COMMENT '审批时间',
      approval_remark TEXT COMMENT '审批备注',
      paid_at DATETIME COMMENT '付款时间',
      payment_bank_account_id INT COMMENT '付款银行账户ID',
      payment_transaction_id INT COMMENT '关联银行交易ID',
      created_by INT NOT NULL COMMENT '创建人ID',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_expense_number (expense_number),
      INDEX idx_category (category_id),
      INDEX idx_status (status),
      INDEX idx_expense_date (expense_date),
      INDEX idx_created_by (created_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='费用记录表'
  `);

  // ===== 装箱单 =====
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS packing_list_sequences (
      id INT AUTO_INCREMENT PRIMARY KEY,
      date_key VARCHAR(8) NOT NULL,
      sequence_no INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_date_key (date_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS packing_lists (
      id INT AUTO_INCREMENT PRIMARY KEY,
      packing_list_no VARCHAR(50) UNIQUE NOT NULL,
      customer_id INT NOT NULL,
      customer_name VARCHAR(200),
      sales_order_id INT,
      sales_order_no VARCHAR(50),
      packing_date DATE NOT NULL,
      status ENUM('draft', 'confirmed', 'packing', 'completed', 'cancelled') DEFAULT 'draft',
      total_boxes INT DEFAULT 0,
      total_quantity DECIMAL(10, 2) DEFAULT 0,
      remark TEXT,
      created_by VARCHAR(50),
      updated_by VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_customer_id (customer_id),
      INDEX idx_sales_order_id (sales_order_id),
      INDEX idx_packing_date (packing_date),
      INDEX idx_status (status),
      INDEX idx_packing_list_no (packing_list_no),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS packing_list_details (
      id INT AUTO_INCREMENT PRIMARY KEY,
      packing_list_id INT NOT NULL,
      product_id INT,
      product_code VARCHAR(50),
      product_name VARCHAR(200),
      product_specs VARCHAR(200),
      quantity DECIMAL(10, 2) NOT NULL DEFAULT 0,
      unit_id INT,
      unit_name VARCHAR(50),
      item_no VARCHAR(50),
      box_no VARCHAR(50),
      weight DECIMAL(10, 3),
      volume DECIMAL(10, 3),
      remark TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_packing_list_id (packing_list_id),
      INDEX idx_product_id (product_id),
      INDEX idx_product_code (product_code),
      INDEX idx_item_no (item_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ===== 质量管理扩展 =====
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS eight_d_reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      report_no VARCHAR(50) UNIQUE NOT NULL COMMENT '8D报告编号',
      title VARCHAR(200) NOT NULL COMMENT '报告标题',
      ncp_id INT COMMENT '关联不合格品ID',
      ncp_no VARCHAR(50) COMMENT '关联不合格品编号',
      inspection_id INT COMMENT '关联检验单ID',
      inspection_no VARCHAR(50) COMMENT '关联检验单号',
      material_id INT COMMENT '物料ID',
      material_code VARCHAR(50) COMMENT '物料编码',
      material_name VARCHAR(200) COMMENT '物料名称',
      supplier_id INT COMMENT '供应商ID',
      supplier_name VARCHAR(200) COMMENT '供应商名称',
      priority ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium' COMMENT '优先级',
      status ENUM('draft', 'in_progress', 'review', 'completed', 'closed') DEFAULT 'draft' COMMENT '状态',
      d1_team_leader VARCHAR(100) COMMENT 'D1-团队组长',
      d1_team_members TEXT COMMENT 'D1-团队成员(JSON数组)',
      d1_completed_at DATETIME COMMENT 'D1完成时间',
      d2_problem_description TEXT COMMENT 'D2-问题描述',
      d2_occurrence_date DATE COMMENT 'D2-发生日期',
      d2_quantity_affected DECIMAL(10,2) COMMENT 'D2-影响数量',
      d2_defect_type VARCHAR(100) COMMENT 'D2-缺陷类型',
      d2_completed_at DATETIME COMMENT 'D2完成时间',
      d3_containment_actions TEXT COMMENT 'D3-临时遏制措施(JSON数组)',
      d3_effective_date DATE COMMENT 'D3-生效日期',
      d3_completed_at DATETIME COMMENT 'D3完成时间',
      d4_root_cause TEXT COMMENT 'D4-根本原因',
      d4_analysis_method VARCHAR(100) COMMENT 'D4-分析方法',
      d4_contributing_factors TEXT COMMENT 'D4-促成因素(JSON数组)',
      d4_completed_at DATETIME COMMENT 'D4完成时间',
      d5_corrective_actions TEXT COMMENT 'D5-纠正措施(JSON数组)',
      d5_responsible_person VARCHAR(100) COMMENT 'D5-责任人',
      d5_target_date DATE COMMENT 'D5-目标完成日期',
      d5_completed_at DATETIME COMMENT 'D5完成时间',
      d6_implementation_results TEXT COMMENT 'D6-实施结果',
      d6_verification_method VARCHAR(200) COMMENT 'D6-验证方法',
      d6_verification_result ENUM('pass', 'fail', 'pending') DEFAULT 'pending' COMMENT 'D6-验证结果',
      d6_completed_at DATETIME COMMENT 'D6完成时间',
      d7_preventive_actions TEXT COMMENT 'D7-预防措施(JSON数组)',
      d7_standardization TEXT COMMENT 'D7-标准化内容',
      d7_completed_at DATETIME COMMENT 'D7完成时间',
      d8_summary TEXT COMMENT 'D8-总结',
      d8_lessons_learned TEXT COMMENT 'D8-经验教训',
      d8_team_recognition TEXT COMMENT 'D8-团队表彰',
      d8_completed_at DATETIME COMMENT 'D8完成时间',
      reviewed_by VARCHAR(100) COMMENT '审核人',
      reviewed_at DATETIME COMMENT '审核时间',
      review_comments TEXT COMMENT '审核意见',
      created_by VARCHAR(100) COMMENT '创建人',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_report_no (report_no),
      INDEX idx_ncp_id (ncp_id),
      INDEX idx_status (status),
      INDEX idx_priority (priority)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='8D问题解决报告'
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS traceability_process (
      id INT AUTO_INCREMENT PRIMARY KEY,
      traceability_id INT NOT NULL COMMENT '追溯记录ID',
      process_name VARCHAR(100) NOT NULL COMMENT '过程名称',
      process_code VARCHAR(50) COMMENT '过程代码',
      operator VARCHAR(50) COMMENT '操作人',
      start_time DATETIME COMMENT '开始时间',
      end_time DATETIME COMMENT '结束时间',
      duration INT COMMENT '持续时间(秒)',
      status ENUM('pending', 'in_progress', 'completed', 'failed') DEFAULT 'pending' COMMENT '状态',
      equipment_code VARCHAR(50) COMMENT '设备编码',
      equipment_name VARCHAR(100) COMMENT '设备名称',
      parameters TEXT COMMENT '过程参数(JSON格式)',
      workshop_id INT COMMENT '车间ID',
      remarks TEXT COMMENT '备注',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_traceability_id (traceability_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='追溯过程表'
  `);

  // ===== 成本预警配置 =====
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS cost_alert_settings (
      id INT PRIMARY KEY AUTO_INCREMENT,
      variance_threshold DECIMAL(5,2) DEFAULT 10.00 COMMENT '总成本差异阈值(%)',
      material_threshold DECIMAL(5,2) DEFAULT 15.00 COMMENT '材料成本差异阈值(%)',
      labor_threshold DECIMAL(5,2) DEFAULT 20.00 COMMENT '人工成本差异阈值(%)',
      overhead_threshold DECIMAL(5,2) DEFAULT 25.00 COMMENT '制造费用差异阈值(%)',
      is_active TINYINT DEFAULT 1,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      updated_by VARCHAR(50)
    )
  `);

  // ===== 用户定价设置 =====
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS user_pricing_settings (
      user_id INT PRIMARY KEY,
      settings_json JSON,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
};

exports.down = async function(knex) {
  const tables = [
    'equipment',
    'user_pricing_settings', 'cost_alert_settings',
    'traceability_process', 'eight_d_reports',
    'packing_list_details', 'packing_lists', 'packing_list_sequences',
    'expenses', 'expense_categories'
  ];
  for (const table of tables) {
    await knex.raw(`DROP TABLE IF EXISTS \`${table}\``);
  }
};
