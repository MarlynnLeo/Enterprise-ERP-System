const { getEvent, getEventsByResponsibility } = require('../events/NotificationEventRegistry');

// Role codes survive database rebuilds; numeric role IDs and broad page-view
// permissions do not describe the business owner of an event.
const DEFAULT_RECIPIENTS = {
  PRODUCTION_TASK_COMPLETED: { name: '生产任务完工通知', legacy: ['production:plans', 'production:tasks'], roles: ['production_manager', 'production_planning', 'production_planner', 'quality_manager', 'final_inspector'] },
  PURCHASE_RECEIPT_COMPLETED: { name: '采购收货入库通知', legacy: ['inventory:inbound', 'quality:incoming'], roles: ['component_warehouse_operator', 'inventory_manager', 'incoming_inspector'] },
  SALES_OUTBOUND_COMPLETED: { name: '销售出库完成通知', legacy: ['sales:outbound', 'sales:orders'], roles: ['sales_manager', 'salesperson', 'finished_goods_operator', 'inventory_manager'] },
  SALES_RETURN_COMPLETED: { name: '销售退货完成通知', legacy: ['sales:returns', 'inventory:inbound'], roles: ['sales_manager', 'salesperson', 'finished_goods_operator', 'inventory_manager'] },
  PURCHASE_RETURN_COMPLETED: { name: '采购退货完成通知', legacy: ['purchase:returns', 'inventory:outbound'], roles: ['purchase_manager', 'purchaser', 'component_warehouse_operator', 'inventory_manager'] },
};

const parse = (raw, fallback) => {
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw || fallback; }
  catch { return fallback; }
};
const sameValues = (a, b) => Array.isArray(a) && JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

async function hasRecipients(trx, type, config) {
  if (!Array.isArray(config) || !config.length) return false;
  const query = trx('users as u').where('u.status', 1);
  if (type === 'user') query.whereIn('u.id', config);
  else if (type === 'department') query.join('departments as d', 'd.id', 'u.department_id').where('d.status', 1).whereIn('d.id', config);
  else if (type === 'role' || type === 'permission') {
    query.join('user_roles as ur', 'ur.user_id', 'u.id').join('roles as r', 'r.id', 'ur.role_id').where('r.status', 1);
    if (type === 'role') query.whereIn('r.id', config);
    else {
      query.join('role_permissions as rp', 'rp.role_id', 'r.id').join('permissions as p', 'p.id', 'rp.permission_id')
        .where('p.status', 1).where('r.is_super_admin', 0).andWhere(builder => {
          builder.whereIn('p.code', config).orWhere('p.code', '*');
          for (const code of config) builder.orWhereRaw("RIGHT(p.code, 2) = ':*' AND ? LIKE CONCAT(LEFT(p.code, CHAR_LENGTH(p.code) - 1), '%')", [code]);
        });
    }
  } else return false;
  return Boolean(await query.first('u.id'));
}

async function ensureNotificationRules(knex) {
  if (!(await knex.schema.hasTable('notification_rules'))) return;
  await knex.transaction(async trx => {
    for (const [eventType, defaults] of Object.entries(DEFAULT_RECIPIENTS)) {
      const event = getEvent(eventType);
      const rules = await trx('notification_rules').where({ event_type: eventType, is_active: 1, recipient_type: 'permission', name: defaults.name }).whereNull('deleted_at').whereNull('created_by');
      for (const rule of rules) {
        // Only unchanged factory defaults may be migrated. A user's renamed,
        // disabled, retargeted or edited rule remains their configuration.
        if (!sameValues(parse(rule.recipient_config, []), defaults.legacy)
          || rule.title_template !== event.default_title || rule.content_template !== event.default_content
          || rule.link_template !== event.default_link) continue;
        const roles = await trx('roles').whereIn('code', defaults.roles).where({ status: 1 }).orderBy('id').select('id');
        const ids = roles.map(role => Number(role.id));
        if (!(await hasRecipients(trx, 'role', ids))) continue;
        await trx('notification_rules').where({ id: rule.id }).update({ recipient_type: 'role', recipient_config: JSON.stringify(ids), updated_at: trx.fn.now() });
      }
    }
    const setting = await trx('system_settings').where({ key: 'notification.responsibilities' }).first('value');
    const finance = parse(setting?.value, {}).finance;
    if (!finance || !(await hasRecipients(trx, finance.recipient_type, finance.recipient_config))) return;
    for (const event of getEventsByResponsibility('finance')) {
      // Presence, including disabled/deleted rules, is an explicit configuration.
      if (await trx('notification_rules').where({ event_type: event.event_type }).first('id')) continue;
      await trx('notification_rules').insert({
        name: `${event.label}通知`, event_type: event.event_type,
        recipient_type: finance.recipient_type, recipient_config: JSON.stringify(finance.recipient_config),
        title_template: event.default_title, content_template: event.default_content, link_template: event.default_link,
        priority: event.event_type === 'FINANCE_AUTOMATION_COMPLETED' ? 1 : 2,
        is_active: 1, created_at: trx.fn.now(), updated_at: trx.fn.now(),
      });
    }
  });
}

module.exports = { ensureNotificationRules };
