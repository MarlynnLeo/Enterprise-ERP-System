const GOVERNANCE_SETTING_KEY = 'notification.governance';
const RESPONSIBILITIES_SETTING_KEY = 'notification.responsibilities';

const GOVERNANCE_DEFAULTS = {
  broadcastBlockRatio: 0.8,
  broadcastWarningRatio: 0.5,
  minimumPopulation: 5,
  maxTargetsPerRule: 100,
  optionLimit: 1000,
  realtimeWindowMinutes: 5,
  adminRatioWarning: 0.2,
};

async function insertSettingIfMissing(trx, key, value, description) {
  const existing = await trx('system_settings').where({ key }).first();
  if (!existing) {
    await trx('system_settings').insert({
      key,
      value: JSON.stringify(value),
      description,
      created_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    });
  }
}

function parseRecipientConfig(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    await insertSettingIfMissing(
      trx,
      GOVERNANCE_SETTING_KEY,
      GOVERNANCE_DEFAULTS,
      '通知治理阈值与容量配置'
    );

    const representativeRule = await trx('notification_rules')
      .select('recipient_type', 'recipient_config')
      .where('event_type', 'like', 'FINANCE\_%')
      .where({ is_active: 1 })
      .whereNull('deleted_at')
      .orderBy('id')
      .first();

    const financeResponsibility = representativeRule
      ? {
          code: 'finance',
          name: '财务通知责任组',
          recipient_type: representativeRule.recipient_type,
          recipient_config: parseRecipientConfig(representativeRule.recipient_config),
          description: '财务事件允许触达的用户范围',
        }
      : {
          code: 'finance',
          name: '财务通知责任组',
          recipient_type: 'permission',
          recipient_config: ['finance:overdue:notify'],
          description: '财务事件允许触达的用户范围，请在启用规则前完成配置',
        };

    await insertSettingIfMissing(
      trx,
      RESPONSIBILITIES_SETTING_KEY,
      { finance: financeResponsibility },
      '通知事件责任组配置'
    );

    if (await trx.schema.hasTable('audit_logs')) {
      await trx('audit_logs').insert({
        module: 'system',
        action: 'create',
        entity_type: 'notification_governance_config',
        entity_id: '20260722000004',
        old_value: null,
        new_value: JSON.stringify({
          governance_setting: GOVERNANCE_SETTING_KEY,
          responsibilities_setting: RESPONSIBILITIES_SETTING_KEY,
          finance_recipient_type: financeResponsibility.recipient_type,
          finance_recipient_count: financeResponsibility.recipient_config.length,
        }),
        created_at: trx.fn.now(),
      });
    }
  });
};

exports.down = async function down() {
  // 治理配置属于运行期业务主数据，回滚代码时保留。
};
