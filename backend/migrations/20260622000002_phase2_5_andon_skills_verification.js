/**
 * Phase 2-5 数据库迁移
 * - anomaly_reports: 装配异常 Andon 上报
 * - assembly_verification_logs: 扫码防错记录
 * - employee_skills: 员工技能矩阵
 */

exports.up = async function (knex) {
  // ===================== Phase 2: Andon 异常上报 =====================
  if (!(await knex.schema.hasTable('anomaly_reports'))) {
  await knex.schema.createTable('anomaly_reports', (table) => {
    table.increments('id').primary();
    table.string('code', 30).notNullable().comment('异常编号 ANM-YYMMDD-NNN');
    table.integer('task_id').unsigned().comment('关联生产任务ID');
    table
      .enum('category', ['quality', 'equipment', 'material', 'safety', 'process', 'other'])
      .notNullable()
      .defaultTo('quality')
      .comment('异常类别');
    table
      .enum('severity', ['low', 'medium', 'high', 'critical'])
      .notNullable()
      .defaultTo('medium')
      .comment('严重程度');
    table.string('title', 200).notNullable().comment('异常标题');
    table.text('description').notNullable().comment('异常描述');
    table.string('location', 100).comment('发生位置/工位');
    table.json('images').comment('现场照片路径 JSON 数组');
    table
      .enum('status', ['open', 'processing', 'resolved', 'closed'])
      .notNullable()
      .defaultTo('open')
      .comment('处理状态');
    table.integer('reported_by').unsigned().notNullable().comment('上报人ID');
    table.integer('assigned_to').unsigned().comment('指派处理人ID');
    table.text('resolution').comment('处理方案');
    table.datetime('resolved_at').comment('解决时间');
    table.integer('resolved_by').unsigned().comment('解决人ID');
    table.datetime('created_at').defaultTo(knex.fn.now());
    table.datetime('updated_at').defaultTo(knex.fn.now());
    table.datetime('deleted_at');

    table.index('code');
    table.index('task_id');
    table.index('status');
    table.index('reported_by');
    table.index('severity');
  });
  }

  // ===================== Phase 4: 扫码防错记录 =====================
  if (!(await knex.schema.hasTable('assembly_verification_logs'))) {
  await knex.schema.createTable('assembly_verification_logs', (table) => {
    table.increments('id').primary();
    table.integer('task_id').unsigned().notNullable().comment('生产任务ID');
    table.integer('bom_detail_id').unsigned().comment('BOM 明细ID');
    table.integer('material_id').unsigned().notNullable().comment('物料ID');
    table.string('scanned_barcode', 200).notNullable().comment('扫描的条码');
    table.string('expected_barcode', 200).comment('期望的条码/物料编码');
    table
      .enum('result', ['pass', 'fail', 'warning'])
      .notNullable()
      .comment('验证结果');
    table.string('fail_reason', 500).comment('失败原因');
    table.integer('operator_id').unsigned().notNullable().comment('操作人ID');
    table.string('station', 100).comment('工位');
    table.datetime('created_at').defaultTo(knex.fn.now());

    table.index(['task_id', 'material_id']);
    table.index('operator_id');
    table.index('result');
  });
  }

  // ===================== Phase 5: 员工技能矩阵 =====================
  if (!(await knex.schema.hasTable('employee_skills'))) {
  await knex.schema.createTable('employee_skills', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable().comment('员工ID');
    table.string('skill_name', 100).notNullable().comment('技能名称');
    table.string('skill_category', 50).notNullable().comment('技能类别');
    table
      .enum('level', ['beginner', 'intermediate', 'advanced', 'expert'])
      .notNullable()
      .defaultTo('beginner')
      .comment('技能等级');
    table.date('certified_date').comment('认证日期');
    table.date('expiry_date').comment('过期日期');
    table.string('certificate_no', 100).comment('证书编号');
    table.integer('certified_by').unsigned().comment('认证人ID');
    table.text('remark').comment('备注');
    table.datetime('created_at').defaultTo(knex.fn.now());
    table.datetime('updated_at').defaultTo(knex.fn.now());
    table.datetime('deleted_at');

    table.index('user_id');
    table.index('skill_category');
    table.index('level');
    table.unique(['user_id', 'skill_name']);
  });
  }

  // 插入菜单项
  const menuItems = [
    {
      name: '异常上报',
      path: '/production/anomaly',
      component: 'production/AnomalyReport',
      icon: 'WarningFilled',
      sort_order: 40,
      parent_path: '/production',
      permission_code: 'production:anomaly',
    },
    {
      name: '员工技能矩阵',
      path: '/hr/skills',
      component: 'hr/EmployeeSkills',
      icon: 'Trophy',
      sort_order: 30,
      parent_path: '/hr',
      permission_code: 'hr:skills',
    },
  ];

  for (const item of menuItems) {
    const [existing] = await knex('menus').where('path', item.path);
    if (!existing) {
      const [parent] = await knex('menus').where('path', item.parent_path);
      await knex('menus').insert({
        name: item.name,
        path: item.path,
        component: item.component,
        icon: item.icon,
        sort_order: item.sort_order,
        parent_id: parent?.id || null,
        permission: item.permission_code,
        visible: 1,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });
    }
  }

};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('employee_skills');
  await knex.schema.dropTableIfExists('assembly_verification_logs');
  await knex.schema.dropTableIfExists('anomaly_reports');
  await knex('menus').whereIn('path', ['/production/anomaly', '/hr/skills']).del();
};
