exports.up = async function(knex) {
  // 1. Create standard_cost_versions table
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS standard_cost_versions (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      version_no VARCHAR(50) NOT NULL UNIQUE COMMENT '版本号',
      version_name VARCHAR(100) NOT NULL COMMENT '版本名',
      status ENUM('draft', 'pending', 'active', 'archived') NOT NULL DEFAULT 'draft' COMMENT '版本状态',
      effective_date DATE NOT NULL COMMENT '生效日期',
      expiry_date DATE COMMENT '失效日期',
      remark VARCHAR(255) COMMENT '备注说明',
      created_by VARCHAR(50) NOT NULL DEFAULT 'system' COMMENT '创建人',
      approved_by VARCHAR(50) COMMENT '审批人',
      approved_at DATETIME COMMENT '审批时间',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='标准成本版本表';
  `);

  // 2. Add columns to standard_costs
  const hasVersionId = await knex.schema.hasColumn('standard_costs', 'version_id');
  if (!hasVersionId) {
    await knex.schema.alterTable('standard_costs', table => {
      // Create version_id column without fk first, as target may not be fully synced in transcation
      table.integer('version_id').unsigned().comment('版本ID').nullable();
      table.enum('status', ['draft', 'pending', 'active', 'archived']).notNullable().defaultTo('draft').comment('状态');
      table.enum('source_type', ['manual', 'rollup', 'purchase_average']).notNullable().defaultTo('manual').comment('成本来源');
      table.string('operator', 50).defaultTo('system').comment('操作人');
    });
  }

  // Add foreign key dynamically
  try {
    const [fks] = await knex.raw(`
      SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE 
      WHERE TABLE_NAME = 'standard_costs' AND TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'version_id' AND REFERENCED_TABLE_NAME IS NOT NULL
    `);
    if (fks.length === 0) {
      await knex.raw(`ALTER TABLE standard_costs ADD CONSTRAINT fk_stdcost_version_upgrade FOREIGN KEY (version_id) REFERENCES standard_cost_versions(id) ON DELETE RESTRICT`);
    }
  } catch(e) {
    console.error('Cannot add foreign key:', e.message);
  }

  // 3. Data Migration
  await knex.raw(`UPDATE standard_costs SET status = 'active' WHERE is_active = 1`);
  await knex.raw(`UPDATE standard_costs SET status = 'archived' WHERE is_active = 0`);

  // 4. Create an initial "Default Version"
  const [activeRecords] = await knex.raw(`SELECT id FROM standard_costs WHERE status = 'active' LIMIT 1`);
  if (activeRecords && activeRecords.length > 0) {
    const [versionCheck] = await knex.raw(`SELECT id FROM standard_cost_versions WHERE version_no = 'V_LEGACY_001'`);
    let versionId;
    if (!versionCheck || versionCheck.length === 0) {
      const [res] = await knex.raw(`
         INSERT INTO standard_cost_versions (version_no, version_name, status, effective_date, created_by, approved_by, approved_at)
         VALUES ('V_LEGACY_001', '系统初期历史版本', 'active', '2000-01-01', 'system', 'system', NOW())
      `);
      versionId = res.insertId;
    } else {
      versionId = versionCheck[0].id;
    }
    await knex.raw(`UPDATE standard_costs SET version_id = ? WHERE version_id IS NULL AND status = 'active'`, [versionId]);
  }
};

exports.down = async function(knex) {
  try {
    await knex.raw(`ALTER TABLE standard_costs DROP FOREIGN KEY fk_stdcost_version_upgrade`);
  } catch(e) {}

  const hasVersionId = await knex.schema.hasColumn('standard_costs', 'version_id');
  if (hasVersionId) {
    await knex.schema.alterTable('standard_costs', table => {
      table.dropColumn('version_id');
      table.dropColumn('status');
      table.dropColumn('source_type');
      table.dropColumn('operator');
    });
  }

  await knex.raw(`DROP TABLE IF EXISTS standard_cost_versions`);
};
