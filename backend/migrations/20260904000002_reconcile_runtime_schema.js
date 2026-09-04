'use strict';

/**
 * Reconcile runtime schema objects that are still referenced by the current
 * PC/mobile/backend code. Older installations may have marked all historical
 * migrations as complete while retaining a database created from an older
 * baseline. Every operation below is idempotent and additive/compatibility
 * oriented so upgrades do not discard business data.
 */

const TABLE_DEFINITIONS = Object.freeze([
  [
    "process_routes",
    "CREATE TABLE `process_routes` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `product_id` int NOT NULL COMMENT '产品ID(关联materials)',\n  `version` varchar(20) DEFAULT 'V1.0',\n  `name` varchar(100) NOT NULL COMMENT '路线名称',\n  `is_active` tinyint(1) DEFAULT '1',\n  `total_standard_minutes` decimal(10,2) DEFAULT '0.00' COMMENT '总标准工时(分钟)',\n  `created_by` int DEFAULT NULL,\n  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  `deleted_at` timestamp NULL DEFAULT NULL,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `idx_product_version` (`product_id`,`version`),\n  KEY `idx_product_active` (`product_id`,`is_active`),\n  KEY `idx_deleted_at` (`deleted_at`),\n  KEY `idx_created_at` (`created_at`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='工序路线'"
  ],
  [
    "process_route_steps",
    "CREATE TABLE `process_route_steps` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `route_id` int NOT NULL,\n  `sequence` int NOT NULL COMMENT '工序序号',\n  `step_name` varchar(100) NOT NULL COMMENT '工序名称',\n  `step_code` varchar(50) DEFAULT NULL COMMENT '工序编号',\n  `station_id` int DEFAULT NULL COMMENT '默认工位ID',\n  `standard_minutes` decimal(8,2) DEFAULT '0.00' COMMENT '标准工时(分钟)',\n  `description` text,\n  `sop_content` text COMMENT 'SOP作业指导(Markdown)',\n  `sop_images` json DEFAULT NULL COMMENT 'SOP图片URL数组',\n  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  KEY `idx_route_seq` (`route_id`,`sequence`),\n  KEY `idx_station` (`station_id`),\n  KEY `idx_created_at` (`created_at`),\n  CONSTRAINT `fk_step_route` FOREIGN KEY (`route_id`) REFERENCES `process_routes` (`id`) ON DELETE CASCADE\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='工序步骤'"
  ],
  [
    "process_step_materials",
    "CREATE TABLE `process_step_materials` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `step_id` int NOT NULL,\n  `material_id` int NOT NULL COMMENT '物料ID',\n  `quantity` decimal(10,2) NOT NULL DEFAULT '1.00' COMMENT '本工序所需数量',\n  `is_scan_required` tinyint(1) DEFAULT '0' COMMENT '是否需要扫码验证',\n  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  KEY `idx_step` (`step_id`),\n  KEY `idx_material` (`material_id`),\n  KEY `idx_created_at` (`created_at`),\n  CONSTRAINT `fk_psm_step` FOREIGN KEY (`step_id`) REFERENCES `process_route_steps` (`id`) ON DELETE CASCADE\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='工序级BOM分解'"
  ],
  [
    "equipment_parameters",
    "CREATE TABLE `equipment_parameters` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `equipment_id` int NOT NULL,\n  `parameter_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '参数名称',\n  `parameter_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '参数代码',\n  `parameter_type` enum('temperature','pressure','speed','voltage','current','count','boolean','string') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '参数类型',\n  `unit` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '单位',\n  `min_value` decimal(15,4) DEFAULT NULL COMMENT '最小值',\n  `max_value` decimal(15,4) DEFAULT NULL COMMENT '最大值',\n  `normal_min` decimal(15,4) DEFAULT NULL COMMENT '正常范围最小值',\n  `normal_max` decimal(15,4) DEFAULT NULL COMMENT '正常范围最大值',\n  `warning_min` decimal(15,4) DEFAULT NULL COMMENT '警告范围最小值',\n  `warning_max` decimal(15,4) DEFAULT NULL COMMENT '警告范围最大值',\n  `alarm_min` decimal(15,4) DEFAULT NULL COMMENT '报警范围最小值',\n  `alarm_max` decimal(15,4) DEFAULT NULL COMMENT '报警范围最大值',\n  `data_address` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '数据地址',\n  `collection_interval` int DEFAULT '5' COMMENT '采集间隔(秒)',\n  `is_monitored` tinyint(1) DEFAULT '1' COMMENT '是否监控',\n  `is_recorded` tinyint(1) DEFAULT '1' COMMENT '是否记录',\n  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '参数描述',\n  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`) USING BTREE,\n  KEY `idx_equipment_parameter` (`equipment_id`,`parameter_code`) USING BTREE,\n  KEY `idx_parameter_type` (`parameter_type`) USING BTREE,\n  KEY `idx_monitored` (`is_monitored`) USING BTREE,\n  KEY `idx_created_at` (`created_at`),\n  CONSTRAINT `equipment_parameters_ibfk_1` FOREIGN KEY (`equipment_id`) REFERENCES `equipment` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC COMMENT='设备参数配置表'"
  ],
  [
    "equipment_data",
    "CREATE TABLE `equipment_data` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `equipment_id` int NOT NULL,\n  `parameter_id` int NOT NULL,\n  `value` decimal(15,4) DEFAULT NULL COMMENT '数值',\n  `text_value` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '文本值',\n  `status` enum('normal','warning','alarm','error') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'normal' COMMENT '状态',\n  `quality` enum('good','bad','uncertain') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'good' COMMENT '数据质量',\n  `timestamp` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '时间戳',\n  `collected_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '采集时间',\n  PRIMARY KEY (`id`) USING BTREE,\n  KEY `idx_equipment_time` (`equipment_id`,`timestamp`) USING BTREE,\n  KEY `idx_parameter_time` (`parameter_id`,`timestamp`) USING BTREE,\n  KEY `idx_status` (`status`) USING BTREE,\n  KEY `idx_collected_time` (`collected_at`) USING BTREE,\n  CONSTRAINT `equipment_data_ibfk_1` FOREIGN KEY (`equipment_id`) REFERENCES `equipment` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,\n  CONSTRAINT `equipment_data_ibfk_2` FOREIGN KEY (`parameter_id`) REFERENCES `equipment_parameters` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC COMMENT='设备实时数据表'"
  ],
  [
    "equipment_alarms",
    "CREATE TABLE `equipment_alarms` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `equipment_id` int NOT NULL,\n  `parameter_id` int DEFAULT NULL,\n  `alarm_type` enum('parameter','communication','system','maintenance') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '报警类型',\n  `alarm_level` enum('info','warning','alarm','critical') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '报警级别',\n  `alarm_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '报警代码',\n  `alarm_message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '报警信息',\n  `current_value` decimal(15,4) DEFAULT NULL COMMENT '当前值',\n  `threshold_value` decimal(15,4) DEFAULT NULL COMMENT '阈值',\n  `status` enum('active','acknowledged','resolved') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'active' COMMENT '状态',\n  `occurred_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发生时间',\n  `acknowledged_at` timestamp NULL DEFAULT NULL COMMENT '确认时间',\n  `acknowledged_by` int DEFAULT NULL COMMENT '确认人',\n  `resolved_at` timestamp NULL DEFAULT NULL COMMENT '解决时间',\n  `resolved_by` int DEFAULT NULL COMMENT '解决人',\n  `resolution_note` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '解决说明',\n  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`) USING BTREE,\n  KEY `parameter_id` (`parameter_id`) USING BTREE,\n  KEY `idx_equipment_alarm` (`equipment_id`,`status`) USING BTREE,\n  KEY `idx_alarm_level` (`alarm_level`) USING BTREE,\n  KEY `idx_occurred_time` (`occurred_at`) USING BTREE,\n  KEY `idx_status` (`status`) USING BTREE,\n  KEY `idx_created_at` (`created_at`),\n  CONSTRAINT `equipment_alarms_ibfk_1` FOREIGN KEY (`equipment_id`) REFERENCES `equipment` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,\n  CONSTRAINT `equipment_alarms_ibfk_2` FOREIGN KEY (`parameter_id`) REFERENCES `equipment_parameters` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC COMMENT='设备报警记录表'"
  ],
  [
    "inventory_checks",
    "CREATE TABLE `inventory_checks` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `check_no` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '盘点单号',\n  `location_id` int NOT NULL COMMENT '仓库位置ID',\n  `check_type` enum('warehouse','cycle','random','full','special') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT 'warehouse',\n  `check_date` date NOT NULL COMMENT '盘点日期',\n  `status` enum('draft','in_progress','pending','completed','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'draft' COMMENT '状态：草稿/进行中/待审核/已完成/已取消',\n  `remark` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci COMMENT '备注',\n  `created_by` int NOT NULL COMMENT '创建人ID',\n  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',\n  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',\n  `deleted_at` timestamp NULL DEFAULT NULL COMMENT '软删除标记',\n  PRIMARY KEY (`id`) USING BTREE,\n  UNIQUE KEY `check_no` (`check_no`) USING BTREE,\n  KEY `location_id` (`location_id`) USING BTREE,\n  KEY `created_by` (`created_by`) USING BTREE,\n  KEY `status` (`status`) USING BTREE,\n  KEY `check_date` (`check_date`) USING BTREE,\n  KEY `idx_inventory_checks_deleted_at` (`deleted_at`),\n  KEY `idx_created_at` (`created_at`),\n  CONSTRAINT `inventory_checks_created_by_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,\n  CONSTRAINT `inventory_checks_location_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci ROW_FORMAT=DYNAMIC COMMENT='库存盘点表'"
  ],
  [
    "inventory_check_items",
    "CREATE TABLE `inventory_check_items` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `check_id` int NOT NULL COMMENT '盘点单ID',\n  `material_id` int NOT NULL COMMENT '物料ID',\n  `system_quantity` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT '系统数量',\n  `actual_quantity` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT '实际数量',\n  `difference` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT '差异数量',\n  `unit_id` int NOT NULL COMMENT '单位ID',\n  `remark` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '备注',\n  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',\n  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',\n  PRIMARY KEY (`id`) USING BTREE,\n  UNIQUE KEY `uniq_inventory_check_item_material` (`check_id`,`material_id`),\n  KEY `check_id` (`check_id`) USING BTREE,\n  KEY `material_id` (`material_id`) USING BTREE,\n  KEY `unit_id` (`unit_id`) USING BTREE,\n  KEY `idx_created_at` (`created_at`),\n  CONSTRAINT `inventory_check_items_check_id_fk` FOREIGN KEY (`check_id`) REFERENCES `inventory_checks` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,\n  CONSTRAINT `inventory_check_items_material_id_fk` FOREIGN KEY (`material_id`) REFERENCES `materials` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,\n  CONSTRAINT `inventory_check_items_unit_id_fk` FOREIGN KEY (`unit_id`) REFERENCES `units` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci ROW_FORMAT=DYNAMIC COMMENT='库存盘点明细表'"
  ],
  [
    "asset_inventories",
    "CREATE TABLE `asset_inventories` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `inventory_no` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `inventory_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `status` enum('进行中','已完成','已取消') COLLATE utf8mb4_unicode_ci DEFAULT '进行中',\n  `start_date` date DEFAULT NULL,\n  `end_date` date DEFAULT NULL,\n  `created_by` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `notes` text COLLATE utf8mb4_unicode_ci,\n  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  `completed_at` datetime DEFAULT NULL,\n  `completed_by` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `inventory_no` (`inventory_no`),\n  KEY `idx_status` (`status`),\n  KEY `idx_created_at` (`created_at`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  ],
  [
    "asset_inventory_items",
    "CREATE TABLE `asset_inventory_items` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `inventory_id` int NOT NULL,\n  `asset_id` int NOT NULL,\n  `book_quantity` int DEFAULT '1',\n  `actual_quantity` int DEFAULT '0',\n  `status` enum('盘点相符','盘亏','盘盈','未盘点') COLLATE utf8mb4_unicode_ci DEFAULT '未盘点',\n  `handled_by` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `inventory_date` datetime DEFAULT NULL,\n  `notes` text COLLATE utf8mb4_unicode_ci,\n  PRIMARY KEY (`id`),\n  KEY `inventory_id` (`inventory_id`),\n  KEY `asset_id` (`asset_id`),\n  KEY `idx_status` (`status`),\n  CONSTRAINT `asset_inventory_items_ibfk_1` FOREIGN KEY (`inventory_id`) REFERENCES `asset_inventories` (`id`) ON DELETE CASCADE,\n  CONSTRAINT `asset_inventory_items_ibfk_2` FOREIGN KEY (`asset_id`) REFERENCES `fixed_assets` (`id`) ON DELETE CASCADE\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  ],
  [
    "traceability",
    "CREATE TABLE `traceability` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `product_code` varchar(100) NOT NULL,\n  `product_name` varchar(255) NOT NULL,\n  `batch_number` varchar(100) NOT NULL,\n  `production_date` date DEFAULT NULL,\n  `supplier_id` int DEFAULT NULL,\n  `status` varchar(50) DEFAULT 'in_production',\n  `remarks` text,\n  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  KEY `idx_batch` (`batch_number`),\n  KEY `idx_product` (`product_code`),\n  KEY `idx_status` (`status`),\n  KEY `idx_created_at` (`created_at`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
  ],
  [
    "traceability_material",
    "CREATE TABLE `traceability_material` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `traceability_id` int NOT NULL,\n  `material_code` varchar(100) DEFAULT NULL,\n  `batch_number` varchar(100) DEFAULT NULL,\n  `quantity` decimal(15,4) DEFAULT NULL,\n  `supplier_id` int DEFAULT NULL,\n  `usage_time` datetime DEFAULT NULL,\n  `remarks` text,\n  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  KEY `fk_trace_mat` (`traceability_id`),\n  KEY `idx_created_at` (`created_at`),\n  CONSTRAINT `fk_trace_mat` FOREIGN KEY (`traceability_id`) REFERENCES `traceability` (`id`) ON DELETE CASCADE\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
  ],
  [
    "traceability_process",
    "CREATE TABLE `traceability_process` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `traceability_id` int NOT NULL,\n  `process_name` varchar(100) NOT NULL,\n  `operator` varchar(100) DEFAULT NULL,\n  `start_time` datetime DEFAULT NULL,\n  `end_time` datetime DEFAULT NULL,\n  `duration` int DEFAULT NULL,\n  `status` varchar(50) DEFAULT NULL,\n  `remarks` text,\n  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  KEY `fk_trace_proc` (`traceability_id`),\n  KEY `idx_status` (`status`),\n  KEY `idx_created_at` (`created_at`),\n  CONSTRAINT `fk_trace_proc` FOREIGN KEY (`traceability_id`) REFERENCES `traceability` (`id`) ON DELETE CASCADE\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
  ],
  [
    "transactions",
    "CREATE TABLE `transactions` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `transaction_date` date NOT NULL,\n  `amount` decimal(15,2) NOT NULL,\n  `transaction_type` enum('income','expense','transfer') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,\n  `account_id` int NOT NULL,\n  `target_account_id` int DEFAULT NULL COMMENT '只在转账类型交易中使用',\n  `category_id` int DEFAULT NULL,\n  `description` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,\n  `reference_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,\n  `attachment` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '附件文件路径',\n  `reconciled` tinyint(1) NOT NULL DEFAULT '0',\n  `created_by` int NOT NULL,\n  `updated_by` int DEFAULT NULL,\n  `created_at` datetime NOT NULL,\n  `updated_at` datetime NOT NULL,\n  PRIMARY KEY (`id`) USING BTREE,\n  KEY `account_id` (`account_id`) USING BTREE,\n  KEY `target_account_id` (`target_account_id`) USING BTREE,\n  KEY `category_id` (`category_id`) USING BTREE,\n  KEY `idx_created_at` (`created_at`),\n  CONSTRAINT `transactions_ibfk_1` FOREIGN KEY (`account_id`) REFERENCES `bank_accounts` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,\n  CONSTRAINT `transactions_ibfk_2` FOREIGN KEY (`target_account_id`) REFERENCES `bank_accounts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci ROW_FORMAT=DYNAMIC"
  ],
  [
    "archive_20260522_reconciliation_items",
    "CREATE TABLE `archive_20260522_reconciliation_items` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `reconciliation_id` int NOT NULL,\n  `transaction_id` int NOT NULL,\n  `notes` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,\n  `created_at` datetime NOT NULL,\n  `updated_at` datetime NOT NULL,\n  PRIMARY KEY (`id`) USING BTREE,\n  KEY `reconciliation_id` (`reconciliation_id`) USING BTREE,\n  KEY `transaction_id` (`transaction_id`) USING BTREE,\n  CONSTRAINT `archive_20260522_reconciliation_items_ibfk_1` FOREIGN KEY (`reconciliation_id`) REFERENCES `reconciliations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,\n  CONSTRAINT `archive_20260522_reconciliation_items_ibfk_2` FOREIGN KEY (`transaction_id`) REFERENCES `transactions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci ROW_FORMAT=DYNAMIC"
  ],
  [
    "assembly_task_steps",
    "CREATE TABLE `assembly_task_steps` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `task_id` int NOT NULL COMMENT '生产任务ID',\n  `route_step_id` int NOT NULL COMMENT '工序步骤ID',\n  `sequence` int NOT NULL,\n  `step_name` varchar(100) NOT NULL COMMENT '冗余工序名(快速查询)',\n  `station_id` int DEFAULT NULL COMMENT '实际工位',\n  `operator_id` int DEFAULT NULL COMMENT '操作人',\n  `status` enum('pending','in_progress','completed','skipped') DEFAULT 'pending',\n  `started_at` datetime DEFAULT NULL,\n  `completed_at` datetime DEFAULT NULL,\n  `actual_minutes` decimal(8,2) DEFAULT NULL COMMENT '实际工时',\n  `remark` text,\n  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  KEY `idx_task_seq` (`task_id`,`sequence`),\n  KEY `idx_status` (`status`),\n  KEY `idx_operator` (`operator_id`),\n  KEY `idx_station` (`station_id`),\n  KEY `idx_created_at` (`created_at`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='装配任务执行记录'"
  ],
  [
    "asset_change_logs",
    "CREATE TABLE `asset_change_logs` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `asset_id` int NOT NULL,\n  `change_type` varchar(20) NOT NULL COMMENT '变动类型：创建/编辑/折旧/调拨/处置/状态变更',\n  `change_date` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '变动时间',\n  `changed_by` varchar(50) DEFAULT NULL COMMENT '操作人',\n  `field_name` varchar(50) DEFAULT NULL COMMENT '变更字段名',\n  `old_value` text COMMENT '旧值',\n  `new_value` text COMMENT '新值',\n  `remarks` text COMMENT '备注',\n  PRIMARY KEY (`id`),\n  KEY `idx_asset_id` (`asset_id`),\n  KEY `idx_change_date` (`change_date`),\n  CONSTRAINT `asset_change_logs_ibfk_1` FOREIGN KEY (`asset_id`) REFERENCES `fixed_assets` (`id`) ON DELETE CASCADE\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='固定资产变动记录表'"
  ],
  [
    "cip_projects",
    "CREATE TABLE `cip_projects` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `project_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `project_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `budget` decimal(15,2) DEFAULT '0.00',\n  `accumulated_amount` decimal(15,2) DEFAULT '0.00',\n  `start_date` date DEFAULT NULL,\n  `estimated_end_date` date DEFAULT NULL,\n  `status` enum('建设中','已转固','已取消') COLLATE utf8mb4_unicode_ci DEFAULT '建设中',\n  `responsible` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `department` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `notes` text COLLATE utf8mb4_unicode_ci,\n  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `project_code` (`project_code`),\n  KEY `idx_status` (`status`),\n  KEY `idx_created_at` (`created_at`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  ],
  [
    "equipment_attachment",
    "CREATE TABLE `equipment_attachment` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `equipment_id` int NOT NULL COMMENT '设备ID',\n  `file_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '文件名',\n  `file_path` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '文件路径',\n  `file_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '文件类型',\n  `file_size` int DEFAULT NULL COMMENT '文件大小(KB)',\n  `description` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '描述',\n  `upload_time` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',\n  `uploader` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '上传者',\n  PRIMARY KEY (`id`) USING BTREE,\n  KEY `equipment_id` (`equipment_id`) USING BTREE,\n  CONSTRAINT `equipment_attachment_ibfk_1` FOREIGN KEY (`equipment_id`) REFERENCES `equipment` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci ROW_FORMAT=DYNAMIC COMMENT='设备附件表'"
  ],
  [
    "equipment_failure",
    "CREATE TABLE `equipment_failure` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `equipment_id` int NOT NULL COMMENT '璁惧?ID',\n  `failure_date` datetime NOT NULL COMMENT '鏁呴殰鏃ユ湡鏃堕棿',\n  `failure_type` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '鏁呴殰绫诲瀷',\n  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci COMMENT '鏁呴殰鎻忚堪',\n  `reported_by` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '鎶ュ憡浜',\n  `repair_status` enum('reported','diagnosing','repairing','resolved','unresolved') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT 'reported' COMMENT '缁翠慨鐘舵?',\n  `resolution` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci COMMENT '瑙ｅ喅鏂规?',\n  `resolved_date` datetime DEFAULT NULL COMMENT '瑙ｅ喅鏃ユ湡鏃堕棿',\n  `resolved_by` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '瑙ｅ喅浜',\n  `downtime_hours` decimal(10,2) DEFAULT NULL COMMENT '鍋滄満鏃堕棿(灏忔椂)',\n  `repair_cost` decimal(10,2) DEFAULT NULL COMMENT '缁翠慨璐圭敤',\n  `remarks` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci COMMENT '澶囨敞',\n  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`) USING BTREE,\n  KEY `equipment_id` (`equipment_id`) USING BTREE,\n  KEY `idx_created_at` (`created_at`),\n  CONSTRAINT `equipment_failure_ibfk_1` FOREIGN KEY (`equipment_id`) REFERENCES `equipment` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci ROW_FORMAT=DYNAMIC COMMENT='设备故障记录表'"
  ],
  [
    "equipment_inspection",
    "CREATE TABLE `equipment_inspection` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `equipment_id` int NOT NULL COMMENT '设备ID',\n  `inspection_date` date NOT NULL COMMENT '检查日期',\n  `inspector` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '检查人',\n  `inspection_result` enum('pass','conditional_pass','fail') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '检查结果',\n  `remarks` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci COMMENT '备注',\n  `next_inspection_date` date DEFAULT NULL COMMENT '下次检查日期',\n  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`) USING BTREE,\n  KEY `equipment_id` (`equipment_id`) USING BTREE,\n  KEY `idx_created_at` (`created_at`),\n  CONSTRAINT `equipment_inspection_ibfk_1` FOREIGN KEY (`equipment_id`) REFERENCES `equipment` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci ROW_FORMAT=DYNAMIC COMMENT='设备检查表'"
  ],
  [
    "equipment_maintenance",
    "CREATE TABLE `equipment_maintenance` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `equipment_id` int NOT NULL COMMENT '设备ID',\n  `maintenance_type` enum('routine','preventive','corrective') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '维护类型',\n  `maintenance_date` date NOT NULL COMMENT '维护日期',\n  `completed_date` date DEFAULT NULL COMMENT '完成日期',\n  `maintenance_staff` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '维护人员',\n  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci COMMENT '维护描述',\n  `parts_replaced` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci COMMENT '更换部件',\n  `cost` decimal(10,2) DEFAULT NULL COMMENT '维护成本',\n  `status` enum('pending','in_progress','completed') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT 'pending' COMMENT '维护状态',\n  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`) USING BTREE,\n  KEY `equipment_id` (`equipment_id`) USING BTREE,\n  KEY `idx_status` (`status`),\n  KEY `idx_created_at` (`created_at`),\n  CONSTRAINT `equipment_maintenance_ibfk_1` FOREIGN KEY (`equipment_id`) REFERENCES `equipment` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci ROW_FORMAT=DYNAMIC COMMENT='设备维护记录表'"
  ],
  [
    "equipment_spare_part",
    "CREATE TABLE `equipment_spare_part` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `equipment_id` int NOT NULL COMMENT '璁惧?ID',\n  `part_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '澶囦欢鍚嶇О',\n  `part_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '澶囦欢缂栧彿',\n  `specification` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '瑙勬牸',\n  `model_number` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '鍨嬪彿',\n  `manufacturer` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '鍒堕?鍟',\n  `quantity` int DEFAULT '0' COMMENT '搴撳瓨鏁伴噺',\n  `unit` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '鍗曚綅',\n  `unit_price` decimal(10,2) DEFAULT NULL COMMENT '鍗曚环',\n  `min_stock` int DEFAULT '0' COMMENT '鏈?綆搴撳瓨',\n  `location` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '瀛樻斁浣嶇疆',\n  `remarks` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci COMMENT '澶囨敞',\n  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`) USING BTREE,\n  KEY `equipment_id` (`equipment_id`) USING BTREE,\n  KEY `idx_created_at` (`created_at`),\n  CONSTRAINT `equipment_spare_part_ibfk_1` FOREIGN KEY (`equipment_id`) REFERENCES `equipment` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci ROW_FORMAT=DYNAMIC COMMENT='设备备件表'"
  ],
  [
    "equipment_status_history",
    "CREATE TABLE `equipment_status_history` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `equipment_id` int NOT NULL,\n  `previous_status` enum('online','offline','maintenance','error','idle') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '之前状态',\n  `current_status` enum('online','offline','maintenance','error','idle') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '当前状态',\n  `duration_seconds` int DEFAULT NULL COMMENT '持续时间(秒)',\n  `reason` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '状态变更原因',\n  `changed_by` int DEFAULT NULL COMMENT '变更人',\n  `changed_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '变更时间',\n  PRIMARY KEY (`id`) USING BTREE,\n  KEY `idx_equipment_status` (`equipment_id`,`changed_at`) USING BTREE,\n  KEY `idx_status_time` (`current_status`,`changed_at`) USING BTREE,\n  CONSTRAINT `equipment_status_history_ibfk_1` FOREIGN KEY (`equipment_id`) REFERENCES `equipment` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC COMMENT='设备状态历史表'"
  ],
  [
    "gl_account_mappings",
    "CREATE TABLE `gl_account_mappings` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `mapping_key` varchar(50) NOT NULL COMMENT '映射键值',\n  `mapping_name` varchar(100) NOT NULL COMMENT '业务名称',\n  `account_id` int NOT NULL COMMENT '关联科目ID',\n  `description` varchar(255) DEFAULT NULL,\n  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `mapping_key` (`mapping_key`),\n  KEY `account_id` (`account_id`),\n  CONSTRAINT `gl_account_mappings_ibfk_1` FOREIGN KEY (`account_id`) REFERENCES `gl_accounts` (`id`)\n) ENGINE=InnoDB  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='会计科目映射表'"
  ],
  [
    "hr_attendance_rules",
    "CREATE TABLE `hr_attendance_rules` (\n  `id` int unsigned NOT NULL AUTO_INCREMENT,\n  `rule_key` varchar(100) NOT NULL COMMENT '规则键',\n  `rule_name` varchar(200) NOT NULL COMMENT '规则名称',\n  `rule_value` text NOT NULL COMMENT '规则值(JSON)',\n  `rule_group` varchar(50) DEFAULT '通用' COMMENT '规则分组',\n  `description` text COMMENT '规则说明',\n  `sort_order` int DEFAULT '0' COMMENT '排序',\n  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `rule_key` (`rule_key`)\n) ENGINE=InnoDB  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='考勤规则配置'"
  ],
  [
    "invoice_status_log",
    "CREATE TABLE `invoice_status_log` (\n  `id` int NOT NULL AUTO_INCREMENT COMMENT '涓婚敭ID',\n  `invoice_type` enum('AR','AP') NOT NULL COMMENT '鍙戠エ绫诲瀷: AR-搴旀敹, AP-搴斾粯',\n  `invoice_id` int NOT NULL COMMENT '鍙戠エID',\n  `invoice_code` varchar(50) DEFAULT NULL COMMENT '鍙戠エ缂栧彿',\n  `old_status` varchar(20) DEFAULT NULL COMMENT '鍘熺姸鎬',\n  `new_status` varchar(20) NOT NULL COMMENT '鏂扮姸鎬',\n  `changed_by` varchar(50) DEFAULT 'SYSTEM' COMMENT '鍙樻洿浜? SYSTEM-绯荤粺鑷?姩, 鎴栫敤鎴峰悕',\n  `change_reason` varchar(100) DEFAULT NULL COMMENT '鍙樻洿鍘熷洜',\n  `changed_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '鍙樻洿鏃堕棿',\n  PRIMARY KEY (`id`),\n  KEY `idx_invoice_type_id` (`invoice_type`,`invoice_id`),\n  KEY `idx_invoice_code` (`invoice_code`),\n  KEY `idx_changed_at` (`changed_at`),\n  KEY `idx_changed_by` (`changed_by`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='发票状态变更日志表'"
  ],
  [
    "labor_records",
    "CREATE TABLE `labor_records` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `task_id` int NOT NULL COMMENT '生产任务ID',\n  `worker_id` int DEFAULT NULL COMMENT '工人ID',\n  `worker_name` varchar(100) DEFAULT NULL COMMENT '工人姓名',\n  `work_date` date NOT NULL COMMENT '工作日期',\n  `hours` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT '工时（小时）',\n  `hourly_rate` decimal(10,2) DEFAULT NULL COMMENT '时薪（元/小时）',\n  `total_cost` decimal(15,2) GENERATED ALWAYS AS ((`hours` * coalesce(`hourly_rate`,30))) STORED COMMENT '计算的人工成本',\n  `process_name` varchar(100) DEFAULT NULL COMMENT '工序名称',\n  `description` text COMMENT '工作内容描述',\n  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',\n  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',\n  PRIMARY KEY (`id`),\n  KEY `idx_task_id` (`task_id`),\n  KEY `idx_work_date` (`work_date`),\n  KEY `idx_worker_id` (`worker_id`),\n  KEY `idx_created_at` (`created_at`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='工时记录表'"
  ],
  [
    "login_attempts",
    "CREATE TABLE `login_attempts` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `username` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,\n  `ip_address` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,\n  `success` tinyint(1) DEFAULT '0',\n  `user_agent` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,\n  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`) USING BTREE,\n  KEY `idx_username` (`username`) USING BTREE,\n  KEY `idx_ip_address` (`ip_address`) USING BTREE,\n  KEY `idx_created_at` (`created_at`) USING BTREE,\n  KEY `idx_username_success_time` (`username`,`success`,`created_at`) USING BTREE\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC COMMENT='登录尝试记录表'"
  ],
  [
    "operation_logs",
    "CREATE TABLE `operation_logs` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `user_id` int DEFAULT NULL,\n  `username` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `operation` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,\n  `module` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,\n  `ip` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `method` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `path` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `request_data` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,\n  `response_data` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,\n  `status` int DEFAULT NULL,\n  `execution_time` int DEFAULT NULL,\n  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,\n  `url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '请求URL',\n  `user_agent` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '用户代理',\n  `error_message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '错误信息',\n  PRIMARY KEY (`id`) USING BTREE,\n  KEY `idx_user` (`user_id`) USING BTREE,\n  KEY `idx_module` (`module`) USING BTREE,\n  KEY `idx_created_at` (`created_at`) USING BTREE,\n  KEY `idx_status` (`status`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC"
  ],
  [
    "orders",
    "CREATE TABLE `orders` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `customer` varchar(100) NOT NULL,\n  `product` varchar(100) NOT NULL,\n  `quantity` int NOT NULL,\n  `status` varchar(50) NOT NULL DEFAULT 'pending',\n  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  KEY `idx_status` (`status`),\n  KEY `idx_created_at` (`created_at`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
  ],
  [
    "product_pricing",
    "CREATE TABLE `product_pricing` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `product_id` int NOT NULL,\n  `cost_price` decimal(10,2) DEFAULT '0.00' COMMENT 'BOM成本',\n  `suggested_price` decimal(10,2) DEFAULT '0.00' COMMENT '建议售价',\n  `profit_margin` decimal(10,2) DEFAULT '0.00' COMMENT '利润率%',\n  `version` int DEFAULT '1' COMMENT '版本号',\n  `is_active` tinyint(1) DEFAULT '1' COMMENT '是否当前生效',\n  `effective_date` date DEFAULT NULL COMMENT '生效日期',\n  `created_by` int DEFAULT NULL COMMENT '创建人',\n  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  `remarks` text COLLATE utf8mb4_unicode_ci COMMENT '备注',\n  PRIMARY KEY (`id`),\n  KEY `idx_product_id` (`product_id`),\n  KEY `idx_active` (`is_active`),\n  KEY `idx_pp_pa` (`product_id`,`is_active`),\n  KEY `idx_created_at` (`created_at`),\n  CONSTRAINT `chk_price_positive` CHECK (((`suggested_price` >= 0) and (`cost_price` >= 0))),\n  CONSTRAINT `chk_profit_margin_reasonable` CHECK (((`profit_margin` >= -(100)) and (`profit_margin` <= 1000)))\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='产品定价表'"
  ],
  [
    "production",
    "CREATE TABLE `production` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `product` varchar(100) NOT NULL,\n  `planned_quantity` int NOT NULL,\n  `actual_quantity` int DEFAULT '0',\n  `status` varchar(50) NOT NULL DEFAULT 'planned',\n  `start_date` date NOT NULL,\n  `end_date` date NOT NULL,\n  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  KEY `idx_status` (`status`),\n  KEY `idx_created_at` (`created_at`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
  ],
  [
    "supplier_materials",
    "CREATE TABLE `supplier_materials` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `supplier_id` int NOT NULL,\n  `material_id` int NOT NULL,\n  `supplier_material_code` varchar(100) DEFAULT NULL,\n  `min_order_quantity` decimal(10,2) DEFAULT '0.00',\n  `price` decimal(15,4) DEFAULT NULL,\n  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `idx_req_unique` (`supplier_id`,`material_id`),\n  KEY `idx_material` (`material_id`),\n  KEY `idx_created_at` (`created_at`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
  ],
  [
    "supplier_returns",
    "CREATE TABLE `supplier_returns` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `return_no` varchar(50) NOT NULL,\n  `ncp_id` int DEFAULT NULL,\n  `ncp_no` varchar(50) DEFAULT NULL,\n  `supplier_id` int DEFAULT NULL,\n  `supplier_name` varchar(200) DEFAULT NULL,\n  `order_id` int DEFAULT NULL,\n  `order_no` varchar(50) DEFAULT NULL,\n  `inspection_id` int DEFAULT NULL,\n  `inspection_no` varchar(50) DEFAULT NULL,\n  `material_id` int DEFAULT NULL,\n  `material_code` varchar(50) DEFAULT NULL,\n  `material_name` varchar(200) DEFAULT NULL,\n  `quantity` decimal(10,2) NOT NULL,\n  `reason` text,\n  `return_date` date DEFAULT NULL,\n  `status` enum('pending','approved','shipped','completed','cancelled') DEFAULT 'pending',\n  `created_by` varchar(50) DEFAULT NULL,\n  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `return_no` (`return_no`),\n  KEY `ncp_id` (`ncp_id`),\n  KEY `idx_status` (`status`),\n  KEY `idx_created_at` (`created_at`),\n  CONSTRAINT `supplier_returns_ibfk_1` FOREIGN KEY (`ncp_id`) REFERENCES `nonconforming_products` (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
  ]
]);

const COLUMN_DEFINITIONS = Object.freeze({
  "asset_depreciation": {
    "book_value_before": "DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '折旧前账面价值'",
    "book_value_after": "DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '折旧后账面价值'",
    "is_posted": "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已过账'",
    "notes": "TEXT NULL COMMENT '备注'",
    "voucher_no": "VARCHAR(50) NULL"
  },
  "bank_transactions": {
    "audit_remark": "TEXT NULL COMMENT 'Audit remark'",
    "audit_status": "VARCHAR(20) NOT NULL DEFAULT 'draft' COMMENT 'Audit status'",
    "audit_time": "DATETIME NULL COMMENT 'Audit time'",
    "auditor_id": "INT NULL COMMENT 'Auditor user ID'",
    "reconcile_confirmed_at": "DATETIME NULL COMMENT 'Reconcile confirmed time'",
    "reconcile_confirmed_by": "INT NULL COMMENT 'Reconcile confirmed by user ID'",
    "submitted_at": "DATETIME NULL COMMENT 'Submitted time'",
    "submitted_by": "INT NULL COMMENT 'Submitted by user ID'"
  },
  "bom_details": {
    "base_quantity": "DECIMAL(12,4) NOT NULL DEFAULT 1 COMMENT '基数/每多少成品'",
    "is_critical": "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否关键件'"
  },
  "expenses": {
    "approval_remark": "TEXT NULL COMMENT '审批备注'",
    "approved_at": "DATETIME NULL COMMENT '审批时间'",
    "attachment_path": "VARCHAR(500) NULL COMMENT '附件路径'",
    "expense_number": "VARCHAR(50) NULL COMMENT '费用编号'",
    "invoice_number": "VARCHAR(100) NULL COMMENT '发票号码'",
    "paid_at": "DATETIME NULL COMMENT '付款时间'",
    "payee": "VARCHAR(200) NULL COMMENT '收款方/供应商'",
    "payment_bank_account_id": "INT NULL COMMENT '付款银行账户ID'",
    "payment_transaction_id": "INT NULL COMMENT '关联银行交易ID'",
    "submitted_at": "DATETIME NULL COMMENT '提交时间'",
    "submitted_by": "INT NULL COMMENT '提交人ID'",
    "title": "VARCHAR(200) NULL COMMENT '费用标题'"
  },
  "finance_account_mapping": {
    "deleted_at": "TIMESTAMP NULL COMMENT '软删除标记'"
  },
  "fixed_asset_depreciation_details": {
    "updated_at": "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
  },
  "fixed_assets": {
    "depreciation_end_date": "DATE NULL COMMENT '折旧结束日期'",
    "depreciation_start_date": "DATE NULL COMMENT '开始折旧日期'"
  },
  "gl_opening_balance_history": {
    "set_at": "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP COMMENT '设置时间'"
  },
  "materials": {
    "location_name": "VARCHAR(100) NULL COMMENT '库位名称'"
  },
  "outsourced_processings": {
    "confirmed_at": "DATETIME NULL COMMENT '确认时间'"
  },
  "pricing_strategy_fields": {
    "is_additive": "TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否参与成本计算'"
  },
  "purchase_requisitions": {
    "contract_code": "VARCHAR(100) NULL COMMENT '关联的销售订单合同编码'",
    "real_name": "VARCHAR(100) NULL DEFAULT ''"
  },
  "sales_exchange_items": {
    "amount": "DECIMAL(10,2) NOT NULL DEFAULT 0",
    "created_at": "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP",
    "original_quantity": "DECIMAL(10,2) NOT NULL DEFAULT 0",
    "product_code": "VARCHAR(50) NULL",
    "product_name": "VARCHAR(200) NULL",
    "specification": "VARCHAR(200) NULL",
    "unit_name": "VARCHAR(20) NULL",
    "unit_price": "DECIMAL(10,2) NOT NULL DEFAULT 0",
    "updated_at": "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
  },
  "sales_exchanges": {
    "contact_phone": "VARCHAR(20) NULL",
    "customer_id": "INT NULL",
    "customer_name": "VARCHAR(100) NULL",
    "difference_amount": "DECIMAL(12,2) NOT NULL DEFAULT 0",
    "new_amount": "DECIMAL(12,2) NOT NULL DEFAULT 0",
    "order_no": "VARCHAR(50) NULL",
    "return_amount": "DECIMAL(12,2) NOT NULL DEFAULT 0"
  }
});

async function tableExists(knex, tableName) {
  return knex.schema.hasTable(tableName);
}

async function columnExists(knex, tableName, columnName) {
  if (!(await tableExists(knex, tableName))) return false;
  return knex.schema.hasColumn(tableName, columnName);
}

async function indexExists(knex, tableName, indexName) {
  const [rows] = await knex.raw(
    `SELECT COUNT(*) AS count
       FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND index_name = ?`,
    [tableName, indexName]
  );
  return Number(rows[0]?.count || 0) > 0;
}

async function addColumnIfMissing(knex, tableName, columnName, definition) {
  if (!(await tableExists(knex, tableName))) return;
  if (await columnExists(knex, tableName, columnName)) return;
  await knex.raw(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
}

async function modifyIfPresent(knex, tableName, columnName, definition) {
  if (!(await columnExists(knex, tableName, columnName))) return;
  await knex.raw(`ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${columnName}\` ${definition}`);
}

async function createMissingTables(knex) {
  // Retry foreign-key dependent definitions until their referenced runtime table
  // has been created. This also keeps the migration safe when a baseline was
  // applied in a different order by an older installer.
  let pending = TABLE_DEFINITIONS.slice();
  let lastError = null;
  while (pending.length > 0) {
    const next = [];
    let progress = false;
    for (const [tableName, definition] of pending) {
      try {
        const ddl = definition
          .replace(/^CREATE TABLE\s+/i, 'CREATE TABLE IF NOT EXISTS ')
          .replace(/AUTO_INCREMENT=\d+/gi, '');
        await knex.raw(ddl);
        progress = true;
      } catch (error) {
        lastError = error;
        const message = String(error?.message || '');
        if (/foreign key|referenced table|doesn't exist|不存在|cannot add/i.test(message)) {
          next.push([tableName, definition]);
          continue;
        }
        throw error;
      }
    }
    if (next.length === 0) return;
    if (!progress) {
      throw new Error(
        `Unable to create runtime schema tables: ${next.map(([name]) => name).join(', ')}${lastError ? ` (${lastError.message})` : ''}`
      );
    }
    pending = next;
  }
}

async function ensureInspectionTemplateGovernance(knex) {
  if (!(await tableExists(knex, 'inspection_templates'))) return;
  if (!(await columnExists(knex, 'inspection_templates', 'default_general_template_key'))) {
    await knex.raw(`
      ALTER TABLE inspection_templates
      ADD COLUMN default_general_template_key VARCHAR(32)
      GENERATED ALWAYS AS (
        CASE
          WHEN status = 'active' AND is_general = 1 AND is_default = 1
          THEN inspection_type
          ELSE NULL
        END
      ) STORED
    `);
  }
  if (!(await indexExists(knex, 'inspection_templates', 'uk_inspection_templates_active_default_general'))) {
    const [duplicates] = await knex.raw(`
      SELECT inspection_type
        FROM inspection_templates
       WHERE status = 'active' AND is_general = 1 AND is_default = 1
       GROUP BY inspection_type
      HAVING COUNT(*) > 1
    `);
    if (duplicates.length > 0) {
      throw new Error(
        `inspection_templates has duplicate active default general templates: ${duplicates.map((row) => row.inspection_type).join(', ')}`
      );
    }
    await knex.raw(
      'ALTER TABLE inspection_templates ADD UNIQUE KEY uk_inspection_templates_active_default_general (default_general_template_key)'
    );
  }
}

exports.up = async function up(knex) {
  await createMissingTables(knex);

  for (const [tableName, columns] of Object.entries(COLUMN_DEFINITIONS)) {
    for (const [columnName, definition] of Object.entries(columns)) {
      await addColumnIfMissing(knex, tableName, columnName, definition);
    }
  }

  await ensureInspectionTemplateGovernance(knex);

  // Compatibility repairs for old baseline tables. These retain legacy
  // columns as aliases while allowing the current API payloads to be written.
  await modifyIfPresent(
    knex,
    'expenses',
    'expense_no',
    "VARCHAR(50) NULL COMMENT 'legacy expense number'"
  );
  await modifyIfPresent(knex, 'expenses', 'status', "VARCHAR(20) NULL DEFAULT 'draft'");
  await modifyIfPresent(knex, 'sales_exchanges', 'order_id', 'INT NULL');
  await modifyIfPresent(knex, 'sales_exchanges', 'created_by', 'INT NULL');
  await modifyIfPresent(knex, 'sales_exchanges', 'status', "VARCHAR(20) NULL DEFAULT '待处理'");
  await modifyIfPresent(knex, 'sales_exchange_items', 'old_product_id', 'INT NULL');
  await modifyIfPresent(knex, 'sales_exchange_items', 'new_product_id', 'INT NULL');
  await modifyIfPresent(knex, 'sales_exchange_items', 'quantity', 'DECIMAL(10,2) NOT NULL DEFAULT 0');

  // Backfill canonical expense numbers where an older schema only had expense_no.
  if (
    (await columnExists(knex, 'expenses', 'expense_number')) &&
    (await columnExists(knex, 'expenses', 'expense_no'))
  ) {
    await knex.raw(
      'UPDATE expenses SET expense_number = expense_no WHERE (expense_number IS NULL OR expense_number = \'\') AND expense_no IS NOT NULL'
    );
  }
};

exports.down = async function down() {
  // Deliberately non-destructive: these tables/columns may contain production
  // traceability and accounting history.
};

