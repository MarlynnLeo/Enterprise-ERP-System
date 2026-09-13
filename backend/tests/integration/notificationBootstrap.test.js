const knex = require('knex')(require('../../knexfile').test);
const { ensureNotificationRules } = require('../../src/bootstrap/notificationRules');
const { getEvent } = require('../../src/events/NotificationEventRegistry');
let trx;

describe('notification bootstrap ownership', () => {
  beforeEach(async () => { trx = await knex.transaction(); });
  afterEach(async () => { await trx.rollback(); });
  afterAll(async () => { await knex.destroy(); });

  const restoreFactoryRule = async () => {
    const event = getEvent('PRODUCTION_TASK_COMPLETED');
    await trx('notification_rules').insert({
      name: '生产任务完工通知', event_type: event.event_type, recipient_type: 'permission',
      recipient_config: JSON.stringify(['production:plans', 'production:tasks']),
      title_template: event.default_title, content_template: event.default_content,
      link_template: event.default_link, is_active: 1,
    });
    return trx('notification_rules').where({ event_type: event.event_type }).orderBy('id', 'desc').first();
  };

  test('resolves factory default owners by role code and remains idempotent', async () => {
    const rule = await restoreFactoryRule();
    await ensureNotificationRules(trx);
    const after = await trx('notification_rules').where({ id: rule.id }).first();
    expect(after.recipient_type).toBe('role');
    const ids = typeof after.recipient_config === 'string' ? JSON.parse(after.recipient_config) : after.recipient_config;
    const roles = await trx('roles').whereIn('id', ids).select('code');
    expect(roles.map(role => role.code)).toContain('production_planning');
    expect(roles.every(role => ['production_manager', 'production_planning', 'production_planner', 'quality_manager', 'final_inspector'].includes(role.code))).toBe(true);
    const first = await trx('notification_rules').orderBy('id');
    await ensureNotificationRules(trx);
    expect(await trx('notification_rules').orderBy('id')).toEqual(first);
  });

  test('preserves customized or disabled rules and initializes missing finance events', async () => {
    const customized = await restoreFactoryRule();
    await trx('notification_rules').where({ id: customized.id }).update({ content_template: '自定义通知内容' });
    const disabled = await restoreFactoryRule();
    await trx('notification_rules').where({ id: disabled.id }).update({ is_active: 0 });
    await trx('notification_rules').where({ event_type: 'FINANCE_AUTOMATION_COMPLETED' }).del();
    const before = await trx('notification_rules').whereIn('id', [customized.id, disabled.id]).orderBy('id');
    await ensureNotificationRules(trx);
    expect(await trx('notification_rules').whereIn('id', [customized.id, disabled.id]).orderBy('id')).toEqual(before);
    const finance = await trx('notification_rules').where({ event_type: 'FINANCE_AUTOMATION_COMPLETED' });
    expect(finance).toHaveLength(1);
    expect(Number(finance[0].is_active)).toBe(1);
  });
});
