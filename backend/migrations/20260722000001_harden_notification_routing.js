const ACTION_PERMISSIONS = [
  ['system:notification-rules:view', '查看通知规则'],
  ['system:notification-rules:create', '新增通知规则'],
  ['system:notification-rules:update', '编辑通知规则'],
  ['system:notification-rules:delete', '删除通知规则'],
  ['system:notification-rules:toggle', '启停通知规则'],
  ['system:notification-rules:test', '测试通知规则'],
  ['system:tech-comm:broadcast', '发布全员通讯'],
];

async function ensurePermission(trx, code, meta = {}) {
  const existing = await trx('permissions').where({ code }).first();
  if (existing) {
    if (Number(existing.status) !== 1) {
      await trx('permissions').where({ id: existing.id }).update({ status: 1, updated_at: trx.fn.now() });
    }
    return Number(existing.id);
  }

  const [id] = await trx('permissions').insert({
    code,
    name: meta.name || code,
    module: String(code).split(':')[0],
    description: meta.description || null,
    status: 1,
    source: meta.source || 'notification-hardening',
    created_at: trx.fn.now(),
    updated_at: trx.fn.now(),
  });
  return Number(id);
}

async function ensureActionMenu(trx, parent, permission, name, roleIds) {
  const permissionId = await ensurePermission(trx, permission, {
    name,
    source: 'notification-hardening',
  });
  let menu = await trx('menus').where({ permission }).first();
  if (!menu) {
    const [id] = await trx('menus').insert({
      parent_id: parent?.id || 0,
      name,
      path: '',
      component: '',
      icon: '',
      permission,
      permission_id: permissionId,
      type: 2,
      visible: 0,
      status: 1,
      sort_order: 900,
      created_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    });
    menu = { id };
  } else {
    await trx('menus').where({ id: menu.id }).update({
      permission_id: permissionId,
      status: 1,
      updated_at: trx.fn.now(),
    });
  }

  for (const roleId of roleIds) {
    await trx('role_menus').insert({
      role_id: roleId,
      menu_id: menu.id,
      created_at: trx.fn.now(),
    }).onConflict(['role_id', 'menu_id']).ignore();
    await trx('role_permissions').insert({
      role_id: roleId,
      permission_id: permissionId,
      created_at: trx.fn.now(),
    }).onConflict(['role_id', 'permission_id']).ignore();
  }
}

async function getFinanceRecipients(trx) {
  const department = await trx('departments as d')
    .leftJoin('users as u', function joinUsers() {
      this.on('u.department_id', '=', 'd.id').andOnVal('u.status', '=', 1);
    })
    .select('d.id')
    .countDistinct({ active_users: 'u.id' })
    .where('d.status', 1)
    .andWhere((builder) => {
      builder.whereIn('d.code', ['FINANCE', 'finance', 'CW']).orWhere('d.name', 'like', '%财务%');
    })
    .groupBy('d.id')
    .orderBy('active_users', 'desc')
    .first();

  if (department) {
    return {
      recipient_type: 'department',
      recipient_config: [Number(department.id)],
      is_active: Number(department.active_users || 0) > 0,
    };
  }

  const roles = await trx('roles as r')
    .leftJoin('user_roles as ur', 'ur.role_id', 'r.id')
    .leftJoin('users as u', function joinUsers() {
      this.on('u.id', '=', 'ur.user_id').andOnVal('u.status', '=', 1);
    })
    .select('r.id')
    .countDistinct({ active_users: 'u.id' })
    .where('r.status', 1)
    .whereIn('r.code', ['finance_manager', 'accountant'])
    .groupBy('r.id');

  return {
    recipient_type: 'role',
    recipient_config: roles.map((role) => Number(role.id)),
    is_active: roles.some((role) => Number(role.active_users || 0) > 0),
  };
}

async function seedFinanceRules(trx) {
  if (!(await trx.schema.hasTable('notification_rules'))) return;
  const recipients = await getFinanceRecipients(trx);
  if (!recipients.recipient_config.length) return;

  const rules = [
    {
      name: '应收发票逾期通知',
      event_type: 'FINANCE_AR_INVOICE_OVERDUE',
      title_template: '应收发票逾期提醒',
      content_template: '应收发票 ${invoiceNumber} 已逾期 ${overdueDays} 天，客户：${customerName}，余额：¥${balanceAmount}。',
      link_template: '/finance/ar/invoices',
      priority: 2,
    },
    {
      name: '应付发票逾期通知',
      event_type: 'FINANCE_AP_INVOICE_OVERDUE',
      title_template: '应付发票逾期提醒',
      content_template: '应付发票 ${invoiceNumber} 已逾期 ${overdueDays} 天，供应商：${supplierName}，余额：¥${balanceAmount}。',
      link_template: '/finance/ap/invoices',
      priority: 2,
    },
    {
      name: '财务自动化完成通知',
      event_type: 'FINANCE_AUTOMATION_COMPLETED',
      title_template: '${title}',
      content_template: '${message}',
      link_template: '/finance/automation',
      priority: 1,
    },
    {
      name: '财务自动化失败通知',
      event_type: 'FINANCE_AUTOMATION_FAILED',
      title_template: '${title}',
      content_template: '${message}',
      link_template: '/finance/automation',
      priority: 2,
    },
  ];

  for (const rule of rules) {
    const exists = await trx('notification_rules')
      .where({ event_type: rule.event_type })
      .whereNull('deleted_at')
      .first();
    if (exists) continue;
    await trx('notification_rules').insert({
      ...rule,
      recipient_type: recipients.recipient_type,
      recipient_config: JSON.stringify(recipients.recipient_config),
      is_active: recipients.is_active ? 1 : 0,
      created_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    });
  }
}

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    const notificationParent = await trx('menus')
      .where({ permission: 'system:notification-rules' })
      .first();
    const techCommParent = await trx('menus').where({ permission: 'system:tech-comm' }).first();
    const adminRoleIds = (await trx('roles').select('id').where({ code: 'admin', status: 1 }))
      .map((role) => Number(role.id));
    const inheritedRoleIds = notificationParent
      ? (await trx('role_menus').select('role_id').where({ menu_id: notificationParent.id }))
        .map((row) => Number(row.role_id))
      : [];
    const notificationRoleIds = [...new Set([...adminRoleIds, ...inheritedRoleIds])];

    for (const [permission, name] of ACTION_PERMISSIONS) {
      const parent = permission === 'system:tech-comm:broadcast' ? techCommParent : notificationParent;
      const roleIds = permission === 'system:notification-rules:view'
        ? notificationRoleIds
        : adminRoleIds;
      await ensureActionMenu(trx, parent, permission, name, roleIds);
    }

    await ensurePermission(trx, 'finance:overdue:notify', {
      name: '接收财务逾期通知',
      source: 'notification-hardening',
    });
    await seedFinanceRules(trx);
  });
};

exports.down = async function down() {
  // 权限和通知规则属于业务主数据，回滚代码时保留审计配置。
};
