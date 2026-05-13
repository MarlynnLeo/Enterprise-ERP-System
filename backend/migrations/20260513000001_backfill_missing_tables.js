/**
 * 补丁迁移 — 将旧 SQL 迁移中遗漏的表纳入 Knex 基线
 * @description 审计发现 50 张表只在 database/migrations/ 的旧 SQL 文件中创建，
 *   未纳入 Knex 迁移体系，新用户运行 npm run migrate 后这些表不存在。
 *   本迁移使用 CREATE TABLE IF NOT EXISTS 确保幂等（老用户升级不受影响）。
 */

exports.up = async function(knex) {

  // --- audit_logs ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
  request_id VARCHAR(50) COMMENT '请求ID',
  user_id INT COMMENT '用户ID',
  username VARCHAR(100) COMMENT '用户名',
  action VARCHAR(50) COMMENT '操作类型: LOGIN, LOGOUT, CREATE, UPDATE, DELETE, READ',
  resource_type VARCHAR(100) COMMENT '资源类型',
  resource_id VARCHAR(100) COMMENT '资源ID',
  method VARCHAR(10) COMMENT 'HTTP方法',
  path VARCHAR(255) COMMENT '请求路径',
  query_params TEXT COMMENT '查询参数',
  request_body TEXT COMMENT '请求体',
  response_status INT COMMENT '响应状态码',
  response_body TEXT COMMENT '响应体',
  ip_address VARCHAR(50) COMMENT 'IP地址',
  user_agent TEXT COMMENT '用户代理',
  duration_ms INT COMMENT '请求耗时(毫秒)',
  old_values TEXT COMMENT '旧值（用于UPDATE操作）',
  new_values TEXT COMMENT '新值（用于UPDATE操作）',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  
  -- 索引优化
  INDEX idx_user_id (user_id),
  INDEX idx_username (username),
  INDEX idx_action (action),
  INDEX idx_created_at (created_at),
  INDEX idx_user_created (user_id, created_at),
  INDEX idx_action_created (action, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='审计日志表';`);

  // --- notifications ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS notifications (
  id INT PRIMARY KEY AUTO_INCREMENT COMMENT '通知ID',
  user_id INT NOT NULL COMMENT '接收用户ID',
  type VARCHAR(50) NOT NULL COMMENT '通知类型：system-系统通知, business-业务通知, warning-预警通知, info-信息通知',
  title VARCHAR(200) NOT NULL COMMENT '通知标题',
  content TEXT COMMENT '通知内容',
  link VARCHAR(500) COMMENT '关联链接',
  link_params JSON COMMENT '链接参数',
  is_read TINYINT(1) DEFAULT 0 COMMENT '是否已读：0-未读，1-已读',
  read_at DATETIME COMMENT '阅读时间',
  priority TINYINT DEFAULT 0 COMMENT '优先级：0-普通，1-重要，2-紧急',
  source_type VARCHAR(50) COMMENT '来源类型：order-订单, inventory-库存, production-生产等',
  source_id INT COMMENT '来源ID',
  created_by INT COMMENT '创建人ID',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_user_id (user_id),
  INDEX idx_is_read (is_read),
  INDEX idx_type (type),
  INDEX idx_created_at (created_at),
  INDEX idx_source (source_type, source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统通知表';`);

  // --- technical_communications ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS technical_communications (
  id INT PRIMARY KEY AUTO_INCREMENT COMMENT '通讯ID',
  title VARCHAR(200) NOT NULL COMMENT '标题',
  category VARCHAR(50) NOT NULL COMMENT '分类：update-更新日志, guide-操作指南, specification-技术规范, announcement-公告',
  tags JSON COMMENT '标签数组',
  summary VARCHAR(500) COMMENT '摘要',
  content LONGTEXT NOT NULL COMMENT '内容（富文本HTML）',
  author_id INT NOT NULL COMMENT '作者ID',
  author_name VARCHAR(100) COMMENT '作者姓名',
  status VARCHAR(20) DEFAULT 'draft' COMMENT '状态：draft-草稿, published-已发布, archived-已归档',
  published_at DATETIME COMMENT '发布时间',
  view_count INT DEFAULT 0 COMMENT '浏览次数',
  is_pinned TINYINT(1) DEFAULT 0 COMMENT '是否置顶',
  attachments JSON COMMENT '附件列表',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_category (category),
  INDEX idx_status (status),
  INDEX idx_published_at (published_at),
  INDEX idx_author_id (author_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='技术通讯表';`);

  // --- technical_communication_reads ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS technical_communication_reads (
  id INT PRIMARY KEY AUTO_INCREMENT COMMENT '记录ID',
  communication_id INT NOT NULL COMMENT '通讯ID',
  user_id INT NOT NULL COMMENT '用户ID',
  read_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '阅读时间',
  read_duration INT COMMENT '阅读时长（秒）',
  UNIQUE KEY uk_communication_user (communication_id, user_id),
  INDEX idx_communication_id (communication_id),
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='技术通讯阅读记录表';`);

  // --- technical_communication_comments ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS technical_communication_comments (
  id INT PRIMARY KEY AUTO_INCREMENT COMMENT '评论ID',
  communication_id INT NOT NULL COMMENT '通讯ID',
  user_id INT NOT NULL COMMENT '用户ID',
  user_name VARCHAR(100) COMMENT '用户姓名',
  content TEXT NOT NULL COMMENT '评论内容',
  parent_id INT COMMENT '父评论ID（用于回复）',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  INDEX idx_communication_id (communication_id),
  INDEX idx_user_id (user_id),
  INDEX idx_parent_id (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='技术通讯评论表';`);

  // --- inspection_templates ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS inspection_templates (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    template_code VARCHAR(50) NOT NULL COMMENT '模板编号',
    template_name VARCHAR(100) NOT NULL COMMENT '模板名称',
    inspection_type ENUM('incoming', 'process', 'final') NOT NULL COMMENT '检验类型：来料/过程/成品',
    material_type VARCHAR(100) COMMENT '适用物料类型',
    version VARCHAR(20) NOT NULL COMMENT '版本号',
    description TEXT COMMENT '模板描述',
    status ENUM('active', 'inactive', 'draft') NOT NULL DEFAULT 'draft' COMMENT '状态：启用/停用/草稿',
    created_by BIGINT NOT NULL COMMENT '创建人ID',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_template_code (template_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='检验模板表';`);

  // --- inspection_items ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS inspection_items (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    item_name VARCHAR(100) NOT NULL COMMENT '检验项目名称',
    standard TEXT NOT NULL COMMENT '检验标准',
    type ENUM('visual', 'dimension', 'function', 'performance', 'safety', 'other') NOT NULL COMMENT '检验类型',
    is_critical BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否关键项',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='检验项目表';`);

  // --- template_item_mappings ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS template_item_mappings (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    template_id BIGINT NOT NULL COMMENT '模板ID',
    item_id BIGINT NOT NULL COMMENT '项目ID',
    sort_order INT NOT NULL DEFAULT 0 COMMENT '排序顺序',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (template_id) REFERENCES inspection_templates(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES inspection_items(id) ON DELETE CASCADE,
    UNIQUE KEY uk_template_item (template_id, item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='模板-项目关联表';`);

  // --- material_template_mappings ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS material_template_mappings (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    material_id BIGINT NOT NULL COMMENT '物料ID',
    template_id BIGINT NOT NULL COMMENT '模板ID',
    is_default BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否默认模板',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (template_id) REFERENCES inspection_templates(id) ON DELETE CASCADE,
    UNIQUE KEY uk_material_template (material_id, template_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物料-模板关联表';`);

  // --- print_settings ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS print_settings (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL COMMENT '设置名称',
  default_paper_size VARCHAR(20) NOT NULL DEFAULT 'A4' COMMENT '默认纸张大小',
  default_orientation VARCHAR(20) NOT NULL DEFAULT 'portrait' COMMENT '默认打印方向',
  default_margin_top INT NOT NULL DEFAULT 10 COMMENT '默认上边距(mm)',
  default_margin_right INT NOT NULL DEFAULT 10 COMMENT '默认右边距(mm)',
  default_margin_bottom INT NOT NULL DEFAULT 10 COMMENT '默认下边距(mm)',
  default_margin_left INT NOT NULL DEFAULT 10 COMMENT '默认左边距(mm)',
  header_content TEXT COMMENT '页眉内容',
  footer_content TEXT COMMENT '页脚内容',
  company_logo VARCHAR(255) COMMENT '公司Logo路径',
  status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '状态：1-启用，0-禁用',
  created_by INT COMMENT '创建人ID',
  updated_by INT COMMENT '更新人ID',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='打印设置表';`);

  // --- material_sources ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS material_sources (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL COMMENT '来源名称',
    code VARCHAR(50) NOT NULL UNIQUE COMMENT '来源编码',
    type ENUM('internal', 'external') NOT NULL DEFAULT 'external' COMMENT '来源类型：internal-内部，external-外部',
    sort INT NOT NULL DEFAULT 0 COMMENT '排序',
    status TINYINT NOT NULL DEFAULT 1 COMMENT '状态：0-禁用，1-启用',
    description TEXT COMMENT '描述',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_type (type),
    INDEX idx_status (status),
    INDEX idx_sort (sort)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物料来源表';`);

  // --- refresh_tokens ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  user_id INT NOT NULL COMMENT '用户ID',
  token VARCHAR(500) NOT NULL COMMENT 'Refresh Token（加密存储）',
  token_family VARCHAR(100) NULL COMMENT 'Token家族ID（用于检测Token重用）',
  expires_at DATETIME NOT NULL COMMENT '过期时间',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  last_used_at DATETIME NULL COMMENT '最后使用时间',
  ip_address VARCHAR(45) NULL COMMENT '客户端IP地址',
  user_agent VARCHAR(500) NULL COMMENT '客户端User-Agent',
  is_revoked TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已撤销',
  revoked_at DATETIME NULL COMMENT '撤销时间',
  revoked_reason VARCHAR(255) NULL COMMENT '撤销原因',
  PRIMARY KEY (id),
  UNIQUE KEY uk_token (token(255)),
  KEY idx_user_id (user_id),
  KEY idx_expires_at (expires_at),
  KEY idx_token_family (token_family),
  KEY idx_is_revoked (is_revoked), FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='刷新Token跟踪表';`);

  // --- security_logs ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS security_logs (
  id INT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  user_id INT NULL COMMENT '用户ID',
  event_type VARCHAR(50) NOT NULL COMMENT '事件类型（login, logout, token_refresh, failed_login等）',
  event_status ENUM('success', 'failure', 'warning') NOT NULL DEFAULT 'success' COMMENT '事件状态',
  ip_address VARCHAR(45) NULL COMMENT 'IP地址',
  user_agent VARCHAR(500) NULL COMMENT 'User-Agent',
  details TEXT NULL COMMENT '详细信息（JSON格式）',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_user_id (user_id),
  KEY idx_event_type (event_type),
  KEY idx_created_at (created_at),
  KEY idx_event_status (event_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='安全审计日志表';`);

  // --- sessions ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(128) NOT NULL COMMENT '会话ID',
  user_id INT NULL COMMENT '用户ID',
  csrf_token VARCHAR(128) NULL COMMENT 'CSRF Token',
  csrf_token_expires_at DATETIME NULL COMMENT 'CSRF Token过期时间',
  data TEXT NULL COMMENT '会话数据（JSON格式）',
  ip_address VARCHAR(45) NULL COMMENT 'IP地址',
  user_agent VARCHAR(500) NULL COMMENT 'User-Agent',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  expires_at DATETIME NOT NULL COMMENT '过期时间',
  PRIMARY KEY (id),
  KEY idx_user_id (user_id),
  KEY idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会话管理表';`);

  // --- budgets ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS budgets (
  id INT PRIMARY KEY AUTO_INCREMENT COMMENT '预算ID',
  budget_no VARCHAR(50) NOT NULL UNIQUE COMMENT '预算编号',
  budget_name VARCHAR(200) NOT NULL COMMENT '预算名称',
  budget_year INT NOT NULL COMMENT '预算年度',
  budget_type ENUM('年度预算', '季度预算', '月度预算', '项目预算') NOT NULL DEFAULT '年度预算' COMMENT '预算类型',
  department_id INT DEFAULT NULL COMMENT '部门ID',
  start_date DATE NOT NULL COMMENT '开始日期',
  end_date DATE NOT NULL COMMENT '结束日期',
  total_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT '预算总金额',
  used_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT '已使用金额',
  remaining_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT '剩余金额',
  status ENUM('草稿', '待审批', '已审批', '执行中', '已完成', '已关闭') NOT NULL DEFAULT '草稿' COMMENT '预算状态',
  approval_status ENUM('未提交', '审批中', '已通过', '已驳回') NOT NULL DEFAULT '未提交' COMMENT '审批状态',
  description TEXT COMMENT '预算说明',
  created_by INT DEFAULT NULL COMMENT '创建人ID',
  approved_by INT DEFAULT NULL COMMENT '审批人ID',
  approved_at DATETIME DEFAULT NULL COMMENT '审批时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_budget_no (budget_no),
  INDEX idx_budget_year (budget_year),
  INDEX idx_department_id (department_id),
  INDEX idx_status (status),
  INDEX idx_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='预算表';`);

  // --- budget_details ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS budget_details (
  id INT PRIMARY KEY AUTO_INCREMENT COMMENT '明细ID',
  budget_id INT NOT NULL COMMENT '预算ID',
  account_id INT NOT NULL COMMENT '会计科目ID',
  department_id INT DEFAULT NULL COMMENT '部门ID',
  budget_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT '预算金额',
  used_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT '已使用金额',
  remaining_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT '剩余金额',
  warning_threshold DECIMAL(5,2) DEFAULT 80.00 COMMENT '预警阈值(%)',
  description TEXT COMMENT '说明',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_budget_id (budget_id),
  INDEX idx_account_id (account_id),
  INDEX idx_department_id (department_id),
  FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='预算明细表';`);

  // --- budget_execution ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS budget_execution (
  id INT PRIMARY KEY AUTO_INCREMENT COMMENT '执行ID',
  budget_id INT NOT NULL COMMENT '预算ID',
  budget_detail_id INT NOT NULL COMMENT '预算明细ID',
  execution_date DATE NOT NULL COMMENT '执行日期',
  execution_amount DECIMAL(15,2) NOT NULL COMMENT '执行金额',
  document_type VARCHAR(50) COMMENT '关联单据类型',
  document_id INT COMMENT '关联单据ID',
  document_no VARCHAR(50) COMMENT '关联单据号',
  gl_entry_id INT COMMENT '关联会计分录ID',
  description TEXT COMMENT '说明',
  created_by INT DEFAULT NULL COMMENT '创建人ID',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  INDEX idx_budget_id (budget_id),
  INDEX idx_budget_detail_id (budget_detail_id),
  INDEX idx_execution_date (execution_date),
  INDEX idx_document (document_type, document_id),
  INDEX idx_gl_entry_id (gl_entry_id),
  FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE,
  FOREIGN KEY (budget_detail_id) REFERENCES budget_details(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='预算执行表';`);

  // --- budget_warnings ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS budget_warnings (
  id INT PRIMARY KEY AUTO_INCREMENT COMMENT '预警ID',
  budget_id INT NOT NULL COMMENT '预算ID',
  budget_detail_id INT DEFAULT NULL COMMENT '预算明细ID',
  warning_type ENUM('超预算', '接近预算', '预算不足') NOT NULL COMMENT '预警类型',
  warning_level ENUM('低', '中', '高') NOT NULL DEFAULT '中' COMMENT '预警级别',
  warning_message TEXT NOT NULL COMMENT '预警信息',
  is_read BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否已读',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  INDEX idx_budget_id (budget_id),
  INDEX idx_budget_detail_id (budget_detail_id),
  INDEX idx_is_read (is_read),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE,
  FOREIGN KEY (budget_detail_id) REFERENCES budget_details(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='预算预警表';`);

  // --- pricing_strategy_fields ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS pricing_strategy_fields (
  id INT AUTO_INCREMENT PRIMARY KEY,
  field_name VARCHAR(50) NOT NULL UNIQUE COMMENT '字段名(英文,用于代码标识)',
  field_label VARCHAR(100) NOT NULL COMMENT '字段显示标签(中文)',
  field_type ENUM('percentage', 'amount') DEFAULT 'amount' COMMENT '字段类型: percentage=百分比, amount=金额',
  unit VARCHAR(20) COMMENT '单位(如:元、%、元/件)',
  is_active TINYINT(1) DEFAULT 1 COMMENT '是否启用: 1=启用, 0=禁用',
  sort_order INT DEFAULT 0 COMMENT '排序序号,越小越靠前',
  description VARCHAR(255) DEFAULT NULL COMMENT '字段描述',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_is_active (is_active),
  INDEX idx_sort_order (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='定价策略字段定义表';`);

  // --- product_pricing_strategies ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS product_pricing_strategies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pricing_id INT NOT NULL COMMENT '关联product_pricing表的定价记录ID',
  field_id INT NOT NULL COMMENT '关联pricing_strategy_fields表的字段ID',
  field_value DECIMAL(15,4) NOT NULL COMMENT '字段值',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (field_id) REFERENCES pricing_strategy_fields(id) ON DELETE RESTRICT,
  UNIQUE KEY uk_pricing_field (pricing_id, field_id),
  INDEX idx_pricing_id (pricing_id),
  INDEX idx_field_id (field_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='产品定价策略值表';`);

  // --- bom_material_price_adjustments ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS bom_material_price_adjustments (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
  product_id INT NOT NULL COMMENT '产品ID',
  bom_id INT NOT NULL COMMENT 'BOM ID',
  material_id INT NOT NULL COMMENT '物料ID',
  original_price DECIMAL(10,2) NOT NULL COMMENT '原始采购价格',
  adjusted_price DECIMAL(10,2) NOT NULL COMMENT '调整后价格',
  adjustment_reason VARCHAR(500) COMMENT '调整原因',
  version INT DEFAULT 1 COMMENT '调整版本号',
  is_active TINYINT(1) DEFAULT 1 COMMENT '是否当前生效: 1=生效, 0=历史',
  created_by INT COMMENT '创建人ID',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_product_material (product_id, material_id),
  INDEX idx_bom_material (bom_id, material_id),
  INDEX idx_is_active (is_active),
  INDEX idx_created_at (created_at), FOREIGN KEY (product_id) REFERENCES materials(id) ON DELETE CASCADE, FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE, FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='BOM物料价格调整记录表';`);

  // --- quality_inspection_measurements ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS quality_inspection_measurements (
  id            INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
  item_id       INT NOT NULL                  COMMENT '关联检验项目 ID (quality_inspection_items.id)',
  sample_no     SMALLINT NOT NULL DEFAULT 1   COMMENT '样本序号 (1,2,3...N)',
  measured_value DECIMAL(15,6) DEFAULT NULL   COMMENT '实测值',
  is_qualified  TINYINT(1) DEFAULT NULL       COMMENT '是否合格 (1=合格, 0=不合格, NULL=未判定)',
  measured_at   DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '测量时间',
  measured_by   VARCHAR(50) DEFAULT NULL       COMMENT '测量人',
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_item_id (item_id),
  INDEX idx_sample_no (item_id, sample_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='检验测量数据子表 — 每条对应一个样本的单次测量';`);

  // --- gauges ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS gauges (
  id             INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
  gauge_no       VARCHAR(50)  NOT NULL UNIQUE  COMMENT '量具编号',
  gauge_name     VARCHAR(100) NOT NULL         COMMENT '量具名称',
  gauge_type     VARCHAR(50)  DEFAULT NULL     COMMENT '量具类型 (游标卡尺/千分尺/量块/CMM/...)',
  model          VARCHAR(100) DEFAULT NULL     COMMENT '型号规格',
  manufacturer   VARCHAR(100) DEFAULT NULL     COMMENT '制造商',
  serial_number  VARCHAR(100) DEFAULT NULL     COMMENT '出厂编号',
  measurement_range VARCHAR(100) DEFAULT NULL  COMMENT '测量范围',
  accuracy       VARCHAR(50)  DEFAULT NULL     COMMENT '精度等级',
  resolution     VARCHAR(50)  DEFAULT NULL     COMMENT '分辨力',
  location       VARCHAR(100) DEFAULT NULL     COMMENT '存放位置',
  custodian      VARCHAR(50)  DEFAULT NULL     COMMENT '保管人',
  status         ENUM('in_use','calibrating','repaired','scrapped','idle')
                 DEFAULT 'idle'                COMMENT '使用状态',
  purchase_date  DATE DEFAULT NULL             COMMENT '购置日期',
  last_calibration_date DATE DEFAULT NULL      COMMENT '上次校准日期',
  next_calibration_date DATE DEFAULT NULL      COMMENT '下次校准日期',
  calibration_cycle_days INT DEFAULT 365       COMMENT '校准周期 (天)',
  note           TEXT DEFAULT NULL             COMMENT '备注',
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_next_cal (next_calibration_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='量具台账';`);

  // --- gauge_calibration_records ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS gauge_calibration_records (
  id               INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
  gauge_id         INT NOT NULL                   COMMENT '关联量具ID',
  calibration_no   VARCHAR(50) NOT NULL UNIQUE    COMMENT '校准记录编号',
  calibration_type ENUM('internal','external') DEFAULT 'internal' COMMENT '校准类型',
  calibration_date DATE NOT NULL                  COMMENT '校准日期',
  next_due_date    DATE DEFAULT NULL              COMMENT '下次到期日期',
  calibrated_by    VARCHAR(50) DEFAULT NULL       COMMENT '校准人/机构',
  result           ENUM('qualified','unqualified','limited') DEFAULT NULL COMMENT '校准结果',
  certificate_no   VARCHAR(100) DEFAULT NULL      COMMENT '证书编号',
  standard_used    VARCHAR(200) DEFAULT NULL      COMMENT '使用的标准器',
  temperature      DECIMAL(5,1) DEFAULT NULL      COMMENT '环境温度 (°C)',
  humidity         DECIMAL(5,1) DEFAULT NULL       COMMENT '环境湿度 (%RH)',
  deviation        DECIMAL(15,6) DEFAULT NULL      COMMENT '偏差值',
  uncertainty      DECIMAL(15,6) DEFAULT NULL      COMMENT '不确定度',
  note             TEXT DEFAULT NULL               COMMENT '备注',
  attachment_url   VARCHAR(500) DEFAULT NULL       COMMENT '证书附件路径',
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_gauge_id (gauge_id),
  INDEX idx_cal_date (calibration_date), FOREIGN KEY (gauge_id)
    REFERENCES gauges(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='量具校准记录';`);

  // --- spc_control_plans ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS spc_control_plans (
  id               INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
  plan_no          VARCHAR(50)  NOT NULL UNIQUE  COMMENT '控制计划编号',
  plan_name        VARCHAR(100) NOT NULL         COMMENT '控制计划名称',
  product_id       INT DEFAULT NULL              COMMENT '产品ID',
  product_code     VARCHAR(50) DEFAULT NULL      COMMENT '产品编码',
  product_name     VARCHAR(100) DEFAULT NULL     COMMENT '产品名称',
  process_id       INT DEFAULT NULL              COMMENT '工序ID',
  process_name     VARCHAR(50) DEFAULT NULL      COMMENT '工序名称',
  characteristic   VARCHAR(100) NOT NULL         COMMENT '监控特性 (如: 外径尺寸)',
  usl              DECIMAL(15,6) DEFAULT NULL    COMMENT '规格上限 (USL)',
  lsl              DECIMAL(15,6) DEFAULT NULL    COMMENT '规格下限 (LSL)',
  target_value     DECIMAL(15,6) DEFAULT NULL    COMMENT '目标值',
  subgroup_size    INT DEFAULT 5                 COMMENT '子组大小 (n)',
  chart_type       ENUM('xbar_r','xbar_s','imr','p','np','c','u')
                   DEFAULT 'xbar_r'              COMMENT '控制图类型',
  is_active        TINYINT(1) DEFAULT 1          COMMENT '是否启用',
  note             TEXT DEFAULT NULL              COMMENT '备注',
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_product (product_id),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='SPC 控制计划';`);

  // --- spc_data_points ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS spc_data_points (
  id              INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
  plan_id         INT NOT NULL                   COMMENT '关联控制计划ID',
  subgroup_no     INT NOT NULL                   COMMENT '子组序号',
  sample_no       SMALLINT NOT NULL              COMMENT '子组内样本序号',
  measured_value  DECIMAL(15,6) NOT NULL         COMMENT '实测值',
  measured_at     DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '测量时间',
  measured_by     VARCHAR(50) DEFAULT NULL       COMMENT '测量人',
  batch_no        VARCHAR(50) DEFAULT NULL       COMMENT '关联批次号',
  inspection_id   INT DEFAULT NULL               COMMENT '关联检验单ID',
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_plan_subgroup (plan_id, subgroup_no), FOREIGN KEY (plan_id)
    REFERENCES spc_control_plans(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='SPC 数据采集点';`);

  // --- supplier_quality_scores ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS supplier_quality_scores (
  id                INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
  supplier_id       INT NOT NULL                   COMMENT '供应商ID',
  period            VARCHAR(7) NOT NULL            COMMENT '统计周期 YYYY-MM',
  -- 来料检验指标
  total_lots        INT DEFAULT 0                  COMMENT '来料批次总数',
  accepted_lots     INT DEFAULT 0                  COMMENT '合格批次数',
  rejected_lots     INT DEFAULT 0                  COMMENT '拒收批次数',
  total_qty         DECIMAL(15,2) DEFAULT 0        COMMENT '来料总数量',
  defect_qty        DECIMAL(15,2) DEFAULT 0        COMMENT '不良数量',
  ppm               DECIMAL(10,2) DEFAULT 0        COMMENT 'PPM (不良率 百万分比)',
  lot_accept_rate   DECIMAL(5,2) DEFAULT 0         COMMENT '批次合格率 (%)',
  -- 交付指标
  total_deliveries  INT DEFAULT 0                  COMMENT '交货批次总数',
  on_time_deliveries INT DEFAULT 0                 COMMENT '准时交货批次数',
  delivery_rate     DECIMAL(5,2) DEFAULT 0         COMMENT '准时交货率 (%)',
  -- 8D 响应时效
  total_8d_reports  INT DEFAULT 0                  COMMENT '8D 报告总数',
  closed_8d_on_time INT DEFAULT 0                  COMMENT '按时关闭数',
  avg_8d_days       DECIMAL(5,1) DEFAULT 0         COMMENT '平均 8D 关闭天数',
  -- 综合评分
  quality_score     DECIMAL(5,2) DEFAULT 0         COMMENT '质量得分 (0-100)',
  delivery_score    DECIMAL(5,2) DEFAULT 0         COMMENT '交付得分 (0-100)',
  response_score    DECIMAL(5,2) DEFAULT 0         COMMENT '响应得分 (0-100)',
  total_score       DECIMAL(5,2) DEFAULT 0         COMMENT '综合得分 (0-100)',
  grade             ENUM('A','B','C','D')
                    DEFAULT 'C'                     COMMENT '等级评定 A/B/C/D',
  note              TEXT DEFAULT NULL               COMMENT '评审备注',
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_supplier_period (supplier_id, period),
  INDEX idx_period (period),
  INDEX idx_grade (grade)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='供应商质量计分卡 (月度)';`);

  // --- batch_inventory ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS batch_inventory (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
  material_id INT NOT NULL COMMENT '物料ID',
  material_code VARCHAR(50) NOT NULL COMMENT '物料编码',
  material_name VARCHAR(200) COMMENT '物料名称',
  batch_number VARCHAR(50) NOT NULL COMMENT '批次号',
  supplier_id INT COMMENT '供应商ID',
  supplier_name VARCHAR(200) COMMENT '供应商名称',
  
  -- 数量信息
  original_quantity DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT '原始数量',
  current_quantity DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT '当前库存数量',
  reserved_quantity DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT '预留数量',
  available_quantity DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT '可用数量',
  unit VARCHAR(20) COMMENT '单位',
  
  -- 时间信息 (FIFO关键字段)
  production_date DATE COMMENT '生产日期',
  receipt_date DATETIME NOT NULL COMMENT '入库时间',
  expiry_date DATE COMMENT '有效期',
  
  -- 位置信息
  warehouse_id INT COMMENT '仓库ID',
  warehouse_name VARCHAR(100) COMMENT '仓库名称',
  location VARCHAR(100) COMMENT '库位',
  
  -- 状态信息
  status ENUM('active', 'reserved', 'locked', 'expired', 'consumed') NOT NULL DEFAULT 'active' COMMENT '状态',
  quality_status ENUM('pending', 'passed', 'failed', 'exempted') DEFAULT 'pending' COMMENT '质量状态',
  
  -- 成本信息
  unit_cost DECIMAL(10,4) COMMENT '单位成本',
  total_cost DECIMAL(15,4) COMMENT '总成本',
  
  -- 追溯信息
  purchase_order_id INT COMMENT '采购订单ID',
  purchase_order_no VARCHAR(50) COMMENT '采购订单号',
  receipt_id INT COMMENT '入库单ID',
  receipt_no VARCHAR(50) COMMENT '入库单号',
  inspection_id INT COMMENT '检验单ID',
  
  -- 审计字段
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  created_by VARCHAR(50) COMMENT '创建人',
  updated_by VARCHAR(50) COMMENT '更新人',
  
  -- 索引
  INDEX idx_material_batch (material_id, batch_number),
  INDEX idx_material_code (material_code),
  INDEX idx_batch_number (batch_number),
  INDEX idx_receipt_date (receipt_date),
  INDEX idx_status (status),
  INDEX idx_quality_status (quality_status),
  INDEX idx_warehouse (warehouse_id),
  INDEX idx_supplier (supplier_id),
  INDEX idx_purchase_order (purchase_order_id),
  INDEX idx_available_qty (available_quantity),
  
  -- 唯一约束
  UNIQUE KEY uk_material_batch_receipt (material_id, batch_number, receipt_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='批次库存表-支持FIFO逻辑';`);

  // --- batch_transactions ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS batch_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
  batch_inventory_id INT NOT NULL COMMENT '批次库存ID',
  material_id INT NOT NULL COMMENT '物料ID',
  material_code VARCHAR(50) NOT NULL COMMENT '物料编码',
  batch_number VARCHAR(50) NOT NULL COMMENT '批次号',
  
  -- 交易信息
  transaction_type ENUM('in', 'out', 'transfer', 'adjust', 'reserve', 'unreserve') NOT NULL COMMENT '交易类型',
  transaction_no VARCHAR(50) COMMENT '交易单号',
  quantity DECIMAL(12,4) NOT NULL COMMENT '数量',
  unit VARCHAR(20) COMMENT '单位',
  
  -- 数量变化
  before_quantity DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT '变更前数量',
  after_quantity DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT '变更后数量',
  
  -- 位置信息
  from_warehouse_id INT COMMENT '源仓库ID',
  from_location VARCHAR(100) COMMENT '源库位',
  to_warehouse_id INT COMMENT '目标仓库ID',
  to_location VARCHAR(100) COMMENT '目标库位',
  
  -- 关联信息
  reference_type VARCHAR(50) COMMENT '关联单据类型',
  reference_id INT COMMENT '关联单据ID',
  reference_no VARCHAR(50) COMMENT '关联单据号',
  
  -- 成本信息
  unit_cost DECIMAL(10,4) COMMENT '单位成本',
  total_cost DECIMAL(15,4) COMMENT '总成本',
  
  -- 审计字段
  transaction_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '交易时间',
  operator VARCHAR(50) COMMENT '操作员',
  remarks TEXT COMMENT '备注',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  
  -- 索引
  INDEX idx_batch_inventory (batch_inventory_id),
  INDEX idx_material_batch (material_id, batch_number),
  INDEX idx_transaction_type (transaction_type),
  INDEX idx_transaction_date (transaction_date),
  INDEX idx_reference (reference_type, reference_id),
  INDEX idx_operator (operator),
  
  -- 外键约束
  FOREIGN KEY (batch_inventory_id) REFERENCES batch_inventory(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='批次流转记录表';`);

  // --- fifo_outbound_queue ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS fifo_outbound_queue (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
  material_id INT NOT NULL COMMENT '物料ID',
  material_code VARCHAR(50) NOT NULL COMMENT '物料编码',
  batch_inventory_id INT NOT NULL COMMENT '批次库存ID',
  batch_number VARCHAR(50) NOT NULL COMMENT '批次号',
  
  -- 队列信息
  queue_priority INT NOT NULL DEFAULT 0 COMMENT '队列优先级(基于入库时间)',
  available_quantity DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT '可用数量',
  reserved_quantity DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT '预留数量',
  
  -- 时间信息
  receipt_date DATETIME NOT NULL COMMENT '入库时间',
  expiry_date DATE COMMENT '有效期',
  
  -- 状态
  status ENUM('active', 'exhausted', 'expired', 'locked') NOT NULL DEFAULT 'active' COMMENT '状态',
  
  -- 审计字段
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  
  -- 索引
  INDEX idx_material_priority (material_id, queue_priority),
  INDEX idx_material_code (material_code),
  INDEX idx_batch_inventory (batch_inventory_id),
  INDEX idx_status (status),
  INDEX idx_receipt_date (receipt_date),
  
  -- 外键约束
  FOREIGN KEY (batch_inventory_id) REFERENCES batch_inventory(id) ON DELETE CASCADE,
  
  -- 唯一约束
  UNIQUE KEY uk_material_batch (material_id, batch_inventory_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='FIFO出库队列表';`);

  // --- traceability_chains ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS traceability_chains (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
  chain_no VARCHAR(50) UNIQUE NOT NULL COMMENT '追溯链路编号',
  
  -- 产品信息
  product_type ENUM('material', 'product', 'component') NOT NULL COMMENT '产品类型',
  product_id INT COMMENT '产品ID',
  product_code VARCHAR(50) NOT NULL COMMENT '产品编码',
  product_name VARCHAR(200) COMMENT '产品名称',
  batch_number VARCHAR(50) NOT NULL COMMENT '批次号',
  
  -- 数量信息
  total_quantity DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT '总数量',
  consumed_quantity DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT '已消耗数量',
  remaining_quantity DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT '剩余数量',
  unit VARCHAR(20) COMMENT '单位',
  
  -- 时间信息
  start_date DATETIME COMMENT '开始时间',
  end_date DATETIME COMMENT '结束时间',
  production_date DATE COMMENT '生产日期',
  
  -- 状态信息
  status ENUM('active', 'completed', 'cancelled', 'expired') NOT NULL DEFAULT 'active' COMMENT '状态',
  quality_status ENUM('pending', 'passed', 'failed', 'exempted') DEFAULT 'pending' COMMENT '质量状态',
  
  -- 关联信息
  parent_chain_id INT COMMENT '父链路ID',
  root_chain_id INT COMMENT '根链路ID',
  chain_level INT NOT NULL DEFAULT 1 COMMENT '链路层级',
  
  -- 审计字段
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  created_by VARCHAR(50) COMMENT '创建人',
  
  -- 索引
  INDEX idx_product_batch (product_code, batch_number),
  INDEX idx_product_type (product_type),
  INDEX idx_status (status),
  INDEX idx_parent_chain (parent_chain_id),
  INDEX idx_root_chain (root_chain_id),
  INDEX idx_chain_level (chain_level),
  INDEX idx_start_date (start_date),
  
  -- 外键约束
  FOREIGN KEY (parent_chain_id) REFERENCES traceability_chains(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='追溯链路主表';`);

  // --- traceability_chain_steps ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS traceability_chain_steps (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
  chain_id INT NOT NULL COMMENT '链路ID',
  step_type VARCHAR(50) NOT NULL COMMENT '步骤类型',
  step_name VARCHAR(100) NOT NULL COMMENT '步骤名称',
  step_order INT NOT NULL COMMENT '步骤顺序',

  -- 步骤状态
  status ENUM('pending', 'in_progress', 'completed', 'skipped', 'failed') NOT NULL DEFAULT 'pending' COMMENT '状态',
  start_time DATETIME COMMENT '开始时间',
  end_time DATETIME COMMENT '结束时间',
  duration INT COMMENT '持续时间(秒)',

  -- 操作信息
  operator VARCHAR(50) COMMENT '操作员',
  equipment VARCHAR(100) COMMENT '设备',
  location VARCHAR(100) COMMENT '位置',

  -- 数量信息
  input_quantity DECIMAL(12,4) COMMENT '输入数量',
  output_quantity DECIMAL(12,4) COMMENT '输出数量',
  waste_quantity DECIMAL(12,4) COMMENT '损耗数量',
  unit VARCHAR(20) COMMENT '单位',

  -- 质量信息
  quality_result ENUM('pending', 'passed', 'failed', 'exempted') DEFAULT 'pending' COMMENT '质量结果',
  inspection_id INT COMMENT '检验单ID',

  -- 关联信息
  reference_type VARCHAR(50) COMMENT '关联单据类型',
  reference_id INT COMMENT '关联单据ID',
  reference_no VARCHAR(50) COMMENT '关联单据号',

  -- 参数和备注
  parameters JSON COMMENT '步骤参数',
  remarks TEXT COMMENT '备注',

  -- 审计字段
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

  -- 索引
  INDEX idx_chain_order (chain_id, step_order),
  INDEX idx_step_type (step_type),
  INDEX idx_status (status),
  INDEX idx_reference (reference_type, reference_id),
  INDEX idx_operator (operator),
  INDEX idx_start_time (start_time),

  -- 外键约束
  FOREIGN KEY (chain_id) REFERENCES traceability_chains(id) ON DELETE CASCADE,

  -- 唯一约束
  UNIQUE KEY uk_chain_step_order (chain_id, step_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='追溯链路步骤表';`);

  // --- batch_relationships ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS batch_relationships (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
  parent_batch_id INT NOT NULL COMMENT '父批次ID',
  child_batch_id INT NOT NULL COMMENT '子批次ID',
  parent_material_code VARCHAR(50) NOT NULL COMMENT '父物料编码',
  child_material_code VARCHAR(50) NOT NULL COMMENT '子物料编码',
  parent_batch_number VARCHAR(50) NOT NULL COMMENT '父批次号',
  child_batch_number VARCHAR(50) NOT NULL COMMENT '子批次号',

  -- 关系信息
  relationship_type ENUM('consume', 'produce', 'transform', 'assemble') NOT NULL COMMENT '关系类型',
  consumed_quantity DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT '消耗数量',
  produced_quantity DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT '产出数量',
  conversion_ratio DECIMAL(10,6) DEFAULT 1.000000 COMMENT '转换比例',

  -- 关联信息
  process_type VARCHAR(50) COMMENT '工艺类型',
  reference_type VARCHAR(50) COMMENT '关联单据类型',
  reference_id INT COMMENT '关联单据ID',
  reference_no VARCHAR(50) COMMENT '关联单据号',

  -- 审计字段
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  operator VARCHAR(50) COMMENT '操作员',
  remarks TEXT COMMENT '备注',

  -- 索引
  INDEX idx_parent_batch (parent_batch_id),
  INDEX idx_child_batch (child_batch_id),
  INDEX idx_parent_material (parent_material_code),
  INDEX idx_child_material (child_material_code),
  INDEX idx_relationship_type (relationship_type),
  INDEX idx_reference (reference_type, reference_id),

  -- 外键约束
  FOREIGN KEY (parent_batch_id) REFERENCES batch_inventory(id) ON DELETE CASCADE,
  FOREIGN KEY (child_batch_id) REFERENCES batch_inventory(id) ON DELETE CASCADE,

  -- 唯一约束
  UNIQUE KEY uk_parent_child_ref (parent_batch_id, child_batch_id, reference_type, reference_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='批次关联关系表';`);

  // --- batch_traceability_relations ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS batch_traceability_relations (
  id int(11) NOT NULL AUTO_INCREMENT,
  source_batch_id int(11) NOT NULL COMMENT '源批次ID（原材料批次）',
  target_batch_id int(11) NOT NULL COMMENT '目标批次ID（成品批次）',
  relation_type enum('material_to_product','product_to_material','product_to_product') NOT NULL DEFAULT 'material_to_product' COMMENT '关系类型',
  source_quantity decimal(15,4) NOT NULL DEFAULT '0.0000' COMMENT '源批次消耗数量',
  target_quantity decimal(15,4) NOT NULL DEFAULT '0.0000' COMMENT '目标批次产出数量',
  conversion_ratio decimal(10,6) DEFAULT NULL COMMENT '转换比例',
  production_task_id int(11) DEFAULT NULL COMMENT '生产任务ID',
  production_task_code varchar(50) DEFAULT NULL COMMENT '生产任务编号',
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by varchar(50) DEFAULT NULL COMMENT '创建人',
  remarks text COMMENT '备注',
  PRIMARY KEY (id),
  KEY idx_source_batch (source_batch_id),
  KEY idx_target_batch (target_batch_id),
  KEY idx_relation_type (relation_type),
  KEY idx_production_task (production_task_id),
  KEY idx_created_at (created_at), FOREIGN KEY (source_batch_id) REFERENCES batch_inventory (id) ON DELETE CASCADE, FOREIGN KEY (target_batch_id) REFERENCES batch_inventory (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='批次追溯关系表';`);

  // --- product_sales_traceability ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS product_sales_traceability (
  id int(11) NOT NULL AUTO_INCREMENT,
  outbound_id int(11) NOT NULL COMMENT '销售出库单ID',
  outbound_no varchar(50) NOT NULL COMMENT '销售出库单号',
  order_id int(11) DEFAULT NULL COMMENT '销售订单ID',
  customer_id int(11) NOT NULL COMMENT '客户ID',
  customer_name varchar(100) NOT NULL COMMENT '客户名称',
  product_id int(11) NOT NULL COMMENT '产品ID',
  product_code varchar(50) NOT NULL COMMENT '产品编码',
  product_name varchar(100) NOT NULL COMMENT '产品名称',
  product_batch_id int(11) NOT NULL COMMENT '成品批次ID',
  product_batch_number varchar(50) NOT NULL COMMENT '成品批次号',
  allocated_quantity decimal(15,4) NOT NULL COMMENT '分配数量',
  delivery_date date NOT NULL COMMENT '交付日期',
  operator varchar(50) DEFAULT NULL COMMENT '操作员',
  remarks text COMMENT '备注',
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_outbound_id (outbound_id),
  KEY idx_outbound_no (outbound_no),
  KEY idx_customer_id (customer_id),
  KEY idx_product_id (product_id),
  KEY idx_product_batch_id (product_batch_id),
  KEY idx_delivery_date (delivery_date),
  KEY idx_product_code_batch (product_code, product_batch_number), FOREIGN KEY (product_batch_id) REFERENCES batch_inventory (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='成品销售追溯表';`);

  // --- bom_change_logs ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS bom_change_logs (
  id INT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  bom_id INT NOT NULL COMMENT 'BOM ID',
  change_type VARCHAR(20) NOT NULL COMMENT '变更类型：update-修改, delete-删除',
  changed_by INT COMMENT '变更人ID',
  changed_by_name VARCHAR(100) COMMENT '变更人姓名',
  affected_plans_count INT DEFAULT 0 COMMENT '影响的生产计划数量',
  remark TEXT COMMENT '备注说明',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  INDEX idx_bom_id (bom_id),
  INDEX idx_changed_by (changed_by),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='BOM变更日志表';`);

  // --- bom_explosion_cache ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS bom_explosion_cache (
  id INT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  product_id INT NOT NULL COMMENT '顶层产品ID',
  bom_id INT NOT NULL COMMENT '顶层BOM ID',
  bom_version VARCHAR(50) COMMENT 'BOM版本',
  material_id INT NOT NULL COMMENT '物料ID',
  material_code VARCHAR(50) COMMENT '物料编码',
  material_name VARCHAR(200) COMMENT '物料名称',
  level INT NOT NULL DEFAULT 1 COMMENT '展开后的层级（1-N）',
  quantity_per DECIMAL(10,4) NOT NULL DEFAULT 1 COMMENT '单位用量（考虑各级系数）',
  parent_material_id INT DEFAULT NULL COMMENT '直接父级物料ID',
  bom_path VARCHAR(500) COMMENT 'BOM路径，如 "产品A/组件B/零件C"',
  source_bom_id INT COMMENT '来源BOM ID（该物料所属的BOM）',
  unit_id INT COMMENT '单位ID',
  unit_name VARCHAR(50) COMMENT '单位名称',
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '缓存时间',
  is_valid TINYINT(1) DEFAULT 1 COMMENT '是否有效（BOM变更时置为无效）',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_product_id (product_id),
  INDEX idx_bom_id (bom_id),
  INDEX idx_material_id (material_id),
  INDEX idx_level (level),
  INDEX idx_is_valid (is_valid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='BOM展开缓存表';`);

  // --- bom_references ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS bom_references (
  id INT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  parent_bom_id INT NOT NULL COMMENT '父级BOM ID',
  child_bom_id INT NOT NULL COMMENT '子级BOM ID（被引用的BOM）',
  child_material_id INT NOT NULL COMMENT '子级物料ID',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  UNIQUE KEY uk_parent_child (parent_bom_id, child_bom_id),
  INDEX idx_parent_bom_id (parent_bom_id),
  INDEX idx_child_bom_id (child_bom_id),
  INDEX idx_child_material_id (child_material_id),
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='BOM引用关系表';`);

  // --- technical_communication_recipients ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS technical_communication_recipients (
  id INT PRIMARY KEY AUTO_INCREMENT,
  communication_id INT NOT NULL,
  user_id INT NOT NULL,
  recipient_type ENUM('to', 'cc') DEFAULT 'cc',
  is_read TINYINT(1) DEFAULT 0,
  read_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_comm_user (communication_id, user_id),
  INDEX idx_communication_id (communication_id),
  INDEX idx_user_id (user_id),
  INDEX idx_is_read (is_read),
  INDEX idx_type (recipient_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

  // --- technical_communication_department_recipients ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS technical_communication_department_recipients (
  id INT PRIMARY KEY AUTO_INCREMENT,
  communication_id INT NOT NULL,
  department_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_comm_dept (communication_id, department_id),
  INDEX idx_communication_id (communication_id),
  INDEX idx_department_id (department_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

  // --- first_article_rules ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS first_article_rules (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL COMMENT '产品ID',
    first_article_qty INT DEFAULT 5 COMMENT '首检数量（默认5只）',
    full_inspection_threshold INT DEFAULT 5 COMMENT '全检阈值（生产数量小于此值则全检）',
    template_id INT NULL COMMENT '检验模板ID',
    is_mandatory BOOLEAN DEFAULT TRUE COMMENT '是否强制首检',
    inspection_items TEXT COMMENT '检验项目JSON配置',
    note VARCHAR(500) COMMENT '备注',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_first_article_rules_product (product_id),
    FOREIGN KEY (product_id) REFERENCES materials(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='首检规则配置表';`);

  // --- material_shortage_records ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS material_shortage_records (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
  
  -- 出库单信息
  outbound_id INT NOT NULL COMMENT '出库单ID',
  outbound_no VARCHAR(50) NOT NULL COMMENT '出库单号',
  outbound_item_id INT NOT NULL COMMENT '出库单明细ID',
  
  -- 物料信息
  material_id INT NOT NULL COMMENT '物料ID',
  material_code VARCHAR(50) COMMENT '物料编码',
  material_name VARCHAR(200) COMMENT '物料名称',
  material_specs VARCHAR(200) COMMENT '物料规格',
  unit_id INT COMMENT '单位ID',
  unit_name VARCHAR(20) COMMENT '单位名称',
  
  -- 数量信息
  planned_quantity DECIMAL(10,2) NOT NULL COMMENT '计划数量',
  actual_quantity DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '实际已发数量',
  shortage_quantity DECIMAL(10,2) NOT NULL COMMENT '缺料数量',
  supplied_quantity DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '已补发数量',
  remaining_quantity DECIMAL(10,2) NOT NULL COMMENT '剩余缺料数量',
  
  -- 库存信息
  current_stock DECIMAL(10,2) DEFAULT 0 COMMENT '创建时的当前库存',
  
  -- 状态信息
  status ENUM('pending', 'partial_supplied', 'completed', 'cancelled') DEFAULT 'pending' COMMENT '缺料状态',
  
  -- 关联信息
  reference_type VARCHAR(50) COMMENT '关联类型(production_task/production_plan等)',
  reference_id INT COMMENT '关联ID',
  reference_no VARCHAR(50) COMMENT '关联单号',
  
  -- 补发记录
  supply_count INT DEFAULT 0 COMMENT '补发次数',
  last_supply_date DATETIME COMMENT '最后补发时间',
  last_supply_quantity DECIMAL(10,2) COMMENT '最后补发数量',
  
  -- 备注信息
  remark TEXT COMMENT '备注',
  
  -- 时间戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  completed_at DATETIME COMMENT '完成时间',
  
  -- 外键约束
  FOREIGN KEY (outbound_id) REFERENCES inventory_outbound(id) ON DELETE CASCADE,
  FOREIGN KEY (outbound_item_id) REFERENCES inventory_outbound_items(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES materials(id),
  
  -- 索引
  INDEX idx_status (status),
  INDEX idx_material (material_id),
  INDEX idx_outbound (outbound_id),
  INDEX idx_reference (reference_type, reference_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='缺料记录表';`);

  // --- material_supply_records ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS material_supply_records (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
  
  -- 关联信息
  shortage_record_id INT NOT NULL COMMENT '缺料记录ID',
  outbound_id INT NOT NULL COMMENT '出库单ID',
  outbound_no VARCHAR(50) NOT NULL COMMENT '出库单号',
  material_id INT NOT NULL COMMENT '物料ID',
  
  -- 补发信息
  supply_quantity DECIMAL(10,2) NOT NULL COMMENT '本次补发数量',
  before_actual_quantity DECIMAL(10,2) NOT NULL COMMENT '补发前已发数量',
  after_actual_quantity DECIMAL(10,2) NOT NULL COMMENT '补发后已发数量',
  remaining_shortage DECIMAL(10,2) NOT NULL COMMENT '补发后剩余缺料',
  
  -- 库存信息
  stock_before_supply DECIMAL(10,2) COMMENT '补发前库存',
  stock_after_supply DECIMAL(10,2) COMMENT '补发后库存',
  
  -- 操作信息
  operator VARCHAR(50) COMMENT '操作人',
  operator_id INT COMMENT '操作人ID',
  supply_date DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '补发时间',
  remark TEXT COMMENT '备注',
  
  -- 时间戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  
  -- 外键约束
  FOREIGN KEY (shortage_record_id) REFERENCES material_shortage_records(id) ON DELETE CASCADE,
  FOREIGN KEY (outbound_id) REFERENCES inventory_outbound(id),
  FOREIGN KEY (material_id) REFERENCES materials(id),
  
  -- 索引
  INDEX idx_shortage_record (shortage_record_id),
  INDEX idx_outbound (outbound_id),
  INDEX idx_supply_date (supply_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='补发记录表';`);

  // --- partial_outbound_config ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS partial_outbound_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  config_key VARCHAR(50) NOT NULL UNIQUE COMMENT '配置键',
  config_value TEXT COMMENT '配置值',
  description VARCHAR(200) COMMENT '配置说明',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='部分发料配置表';`);

  // --- technical_communication_likes ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS technical_communication_likes (
  id INT PRIMARY KEY AUTO_INCREMENT COMMENT '点赞ID',
  communication_id INT NOT NULL COMMENT '通讯ID',
  user_id INT NOT NULL COMMENT '用户ID',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '点赞时间',
  UNIQUE KEY uk_comm_user (communication_id, user_id),
  INDEX idx_communication_id (communication_id),
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='技术通讯点赞表';`);

  // --- technical_communication_favorites ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS technical_communication_favorites (
  id INT PRIMARY KEY AUTO_INCREMENT COMMENT '收藏ID',
  communication_id INT NOT NULL COMMENT '通讯ID',
  user_id INT NOT NULL COMMENT '用户ID',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '收藏时间',
  UNIQUE KEY uk_comm_user (communication_id, user_id),
  INDEX idx_communication_id (communication_id),
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='技术通讯收藏表';`);

  // --- todo_participants ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS todo_participants (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '参与者记录ID',
  todo_id INT NOT NULL COMMENT '任务ID',
  user_id INT NOT NULL COMMENT '参与者用户ID',
  role ENUM('creator', 'participant') DEFAULT 'participant' COMMENT '角色：creator创建者，participant参与者',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '添加时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  
  UNIQUE KEY uk_todo_user (todo_id, user_id) COMMENT '同一个任务不能重复添加相同用户',
  INDEX idx_todo_id (todo_id),
  INDEX idx_user_id (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='待办事项参与者表';`);

  // --- todo_notifications ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS todo_notifications (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '通知ID',
  todo_id INT NOT NULL COMMENT '任务ID',
  user_id INT NOT NULL COMMENT '接收通知的用户ID',
  type ENUM('created', 'updated', 'completed', 'deleted') DEFAULT 'created' COMMENT '通知类型',
  is_read TINYINT(1) DEFAULT 0 COMMENT '是否已读：0未读，1已读',
  message TEXT COMMENT '通知消息',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  
  INDEX idx_todo_id (todo_id),
  INDEX idx_user_id (user_id),
  INDEX idx_is_read (is_read),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='待办事项通知表';`);

  // --- accounting_periods ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS accounting_periods (
  id INT unsigned NOT NULL AUTO_INCREMENT COMMENT '期间ID',
  period_code VARCHAR(20) NOT NULL COMMENT '期间编码（如：2026-01）',
  year INT NOT NULL COMMENT '年份',
  month INT NOT NULL COMMENT '月份',
  start_date DATE NOT NULL COMMENT '期间开始日期',
  end_date DATE NOT NULL COMMENT '期间结束日期',
  status ENUM('open', 'closed') NOT NULL DEFAULT 'open' COMMENT '期间状态',
  closed_at TIMESTAMP NULL DEFAULT NULL COMMENT '关闭时间',
  closed_by VARCHAR(100) DEFAULT NULL COMMENT '关闭人',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY idx_period_code (period_code),
  KEY idx_year_month (year, month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会计期间表';`);

  // --- finance_account_mapping ---
  await knex.raw(`CREATE TABLE IF NOT EXISTS finance_account_mapping (
        id INT PRIMARY KEY AUTO_INCREMENT,
        business_type VARCHAR(50);`);

  // === 种子数据 ===

  // material_sources 初始数据
  await knex.raw(`
    INSERT IGNORE INTO material_sources (name, code, type, sort, status, description) VALUES
    ('自产', 'INTERNAL_01', 'internal', 1, 1, '公司内部生产'),
    ('外购', 'EXTERNAL_01', 'external', 2, 1, '外部采购'),
    ('委外加工', 'EXTERNAL_02', 'external', 3, 1, '委托外部加工'),
    ('代理采购', 'EXTERNAL_03', 'external', 4, 1, '代理商采购'),
    ('直接进口', 'EXTERNAL_04', 'external', 5, 1, '直接从国外进口'),
    ('库存调拨', 'INTERNAL_02', 'internal', 6, 1, '内部库存调拨'),
    ('返修品', 'INTERNAL_03', 'internal', 7, 0, '返修后的产品'),
    ('样品', 'EXTERNAL_05', 'external', 8, 1, '供应商提供样品')
  `);

  // --- system_config ---
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS system_config (
      id INT PRIMARY KEY AUTO_INCREMENT,
      config_key VARCHAR(100) UNIQUE NOT NULL COMMENT '配置键',
      config_value TEXT COMMENT '配置值',
      config_type VARCHAR(20) DEFAULT 'string' COMMENT '配置类型：string, number, boolean, json',
      description VARCHAR(200) COMMENT '配置说明',
      module VARCHAR(50) COMMENT '所属模块',
      is_system BOOLEAN DEFAULT FALSE COMMENT '是否系统配置',
      status BOOLEAN DEFAULT TRUE COMMENT '启用状态',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统配置表'
  `);
};

exports.down = async function(knex) {
  // 按反向依赖顺序删除
  const tables = [
    'system_config',
    'finance_account_mapping',
    'accounting_periods',
    'todo_notifications',
    'todo_participants',
    'technical_communication_favorites',
    'technical_communication_likes',
    'partial_outbound_config',
    'material_supply_records',
    'material_shortage_records',
    'first_article_rules',
    'technical_communication_department_recipients',
    'technical_communication_recipients',
    'bom_references',
    'bom_explosion_cache',
    'bom_change_logs',
    'product_sales_traceability',
    'batch_traceability_relations',
    'batch_relationships',
    'traceability_chain_steps',
    'traceability_chains',
    'fifo_outbound_queue',
    'batch_transactions',
    'batch_inventory',
    'supplier_quality_scores',
    'spc_data_points',
    'spc_control_plans',
    'gauge_calibration_records',
    'gauges',
    'quality_inspection_measurements',
    'bom_material_price_adjustments',
    'product_pricing_strategies',
    'pricing_strategy_fields',
    'budget_warnings',
    'budget_execution',
    'budget_details',
    'budgets',
    'sessions',
    'security_logs',
    'refresh_tokens',
    'material_sources',
    'print_settings',
    'material_template_mappings',
    'template_item_mappings',
    'inspection_items',
    'inspection_templates',
    'technical_communication_comments',
    'technical_communication_reads',
    'technical_communications',
    'notifications',
    'audit_logs'
  ];
  for (const table of tables) {
    await knex.raw(`DROP TABLE IF EXISTS \`${table}\``);
  }
};
