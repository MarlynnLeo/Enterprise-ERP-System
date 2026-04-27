/**
 * 综合迁移 — 审批工作流 / 编码规则 / 数据权限 / 单据关联 / 合同 / MRP / 汇率 / 文档 / 绩效 / ECN
 * @date 2026-04-21
 */

exports.up = async function(knex) {

  // ==================== 1. 审批工作流 ====================

  // 工作流模板（可复用的审批流程定义）
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS workflow_templates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) NOT NULL UNIQUE COMMENT '模板编码',
      name VARCHAR(100) NOT NULL COMMENT '模板名称',
      business_type VARCHAR(50) NOT NULL COMMENT '关联业务类型: purchase_order/expense/scrap/leave等',
      description TEXT COMMENT '描述',
      trigger_condition JSON COMMENT '触发条件(如金额>10000)',
      is_active TINYINT NOT NULL DEFAULT 1,
      version INT NOT NULL DEFAULT 1 COMMENT '版本号',
      created_by INT COMMENT '创建人',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP NULL DEFAULT NULL,
      INDEX idx_business_type (business_type),
      INDEX idx_active (is_active)
    ) COMMENT='审批工作流模板'
  `);

  // 工作流模板节点（审批链中的每一步）
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS workflow_template_nodes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      template_id INT NOT NULL COMMENT '所属模板',
      node_name VARCHAR(100) NOT NULL COMMENT '节点名称',
      node_type ENUM('start','approval','cc','condition','end') NOT NULL DEFAULT 'approval' COMMENT '节点类型',
      sequence INT NOT NULL DEFAULT 0 COMMENT '执行顺序',
      approver_type ENUM('user','role','department','self','manager') NOT NULL DEFAULT 'user' COMMENT '审批人类型',
      approver_ids JSON COMMENT '审批人ID列表(当type=user/role/department时)',
      multi_approve_type ENUM('any','all','sequential') NOT NULL DEFAULT 'any' COMMENT '多人审批: 任一/全部/依次',
      condition_expression JSON COMMENT '条件节点的表达式',
      timeout_hours INT DEFAULT 0 COMMENT '超时时间(小时), 0=不限',
      timeout_action ENUM('auto_approve','auto_reject','notify') DEFAULT 'notify' COMMENT '超时动作',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_template (template_id),
      INDEX idx_sequence (template_id, sequence),
      FOREIGN KEY (template_id) REFERENCES workflow_templates(id) ON DELETE CASCADE
    ) COMMENT='审批工作流模板节点'
  `);

  // 工作流实例（每次发起审批创建一个实例）
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS workflow_instances (
      id INT AUTO_INCREMENT PRIMARY KEY,
      template_id INT NOT NULL COMMENT '使用的模板',
      business_type VARCHAR(50) NOT NULL COMMENT '业务类型',
      business_id INT NOT NULL COMMENT '业务单据ID',
      business_code VARCHAR(100) COMMENT '业务单据编号',
      title VARCHAR(200) NOT NULL COMMENT '审批标题',
      status ENUM('pending','in_progress','approved','rejected','cancelled','withdrawn') NOT NULL DEFAULT 'pending',
      current_node_id INT COMMENT '当前审批节点',
      initiator_id INT NOT NULL COMMENT '发起人',
      result_comment TEXT COMMENT '最终审批意见',
      started_at TIMESTAMP NULL,
      completed_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP NULL DEFAULT NULL,
      INDEX idx_business (business_type, business_id),
      INDEX idx_status (status),
      INDEX idx_initiator (initiator_id),
      FOREIGN KEY (template_id) REFERENCES workflow_templates(id)
    ) COMMENT='审批工作流实例'
  `);

  // 工作流实例节点（每个审批步骤的执行记录）
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS workflow_instance_nodes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      instance_id INT NOT NULL COMMENT '所属实例',
      template_node_id INT COMMENT '对应的模板节点',
      node_name VARCHAR(100) NOT NULL,
      node_type ENUM('start','approval','cc','condition','end') NOT NULL DEFAULT 'approval',
      sequence INT NOT NULL DEFAULT 0,
      status ENUM('pending','in_progress','approved','rejected','skipped','timeout') NOT NULL DEFAULT 'pending',
      approver_id INT COMMENT '实际审批人',
      approver_name VARCHAR(100) COMMENT '审批人姓名',
      comment TEXT COMMENT '审批意见',
      acted_at TIMESTAMP NULL COMMENT '审批时间',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_instance (instance_id),
      INDEX idx_approver (approver_id),
      INDEX idx_status (status),
      FOREIGN KEY (instance_id) REFERENCES workflow_instances(id) ON DELETE CASCADE
    ) COMMENT='审批工作流实例节点'
  `);

  // ==================== 2. 编码规则 ====================

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS coding_rules (
      id INT AUTO_INCREMENT PRIMARY KEY,
      business_type VARCHAR(50) NOT NULL UNIQUE COMMENT '业务类型: purchase_order/sales_order/material等',
      name VARCHAR(100) NOT NULL COMMENT '规则名称',
      prefix VARCHAR(20) NOT NULL DEFAULT '' COMMENT '前缀: PO/SO/MAT等',
      date_format VARCHAR(20) DEFAULT '' COMMENT '日期格式: YYYYMMDD/YYYYMM/YYYY/空',
      \`separator\` VARCHAR(5) DEFAULT '-' COMMENT '分隔符',
      sequence_length INT NOT NULL DEFAULT 4 COMMENT '流水号位数',
      reset_cycle ENUM('none','daily','monthly','yearly') NOT NULL DEFAULT 'yearly' COMMENT '重置周期',
      initial_value INT NOT NULL DEFAULT 1 COMMENT '起始值',
      step INT NOT NULL DEFAULT 1 COMMENT '步长',
      description TEXT,
      is_active TINYINT NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_business_type (business_type)
    ) COMMENT='编码规则定义'
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS coding_sequences (
      id INT AUTO_INCREMENT PRIMARY KEY,
      business_type VARCHAR(50) NOT NULL COMMENT '业务类型',
      period_key VARCHAR(20) NOT NULL DEFAULT 'default' COMMENT '周期键: 20260421/202604/2026/default',
      current_value INT NOT NULL DEFAULT 0 COMMENT '当前流水号',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_type_period (business_type, period_key)
    ) COMMENT='编码序列(并发安全)'
  `);

  // 预置常用编码规则
  await knex.raw(`
    INSERT IGNORE INTO coding_rules (business_type, name, prefix, date_format, \`separator\`, sequence_length, reset_cycle) VALUES
    ('purchase_requisition', '采购请购单', 'PR',  'YYYYMMDD', '-', 4, 'daily'),
    ('purchase_order',       '采购订单',   'PO',  'YYYYMMDD', '-', 4, 'daily'),
    ('purchase_receipt',     '采购收货单', 'RCV', 'YYYYMMDD', '-', 4, 'daily'),
    ('purchase_return',      '采购退货单', 'PRT', 'YYYYMMDD', '-', 4, 'daily'),
    ('sales_quotation',      '销售报价单', 'SQ',  'YYYYMMDD', '-', 4, 'daily'),
    ('sales_order',          '销售订单',   'SO',  'YYYYMMDD', '-', 4, 'daily'),
    ('sales_outbound',       '销售出库单', 'SOB', 'YYYYMMDD', '-', 4, 'daily'),
    ('sales_return',         '销售退货单', 'SRT', 'YYYYMMDD', '-', 4, 'daily'),
    ('inventory_inbound',    '入库单',     'IN',  'YYYYMMDD', '-', 4, 'daily'),
    ('inventory_outbound',   '出库单',     'OUT', 'YYYYMMDD', '-', 4, 'daily'),
    ('inventory_transfer',   '调拨单',     'TF',  'YYYYMMDD', '-', 4, 'daily'),
    ('inventory_check',      '盘点单',     'IC',  'YYYYMMDD', '-', 4, 'daily'),
    ('production_plan',      '生产计划',   'PP',  'YYYYMM',   '-', 4, 'monthly'),
    ('production_task',      '生产任务',   'PT',  'YYYYMMDD', '-', 4, 'daily'),
    ('quality_inspection',   '质检单',     'QI',  'YYYYMMDD', '-', 4, 'daily'),
    ('finance_voucher',      '记账凭证',   'V',   'YYYYMM',   '-', 4, 'monthly'),
    ('contract',             '合同',       'CT',  'YYYY',      '-', 5, 'yearly'),
    ('expense',              '费用单',     'EXP', 'YYYYMMDD', '-', 4, 'daily'),
    ('material',             '物料编码',   'M',   '',          '',  6, 'none'),
    ('ecn',                  '变更通知',   'ECN', 'YYYYMM',   '-', 4, 'monthly')
  `);

  // ==================== 3. 数据权限 ====================

  // 在 roles 表添加数据范围字段
  const hasDataScope = await knex.schema.hasColumn('roles', 'data_scope');
  if (!hasDataScope) {
    await knex.schema.alterTable('roles', (t) => {
      t.tinyint('data_scope').notNullable().defaultTo(1)
        .comment('数据权限范围: 1=全部 2=本部门及下级 3=本部门 4=仅本人 5=自定义');
    });
  }

  // 自定义数据权限部门关联表
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS role_data_departments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      role_id INT NOT NULL,
      department_id INT NOT NULL,
      UNIQUE KEY uk_role_dept (role_id, department_id),
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
    ) COMMENT='角色自定义数据权限-部门关联'
  `);

  // ==================== 4. 单据关联追溯 ====================

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS document_links (
      id INT AUTO_INCREMENT PRIMARY KEY,
      source_type VARCHAR(50) NOT NULL COMMENT '源单类型',
      source_id INT NOT NULL COMMENT '源单ID',
      source_code VARCHAR(100) COMMENT '源单编号',
      target_type VARCHAR(50) NOT NULL COMMENT '目标单类型',
      target_id INT NOT NULL COMMENT '目标单ID',
      target_code VARCHAR(100) COMMENT '目标单编号',
      link_type ENUM('generate','reference','related') NOT NULL DEFAULT 'generate' COMMENT '关联类型: 生成/引用/关联',
      remark VARCHAR(200),
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_source (source_type, source_id),
      INDEX idx_target (target_type, target_id),
      UNIQUE KEY uk_link (source_type, source_id, target_type, target_id)
    ) COMMENT='单据关联追溯'
  `);

  // ==================== 5. 合同管理 ====================

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS contracts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(100) NOT NULL UNIQUE COMMENT '合同编号',
      name VARCHAR(200) NOT NULL COMMENT '合同名称',
      type ENUM('purchase','sales','service','other') NOT NULL COMMENT '合同类型',
      status ENUM('draft','pending_approval','active','executing','completed','terminated','expired') NOT NULL DEFAULT 'draft',
      party_a VARCHAR(200) NOT NULL COMMENT '甲方',
      party_b VARCHAR(200) NOT NULL COMMENT '乙方',
      party_b_id INT COMMENT '乙方ID(客户/供应商)',
      party_b_type ENUM('customer','supplier','other') COMMENT '乙方类型',
      total_amount DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '合同总金额',
      currency VARCHAR(10) NOT NULL DEFAULT 'CNY',
      tax_rate DECIMAL(5,2) DEFAULT 0 COMMENT '税率%',
      sign_date DATE COMMENT '签署日期',
      effective_date DATE COMMENT '生效日期',
      expiry_date DATE COMMENT '到期日期',
      payment_terms TEXT COMMENT '付款条件',
      delivery_terms TEXT COMMENT '交货条件',
      warranty_terms TEXT COMMENT '保修条款',
      content TEXT COMMENT '合同正文/摘要',
      attachment_urls JSON COMMENT '附件URL列表',
      signer_id INT COMMENT '我方签署人',
      department_id INT COMMENT '归属部门',
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP NULL DEFAULT NULL,
      INDEX idx_type (type),
      INDEX idx_status (status),
      INDEX idx_party_b (party_b_id),
      INDEX idx_dates (effective_date, expiry_date),
      INDEX idx_department (department_id)
    ) COMMENT='合同主表'
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS contract_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      contract_id INT NOT NULL,
      material_id INT COMMENT '物料ID',
      material_code VARCHAR(50),
      material_name VARCHAR(200),
      specification VARCHAR(200) COMMENT '规格',
      unit VARCHAR(20) COMMENT '单位',
      quantity DECIMAL(15,4) NOT NULL DEFAULT 0,
      unit_price DECIMAL(15,4) NOT NULL DEFAULT 0,
      amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      tax_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      delivery_date DATE COMMENT '交货日期',
      remark VARCHAR(500),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_contract (contract_id),
      FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE
    ) COMMENT='合同明细'
  `);

  // 合同执行记录
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS contract_executions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      contract_id INT NOT NULL,
      execution_type ENUM('order','receipt','payment','shipment','invoice') NOT NULL COMMENT '执行类型',
      business_id INT NOT NULL COMMENT '关联业务单据ID',
      business_code VARCHAR(100) COMMENT '关联业务单据编号',
      amount DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '执行金额',
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      remark VARCHAR(500),
      INDEX idx_contract (contract_id),
      FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE
    ) COMMENT='合同执行记录'
  `);

  // ==================== 6. MRP 物料需求计划 ====================

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS mrp_runs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      run_code VARCHAR(50) NOT NULL UNIQUE COMMENT '运算编号',
      name VARCHAR(100) NOT NULL COMMENT '运算名称',
      status ENUM('draft','running','completed','failed','cancelled') NOT NULL DEFAULT 'draft',
      plan_start_date DATE NOT NULL COMMENT '计划开始日期',
      plan_end_date DATE NOT NULL COMMENT '计划结束日期',
      parameters JSON COMMENT '运算参数(物料范围/BOM版本/安全库存策略等)',
      total_materials INT DEFAULT 0 COMMENT '涉及物料数',
      total_suggestions INT DEFAULT 0 COMMENT '生成建议数',
      started_at TIMESTAMP NULL,
      completed_at TIMESTAMP NULL,
      error_message TEXT,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP NULL DEFAULT NULL,
      INDEX idx_status (status)
    ) COMMENT='MRP运算主表'
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS mrp_results (
      id INT AUTO_INCREMENT PRIMARY KEY,
      run_id INT NOT NULL COMMENT '运算批次',
      material_id INT NOT NULL COMMENT '物料ID',
      material_code VARCHAR(50),
      material_name VARCHAR(200),
      requirement_type ENUM('independent','dependent') NOT NULL DEFAULT 'independent' COMMENT '需求类型',
      source_type VARCHAR(50) COMMENT '需求来源: sales_order/production_plan',
      source_id INT COMMENT '来源单据ID',
      required_date DATE NOT NULL COMMENT '需求日期',
      gross_requirement DECIMAL(15,4) NOT NULL DEFAULT 0 COMMENT '毛需求',
      on_hand_stock DECIMAL(15,4) NOT NULL DEFAULT 0 COMMENT '现有库存',
      safety_stock DECIMAL(15,4) NOT NULL DEFAULT 0 COMMENT '安全库存',
      scheduled_receipts DECIMAL(15,4) NOT NULL DEFAULT 0 COMMENT '计划到货',
      net_requirement DECIMAL(15,4) NOT NULL DEFAULT 0 COMMENT '净需求',
      planned_order_quantity DECIMAL(15,4) NOT NULL DEFAULT 0 COMMENT '计划订单量',
      planned_order_date DATE COMMENT '计划订单日期',
      suggestion_type ENUM('purchase','production','transfer','none') NOT NULL DEFAULT 'none' COMMENT '建议类型',
      suggestion_status ENUM('pending','confirmed','converted','ignored') NOT NULL DEFAULT 'pending',
      converted_to_type VARCHAR(50) COMMENT '已转化为: purchase_order/production_plan',
      converted_to_id INT COMMENT '转化后的单据ID',
      INDEX idx_run (run_id),
      INDEX idx_material (material_id),
      INDEX idx_status (suggestion_status),
      FOREIGN KEY (run_id) REFERENCES mrp_runs(id) ON DELETE CASCADE
    ) COMMENT='MRP运算结果/建议'
  `);

  // ==================== 7. 汇率维护 ====================

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS exchange_rates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      from_currency VARCHAR(10) NOT NULL COMMENT '源币种',
      to_currency VARCHAR(10) NOT NULL DEFAULT 'CNY' COMMENT '目标币种',
      rate DECIMAL(15,6) NOT NULL COMMENT '汇率',
      effective_date DATE NOT NULL COMMENT '生效日期',
      source VARCHAR(50) DEFAULT 'manual' COMMENT '来源: manual/api',
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_currencies (from_currency, to_currency),
      INDEX idx_effective (effective_date),
      UNIQUE KEY uk_rate (from_currency, to_currency, effective_date)
    ) COMMENT='汇率维护'
  `);

  // ==================== 8. 文档管理 ====================

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS documents (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) COMMENT '文档编号',
      name VARCHAR(200) NOT NULL COMMENT '文档名称',
      category ENUM('contract','drawing','specification','report','certificate','manual','other') NOT NULL DEFAULT 'other',
      file_url VARCHAR(500) NOT NULL COMMENT '文件路径/URL',
      file_name VARCHAR(200) NOT NULL COMMENT '原始文件名',
      file_size INT DEFAULT 0 COMMENT '文件大小(bytes)',
      file_type VARCHAR(50) COMMENT 'MIME类型',
      version VARCHAR(20) DEFAULT '1.0' COMMENT '版本号',
      description TEXT,
      business_type VARCHAR(50) COMMENT '关联业务类型',
      business_id INT COMMENT '关联业务ID',
      tags JSON COMMENT '标签',
      is_public TINYINT NOT NULL DEFAULT 0 COMMENT '是否公开',
      download_count INT DEFAULT 0,
      created_by INT,
      department_id INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP NULL DEFAULT NULL,
      INDEX idx_category (category),
      INDEX idx_business (business_type, business_id),
      INDEX idx_department (department_id)
    ) COMMENT='文档管理'
  `);

  // ==================== 9. 绩效管理 ====================

  // KPI 指标库
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS performance_indicators (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) NOT NULL UNIQUE COMMENT '指标编码',
      name VARCHAR(100) NOT NULL COMMENT '指标名称',
      category ENUM('work_quality','work_quantity','work_attitude','skill','other') NOT NULL DEFAULT 'other',
      description TEXT,
      unit VARCHAR(20) COMMENT '计量单位',
      target_value DECIMAL(15,4) COMMENT '目标值',
      weight DECIMAL(5,2) DEFAULT 0 COMMENT '默认权重(%)',
      scoring_method ENUM('manual','auto','formula') NOT NULL DEFAULT 'manual' COMMENT '评分方式',
      formula TEXT COMMENT '自动计算公式',
      is_active TINYINT NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_category (category)
    ) COMMENT='KPI指标库'
  `);

  // 考核周期
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS performance_periods (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL COMMENT '考核周期名称',
      type ENUM('monthly','quarterly','semi_annual','annual') NOT NULL DEFAULT 'quarterly',
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      status ENUM('draft','in_progress','scoring','completed','archived') NOT NULL DEFAULT 'draft',
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_status (status)
    ) COMMENT='绩效考核周期'
  `);

  // 绩效评估（每人每周期一条）
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS performance_evaluations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      period_id INT NOT NULL COMMENT '考核周期',
      employee_id INT NOT NULL COMMENT '被考核人',
      employee_name VARCHAR(100),
      department_id INT,
      evaluator_id INT COMMENT '考核人',
      total_score DECIMAL(5,2) DEFAULT 0 COMMENT '总分',
      grade ENUM('S','A','B','C','D') COMMENT '等级',
      self_comment TEXT COMMENT '自评',
      evaluator_comment TEXT COMMENT '考核人评语',
      status ENUM('draft','self_evaluation','manager_scoring','completed') NOT NULL DEFAULT 'draft',
      completed_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_period_employee (period_id, employee_id),
      INDEX idx_period (period_id),
      INDEX idx_employee (employee_id),
      INDEX idx_department (department_id),
      FOREIGN KEY (period_id) REFERENCES performance_periods(id)
    ) COMMENT='绩效评估'
  `);

  // 绩效评估明细（每个指标的得分）
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS performance_evaluation_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      evaluation_id INT NOT NULL,
      indicator_id INT NOT NULL COMMENT 'KPI指标',
      indicator_name VARCHAR(100),
      weight DECIMAL(5,2) NOT NULL DEFAULT 0 COMMENT '权重(%)',
      target_value DECIMAL(15,4) COMMENT '目标值',
      actual_value DECIMAL(15,4) COMMENT '实际值',
      self_score DECIMAL(5,2) COMMENT '自评分',
      manager_score DECIMAL(5,2) COMMENT '上级评分',
      final_score DECIMAL(5,2) COMMENT '最终得分',
      remark TEXT,
      INDEX idx_evaluation (evaluation_id),
      FOREIGN KEY (evaluation_id) REFERENCES performance_evaluations(id) ON DELETE CASCADE
    ) COMMENT='绩效评估明细'
  `);

  // ==================== 10. ECN 变更管理 ====================

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS ecn_orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) NOT NULL UNIQUE COMMENT 'ECN编号',
      title VARCHAR(200) NOT NULL COMMENT '变更标题',
      type ENUM('ecn','eco') NOT NULL DEFAULT 'ecn' COMMENT 'ECN=通知/ECO=订单',
      priority ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
      status ENUM('draft','pending_approval','approved','implementing','completed','rejected','cancelled') NOT NULL DEFAULT 'draft',
      reason TEXT NOT NULL COMMENT '变更原因',
      description TEXT COMMENT '变更描述',
      impact_analysis TEXT COMMENT '影响分析',
      effective_date DATE COMMENT '生效日期',
      disposition ENUM('use_existing','rework','scrap','return') DEFAULT 'use_existing' COMMENT '现有库存处置',
      requested_by INT NOT NULL COMMENT '申请人',
      department_id INT,
      approved_by INT COMMENT '审批人',
      approved_at TIMESTAMP NULL,
      completed_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP NULL DEFAULT NULL,
      INDEX idx_status (status),
      INDEX idx_type (type),
      INDEX idx_department (department_id)
    ) COMMENT='工程变更通知/订单'
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS ecn_order_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ecn_id INT NOT NULL,
      change_type ENUM('bom_add','bom_remove','bom_modify','material_modify','process_modify','drawing_modify') NOT NULL COMMENT '变更类型',
      material_id INT COMMENT '涉及物料',
      material_code VARCHAR(50),
      material_name VARCHAR(200),
      bom_id INT COMMENT '涉及BOM',
      field_name VARCHAR(100) COMMENT '变更字段',
      old_value TEXT COMMENT '变更前',
      new_value TEXT COMMENT '变更后',
      remark TEXT,
      INDEX idx_ecn (ecn_id),
      FOREIGN KEY (ecn_id) REFERENCES ecn_orders(id) ON DELETE CASCADE
    ) COMMENT='工程变更明细'
  `);

  // ==================== 11. 业务告警配置 ====================

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS business_alerts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL COMMENT '告警名称',
      category ENUM('inventory','finance','contract','quality','production','hr') NOT NULL,
      condition_type VARCHAR(50) NOT NULL COMMENT '条件类型: stock_below_safety/contract_expiring/ar_overdue等',
      condition_params JSON COMMENT '条件参数(如天数阈值)',
      severity ENUM('info','warning','critical') NOT NULL DEFAULT 'warning',
      notify_roles JSON COMMENT '通知角色ID列表',
      notify_users JSON COMMENT '通知用户ID列表',
      is_active TINYINT NOT NULL DEFAULT 1,
      check_interval_minutes INT DEFAULT 60 COMMENT '检查间隔(分钟)',
      last_checked_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_category (category),
      INDEX idx_active (is_active)
    ) COMMENT='业务告警配置'
  `);

  // 预置常用业务告警
  await knex.raw(`
    INSERT IGNORE INTO business_alerts (code, name, category, condition_type, condition_params, severity) VALUES
    ('STOCK_BELOW_SAFETY',  '库存低于安全库存',     'inventory', 'stock_below_safety',   '{"threshold_pct": 100}',  'warning'),
    ('STOCK_ZERO',          '库存为零告警',         'inventory', 'stock_zero',            '{}',                      'critical'),
    ('CONTRACT_EXPIRING',   '合同即将到期',         'contract',  'contract_expiring',     '{"days_before": 30}',     'warning'),
    ('AR_OVERDUE',          '应收账款逾期',         'finance',   'ar_overdue',            '{"days": 30}',            'warning'),
    ('AR_OVERDUE_CRITICAL', '应收账款严重逾期',     'finance',   'ar_overdue',            '{"days": 90}',            'critical'),
    ('AP_DUE_SOON',         '应付账款即将到期',     'finance',   'ap_due_soon',           '{"days_before": 7}',      'info'),
    ('QUALITY_REJECT_HIGH', '质检不良率过高',       'quality',   'reject_rate_high',      '{"threshold_pct": 5}',    'critical'),
    ('PRODUCTION_DELAY',    '生产任务逾期',         'production','task_overdue',          '{"days": 1}',             'warning'),
    ('EQUIPMENT_MAINT_DUE', '设备保养到期',         'production','maintenance_due',       '{"days_before": 7}',      'info')
  `);

};

exports.down = async function(knex) {
  // 按依赖关系倒序删除
  await knex.raw('DROP TABLE IF EXISTS business_alerts');
  await knex.raw('DROP TABLE IF EXISTS ecn_order_items');
  await knex.raw('DROP TABLE IF EXISTS ecn_orders');
  await knex.raw('DROP TABLE IF EXISTS performance_evaluation_items');
  await knex.raw('DROP TABLE IF EXISTS performance_evaluations');
  await knex.raw('DROP TABLE IF EXISTS performance_periods');
  await knex.raw('DROP TABLE IF EXISTS performance_indicators');
  await knex.raw('DROP TABLE IF EXISTS documents');
  await knex.raw('DROP TABLE IF EXISTS exchange_rates');
  await knex.raw('DROP TABLE IF EXISTS mrp_results');
  await knex.raw('DROP TABLE IF EXISTS mrp_runs');
  await knex.raw('DROP TABLE IF EXISTS contract_executions');
  await knex.raw('DROP TABLE IF EXISTS contract_items');
  await knex.raw('DROP TABLE IF EXISTS contracts');
  await knex.raw('DROP TABLE IF EXISTS document_links');
  await knex.raw('DROP TABLE IF EXISTS role_data_departments');
  await knex.raw('DROP TABLE IF EXISTS coding_sequences');
  await knex.raw('DROP TABLE IF EXISTS coding_rules');
  await knex.raw('DROP TABLE IF EXISTS workflow_instance_nodes');
  await knex.raw('DROP TABLE IF EXISTS workflow_instances');
  await knex.raw('DROP TABLE IF EXISTS workflow_template_nodes');
  await knex.raw('DROP TABLE IF EXISTS workflow_templates');

  const hasDataScope = await knex.schema.hasColumn('roles', 'data_scope');
  if (hasDataScope) {
    await knex.schema.alterTable('roles', (t) => { t.dropColumn('data_scope'); });
  }
};
