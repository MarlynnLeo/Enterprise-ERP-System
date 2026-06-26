/**
 * 通知规则配置表
 * @description 创建 notification_rules 表，支持可配置化的业务通知推送规则。
 *              参照 workflow_templates 模式：规则在后台管理页面配置，运行时从数据库读取。
 */

exports.up = async function (knex) {
  const exists = await knex.schema.hasTable('notification_rules');
  if (!exists) {
    await knex.schema.createTable('notification_rules', (table) => {
      table.increments('id').primary();
      table.string('name', 100).notNullable().comment('规则名称');
      table.string('event_type', 80).notNullable().comment('事件类型，如 PRODUCTION_TASK_COMPLETED');
      table.enum('recipient_type', ['permission', 'role', 'department', 'user'])
        .notNullable().defaultTo('permission')
        .comment('接收人类型');
      table.json('recipient_config').notNullable()
        .comment('接收人配置（权限码列表/角色ID/部门ID/用户ID 的 JSON 数组）');
      table.string('title_template', 200).notNullable()
        .comment('通知标题模板，支持 ${变量} 占位符');
      table.text('content_template').notNullable()
        .comment('通知内容模板，支持 ${变量} 占位符');
      table.string('link_template', 200).nullable()
        .comment('前端跳转链接模板');
      table.tinyint('priority', 1).notNullable().defaultTo(1)
        .comment('通知优先级：0=低 1=中 2=高');
      table.boolean('is_active').notNullable().defaultTo(true)
        .comment('是否启用');
      table.integer('created_by').unsigned().nullable();
      table.datetime('created_at').defaultTo(knex.fn.now());
      table.datetime('updated_at').defaultTo(knex.fn.now());
      table.datetime('deleted_at').nullable();

      table.index('event_type', 'idx_nr_event_type');
      table.index('is_active', 'idx_nr_active');
    });
  }

  // 插入默认规则（5条核心业务事件）
  const existingRules = await knex('notification_rules').count('id as count').first();
  if (existingRules.count === 0) {
    await knex('notification_rules').insert([
      {
        name: '生产任务完工通知',
        event_type: 'PRODUCTION_TASK_COMPLETED',
        recipient_type: 'permission',
        recipient_config: JSON.stringify(['production:plans', 'production:tasks']),
        title_template: '生产任务完工',
        content_template: '生产任务 ${taskCode} 已完工，请安排后续检验和入库。',
        link_template: '/production/task',
        priority: 1,
        is_active: true,
      },
      {
        name: '采购收货入库通知',
        event_type: 'PURCHASE_RECEIPT_COMPLETED',
        recipient_type: 'permission',
        recipient_config: JSON.stringify(['inventory:inbound', 'quality:incoming']),
        title_template: '采购收货入库',
        content_template: '收货单 ${receiptNo} 已完成入库，请及时安排来料检验。',
        link_template: '/purchase/receipts',
        priority: 1,
        is_active: true,
      },
      {
        name: '销售出库完成通知',
        event_type: 'SALES_OUTBOUND_COMPLETED',
        recipient_type: 'permission',
        recipient_config: JSON.stringify(['sales:outbound', 'sales:orders']),
        title_template: '销售出库完成',
        content_template: '出库单 ${outboundNo} 已完成出库。',
        link_template: '/sales/outbound',
        priority: 1,
        is_active: true,
      },
      {
        name: '销售退货完成通知',
        event_type: 'SALES_RETURN_COMPLETED',
        recipient_type: 'permission',
        recipient_config: JSON.stringify(['sales:returns', 'inventory:inbound']),
        title_template: '销售退货完成',
        content_template: '退货单 ${returnNo} 处理完成，退货物料已入库。',
        link_template: '/sales/returns',
        priority: 1,
        is_active: true,
      },
      {
        name: '采购退货完成通知',
        event_type: 'PURCHASE_RETURN_COMPLETED',
        recipient_type: 'permission',
        recipient_config: JSON.stringify(['purchase:returns', 'inventory:outbound']),
        title_template: '采购退货完成',
        content_template: '采购退货单 ${returnNo} 处理完成。',
        link_template: '/purchase/returns',
        priority: 1,
        is_active: true,
      },
    ]);
  }

  // 在 menus 中插入「通知规则」菜单项
  const menuExists = await knex('menus').where({ permission: 'system:notification-rules' }).first();
  if (!menuExists) {
    await knex('menus').insert({
      name: '通知规则',
      path: '/system/notification-rules',
      component: 'system/NotificationRules',
      permission: 'system:notification-rules',
      type: 1,
      visible: 1,
      parent_id: 12,
      sort_order: 12,
      status: 1,
      created_at: knex.fn.now(),
    });

    // 将新菜单分配给 admin 角色
    const adminRole = await knex('roles').where({ code: 'admin' }).first();
    const newMenu = await knex('menus').where({ permission: 'system:notification-rules' }).first();
    if (adminRole && newMenu) {
      const assigned = await knex('role_menus')
        .where({ role_id: adminRole.id, menu_id: newMenu.id })
        .first();
      if (!assigned) {
        await knex('role_menus').insert({
          role_id: adminRole.id,
          menu_id: newMenu.id,
          created_at: knex.fn.now(),
        });
      }
    }
  }
};

exports.down = async function (knex) {
  await knex('menus').where({ permission: 'system:notification-rules' }).del();
  await knex.schema.dropTableIfExists('notification_rules');
};
