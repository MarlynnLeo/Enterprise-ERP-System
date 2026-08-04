async function addColumnIfMissing(knex, table, column, definition) {
  if (!(await knex.schema.hasColumn(table, column))) {
    await knex.raw(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
  }
}

async function resolveRuleRecipients(trx, rule) {
  const config = typeof rule.recipient_config === 'string'
    ? JSON.parse(rule.recipient_config)
    : rule.recipient_config;
  const values = Array.isArray(config) ? config : [];
  if (!values.length) return [];

  if (rule.recipient_type === 'user') {
    return (await trx('users').select('id').whereIn('id', values).where({ status: 1 }))
      .map((row) => Number(row.id));
  }
  if (rule.recipient_type === 'department') {
    return (await trx('users as u')
      .join('departments as d', 'd.id', 'u.department_id')
      .select('u.id')
      .whereIn('u.department_id', values)
      .where({ 'u.status': 1, 'd.status': 1 }))
      .map((row) => Number(row.id));
  }
  if (rule.recipient_type === 'role') {
    return (await trx('users as u')
      .join('user_roles as ur', 'ur.user_id', 'u.id')
      .join('roles as r', 'r.id', 'ur.role_id')
      .distinct('u.id')
      .whereIn('r.id', values)
      .where({ 'u.status': 1, 'r.status': 1 }))
      .map((row) => Number(row.id));
  }

  const registered = await trx('permissions').select('code').where({ status: 1 });
  const registeredCodes = new Set(registered.map((row) => row.code));
  const candidates = new Set();
  for (const code of values.map(String)) {
    candidates.add(code);
    if (registeredCodes.has(`${code}:view`)) candidates.add(`${code}:view`);
  }
  const rows = await trx('users as u')
    .join('user_roles as ur', 'ur.user_id', 'u.id')
    .join('roles as r', 'r.id', 'ur.role_id')
    .join('role_permissions as rp', 'rp.role_id', 'r.id')
    .join('permissions as p', 'p.id', 'rp.permission_id')
    .distinct('u.id')
    .where({ 'u.status': 1, 'r.status': 1, 'p.status': 1 })
    .whereNot('r.code', 'admin')
    .andWhere((builder) => {
      builder.whereIn('p.code', [...candidates]);
      for (const code of candidates) {
        const parts = code.split(':');
        for (let index = parts.length - 1; index > 0; index -= 1) {
          builder.orWhere('p.code', `${parts.slice(0, index).join(':')}:*`);
        }
      }
      builder.orWhere('p.code', '*');
    });
  return rows.map((row) => Number(row.id));
}

exports.up = async function up(knex) {
  await addColumnIfMissing(
    knex,
    'notifications',
    'is_suppressed',
    '`is_suppressed` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_read`'
  );
  await addColumnIfMissing(
    knex,
    'notifications',
    'suppressed_at',
    '`suppressed_at` DATETIME NULL AFTER `is_suppressed`'
  );
  await addColumnIfMissing(
    knex,
    'notifications',
    'suppression_reason',
    '`suppression_reason` VARCHAR(200) NULL AFTER `suppressed_at`'
  );

  const repair = { overdue_invoice: 0, notification_rules: {} };
  await knex.transaction(async (trx) => {
    const financeDepartments = await trx('departments')
      .select('id')
      .where({ status: 1 })
      .andWhere((builder) => {
        builder.whereIn('code', ['FINANCE', 'finance', 'CW']).orWhere('name', 'like', '%财务%');
      });
    const financeDepartmentIds = financeDepartments.map((row) => Number(row.id));
    if (financeDepartmentIds.length) {
      const result = await trx('notifications')
        .where({ source_type: 'overdue_invoice', is_suppressed: 0 })
        .whereNotIn('user_id', trx('users').select('id').whereIn('department_id', financeDepartmentIds).where({ status: 1 }))
        .update({
          is_suppressed: 1,
          suppressed_at: trx.fn.now(),
          suppression_reason: 'legacy_finance_notification_misroute',
        });
      repair.overdue_invoice = Number(result || 0);
    }

    const rules = await trx('notification_rules')
      .select('id', 'recipient_type', 'recipient_config')
      .whereNull('deleted_at');
    for (const rule of rules) {
      const recipientIds = await resolveRuleRecipients(trx, rule);
      if (!recipientIds.length) continue;
      const result = await trx('notifications')
        .where({ source_type: `notification_rule:${rule.id}`, is_suppressed: 0 })
        .whereNotIn('user_id', recipientIds)
        .update({
          is_suppressed: 1,
          suppressed_at: trx.fn.now(),
          suppression_reason: 'legacy_rule_recipient_misroute',
        });
      if (result) repair.notification_rules[rule.id] = Number(result);
    }

    if (await trx.schema.hasTable('audit_logs')) {
      await trx('audit_logs').insert({
        module: 'system',
        action: 'update',
        entity_type: 'notification_routing_repair',
        entity_id: '20260722000002',
        old_value: null,
        new_value: JSON.stringify(repair),
        created_at: trx.fn.now(),
      });
    }
  });
};

exports.down = async function down() {
  // 历史误路由标记属于审计事实，不在回滚时恢复到用户通知中心。
};
