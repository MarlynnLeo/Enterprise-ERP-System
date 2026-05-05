/**
 * 对齐主数据运行时依赖的表结构。
 * 这些字段和字典表已被业务代码稳定使用，迁移层需要显式管理，避免新环境启动后才暴露缺列问题。
 */

async function columnExists(knex, tableName, columnName) {
  const [rows] = await knex.raw(
    `SELECT COUNT(*) as cnt
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?`,
    [tableName, columnName]
  );
  return rows[0].cnt > 0;
}

async function indexExists(knex, tableName, indexName) {
  const [rows] = await knex.raw(
    `SELECT COUNT(*) as cnt
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND index_name = ?`,
    [tableName, indexName]
  );
  return rows[0].cnt > 0;
}

async function addColumnIfMissing(knex, tableName, columnName, definition) {
  if (!(await knex.schema.hasTable(tableName))) return;
  if (!(await columnExists(knex, tableName, columnName))) {
    await knex.raw(`ALTER TABLE \`${tableName}\` ADD COLUMN ${definition}`);
  }
}

async function addIndexIfMissing(knex, tableName, indexName, definition) {
  if (!(await knex.schema.hasTable(tableName))) return;
  if (!(await indexExists(knex, tableName, indexName))) {
    await knex.raw(`ALTER TABLE \`${tableName}\` ADD ${definition}`);
  }
}

exports.up = async function (knex) {
  const hasMaterialSources = await knex.schema.hasTable('material_sources');
  if (!hasMaterialSources) {
    await knex.schema.createTable('material_sources', (table) => {
      table.increments('id').primary();
      table.string('name', 100).notNullable();
      table.string('code', 50).notNullable().unique();
      table.enu('type', ['internal', 'external', 'outsourced']).notNullable().defaultTo('external');
      table.integer('sort').notNullable().defaultTo(0);
      table.integer('status').notNullable().defaultTo(1);
      table.string('description', 255).nullable();
      table.timestamp('deleted_at').nullable();
      table.timestamps(true, true);
      table.index(['type']);
      table.index(['status']);
      table.index(['deleted_at']);
    });
  }

  const hasInspectionMethods = await knex.schema.hasTable('inspection_methods');
  if (!hasInspectionMethods) {
    await knex.schema.createTable('inspection_methods', (table) => {
      table.increments('id').primary();
      table.string('name', 100).notNullable();
      table.string('code', 50).notNullable().unique();
      table.integer('sort').notNullable().defaultTo(0);
      table.integer('status').notNullable().defaultTo(1);
      table.string('description', 255).nullable();
      table.timestamp('deleted_at').nullable();
      table.timestamps(true, true);
      table.index(['status']);
      table.index(['deleted_at']);
    });
  }

  await knex.raw(`
    INSERT INTO material_sources (name, code, type, sort, status, description)
    VALUES
      ('自产', 'INTERNAL', 'internal', 10, 1, '企业内部生产'),
      ('外购', 'EXTERNAL', 'external', 20, 1, '供应商采购'),
      ('外协', 'OUTSOURCED', 'outsourced', 30, 1, '委外加工')
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      type = VALUES(type),
      sort = VALUES(sort),
      status = VALUES(status),
      description = VALUES(description)
  `);

  await knex.raw(`
    INSERT INTO inspection_methods (name, code, sort, status, description)
    VALUES
      ('全检', 'FULL', 10, 1, '逐件检验'),
      ('抽检', 'SAMPLE', 20, 1, '按规则抽样检验'),
      ('免检', 'EXEMPT', 30, 1, '按供应商或物料规则免检')
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      sort = VALUES(sort),
      status = VALUES(status),
      description = VALUES(description)
  `);

  await addColumnIfMissing(knex, 'suppliers', 'contact_phone', '`contact_phone` VARCHAR(50) NULL COMMENT \'联系电话\'');
  if (await columnExists(knex, 'suppliers', 'phone')) {
    await knex.raw('UPDATE suppliers SET contact_phone = COALESCE(contact_phone, phone) WHERE contact_phone IS NULL');
  }

  await addColumnIfMissing(knex, 'departments', 'manager_id', '`manager_id` INT NULL COMMENT \'部门负责人用户ID\'');
  await addIndexIfMissing(knex, 'departments', 'idx_departments_manager_id', 'INDEX idx_departments_manager_id (`manager_id`)');

  await addColumnIfMissing(knex, 'materials', 'product_category_id', '`product_category_id` INT NULL COMMENT \'产品大类ID\'');
  await addColumnIfMissing(knex, 'materials', 'material_source_id', '`material_source_id` INT NULL COMMENT \'物料来源ID\'');
  await addColumnIfMissing(knex, 'materials', 'inspection_method_id', '`inspection_method_id` INT NULL COMMENT \'检验方式ID\'');
  await addColumnIfMissing(knex, 'materials', 'supplier_id', '`supplier_id` INT NULL COMMENT \'默认供应商ID\'');
  await addColumnIfMissing(knex, 'materials', 'location_id', '`location_id` INT NULL COMMENT \'默认库位ID\'');
  await addColumnIfMissing(knex, 'materials', 'production_group_id', '`production_group_id` INT NULL COMMENT \'生产组部门ID\'');
  await addColumnIfMissing(knex, 'materials', 'manager_id', '`manager_id` INT NULL COMMENT \'物料负责人用户ID\'');
  await addColumnIfMissing(knex, 'materials', 'drawing_no', '`drawing_no` VARCHAR(100) NULL COMMENT \'图号\'');
  await addColumnIfMissing(knex, 'materials', 'color_code', '`color_code` VARCHAR(100) NULL COMMENT \'色号\'');
  await addColumnIfMissing(knex, 'materials', 'material_type', '`material_type` VARCHAR(100) NULL COMMENT \'材质/物料类型\'');
  await addColumnIfMissing(knex, 'materials', 'location_detail', '`location_detail` VARCHAR(255) NULL COMMENT \'库位详细位置\'');
  await addColumnIfMissing(knex, 'materials', 'price', '`price` DECIMAL(15,4) NOT NULL DEFAULT 0 COMMENT \'参考售价\'');
  await addColumnIfMissing(knex, 'materials', 'cost_price', '`cost_price` DECIMAL(15,4) NOT NULL DEFAULT 0 COMMENT \'当前成本价\'');
  await addColumnIfMissing(knex, 'materials', 'tax_rate', '`tax_rate` DECIMAL(8,4) NOT NULL DEFAULT 0.1300 COMMENT \'默认税率\'');
  await addColumnIfMissing(knex, 'materials', 'remark', '`remark` TEXT NULL COMMENT \'备注\'');

  if ((await columnExists(knex, 'materials', 'remarks')) && (await columnExists(knex, 'materials', 'remark'))) {
    await knex.raw('UPDATE materials SET remark = COALESCE(remark, remarks) WHERE remark IS NULL');
  }

  await addIndexIfMissing(knex, 'materials', 'idx_materials_product_category_id', 'INDEX idx_materials_product_category_id (`product_category_id`)');
  await addIndexIfMissing(knex, 'materials', 'idx_materials_material_source_id', 'INDEX idx_materials_material_source_id (`material_source_id`)');
  await addIndexIfMissing(knex, 'materials', 'idx_materials_inspection_method_id', 'INDEX idx_materials_inspection_method_id (`inspection_method_id`)');
  await addIndexIfMissing(knex, 'materials', 'idx_materials_supplier_id', 'INDEX idx_materials_supplier_id (`supplier_id`)');
  await addIndexIfMissing(knex, 'materials', 'idx_materials_location_id', 'INDEX idx_materials_location_id (`location_id`)');
  await addIndexIfMissing(knex, 'materials', 'idx_materials_production_group_id', 'INDEX idx_materials_production_group_id (`production_group_id`)');
  await addIndexIfMissing(knex, 'materials', 'idx_materials_manager_id', 'INDEX idx_materials_manager_id (`manager_id`)');

  if (await knex.schema.hasTable('sales_returns')) {
    await knex.raw(`
      ALTER TABLE sales_returns
      MODIFY COLUMN status ENUM('draft', 'pending', 'approved', 'completed', 'rejected', 'cancelled')
      NOT NULL DEFAULT 'draft'
    `);
  }
};

exports.down = async function (knex) {
  if (await knex.schema.hasTable('sales_returns')) {
    await knex.raw(`
      UPDATE sales_returns SET status = 'draft' WHERE status = 'cancelled'
    `);
    await knex.raw(`
      ALTER TABLE sales_returns
      MODIFY COLUMN status ENUM('draft', 'pending', 'approved', 'completed', 'rejected')
      NOT NULL DEFAULT 'draft'
    `);
  }

  const materialColumns = [
    'product_category_id',
    'material_source_id',
    'inspection_method_id',
    'supplier_id',
    'location_id',
    'production_group_id',
    'manager_id',
    'drawing_no',
    'color_code',
    'material_type',
    'location_detail',
    'price',
    'cost_price',
    'tax_rate',
    'remark',
  ];

  for (const column of materialColumns) {
    if (await columnExists(knex, 'materials', column)) {
      await knex.raw(`ALTER TABLE materials DROP COLUMN \`${column}\``);
    }
  }

  if (await columnExists(knex, 'departments', 'manager_id')) {
    await knex.raw('ALTER TABLE departments DROP COLUMN `manager_id`');
  }

  if (await columnExists(knex, 'suppliers', 'contact_phone')) {
    await knex.raw('ALTER TABLE suppliers DROP COLUMN `contact_phone`');
  }
};
