const { pool } = require('../src/config/db');
const NotificationRuleService = require('../src/services/system/NotificationRuleService');
const NotificationRecipientService = require('../src/services/NotificationRecipientService');
const NotificationGovernanceConfig = require('../src/services/system/NotificationGovernanceConfig');
const NotificationResponsibilityService = require('../src/services/system/NotificationResponsibilityService');
const { getEvent, getEvents } = require('../src/events/NotificationEventRegistry');

async function main() {
  const strict = process.argv.includes('--strict');
  const errors = [];
  const warnings = [];
  const governance = await NotificationGovernanceConfig.get();
  const responsibilities = await NotificationResponsibilityService.getAll();
  const [[userStats]] = await pool.query(
    `SELECT COUNT(*) AS active_users,
            SUM(EXISTS(
              SELECT 1
                FROM user_roles ur
                JOIN roles r ON r.id = ur.role_id AND r.status = 1
               WHERE ur.user_id = u.id AND r.is_super_admin = 1
            )) AS super_admin_users
       FROM users u
      WHERE u.status = 1`
  );
  const activeUsers = Number(userStats.active_users || 0);
  const superAdminUsers = Number(userStats.super_admin_users || 0);
  const superAdminRatio = activeUsers ? superAdminUsers / activeUsers : 0;
  const [superAdminRows] = await pool.query(
    `SELECT u.id, u.username, GROUP_CONCAT(r.code ORDER BY r.code) AS role_codes
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id AND r.status = 1
      WHERE u.status = 1
        AND r.is_super_admin = 1
      GROUP BY u.id, u.username
      ORDER BY u.id`
  );
  if (
    activeUsers >= governance.minimumPopulation &&
    superAdminRatio > governance.adminRatioWarning
  ) {
    const sample = superAdminRows
      .slice(0, 12)
      .map((row) => row.username)
      .join(', ');
    const more =
      superAdminRows.length > 12 ? ` 等共 ${superAdminRows.length} 人` : '';
    warnings.push(
      `超级管理员占启用用户 ${Math.round(superAdminRatio * 100)}%（${superAdminUsers}/${activeUsers}），建议仅保留 break-glass 账号。名单: ${sample}${more}。可运行 node scripts/list-super-admins.js`
    );
  }

  for (const event of getEvents()) {
    if (event.responsibility_code && !responsibilities[event.responsibility_code]) {
      errors.push(`事件 ${event.event_type} 未配置责任组 ${event.responsibility_code}`);
    }
  }

  const responsibilityRecipients = new Map();
  for (const [code, responsibility] of Object.entries(responsibilities)) {
    const ids = await NotificationRecipientService.resolveRecipients(
      responsibility.recipient_type,
      responsibility.recipient_config
    );
    responsibilityRecipients.set(code, new Set(ids.map(Number)));
    if (!ids.length) errors.push(`责任组 ${code} 没有有效收件人`);
  }

  const [rules] = await pool.query(
    `SELECT id, name, event_type, recipient_type, recipient_config
       FROM notification_rules
      WHERE is_active = 1 AND deleted_at IS NULL
      ORDER BY id`
  );
  const activeEventTypes = new Set();
  const ruleResults = [];

  for (const rule of rules) {
    rule.recipient_config = typeof rule.recipient_config === 'string'
      ? JSON.parse(rule.recipient_config)
      : rule.recipient_config;
    const event = getEvent(rule.event_type);
    if (!event) {
      errors.push(`规则 ${rule.id} ${rule.name} 使用了未注册事件 ${rule.event_type}`);
      continue;
    }
    activeEventTypes.add(rule.event_type);

    const recipientIds = await NotificationRuleService.resolveRecipients(rule);
    const recipients = await NotificationRecipientService.getRecipientDetails(recipientIds);
    const ratio = activeUsers ? recipients.length / activeUsers : 0;
    ruleResults.push({ id: rule.id, event: rule.event_type, recipients: recipients.length });

    if (!recipients.length) errors.push(`规则 ${rule.id} ${rule.name} 没有有效收件人`);
    if (
      activeUsers >= governance.minimumPopulation &&
      ratio >= governance.broadcastBlockRatio
    ) {
      errors.push(`规则 ${rule.id} ${rule.name} 覆盖 ${Math.round(ratio * 100)}% 启用用户`);
    } else if (
      activeUsers >= governance.minimumPopulation &&
      ratio >= governance.broadcastWarningRatio
    ) {
      warnings.push(`规则 ${rule.id} ${rule.name} 覆盖 ${Math.round(ratio * 100)}% 启用用户`);
    }

    if (event.responsibility_code) {
      const allowed = responsibilityRecipients.get(event.responsibility_code) || new Set();
      const outside = recipientIds.filter((id) => !allowed.has(Number(id)));
      if (outside.length) {
        errors.push(`规则 ${rule.id} 超出责任组 ${event.responsibility_code}：${outside.length} 名用户`);
      }
    }
  }

  for (const event of getEvents()) {
    if (event.responsibility_code && !activeEventTypes.has(event.event_type)) {
      warnings.push(`责任事件 ${event.event_type} 没有启用的通知规则`);
    }
  }

  console.log('Notification governance audit');
  console.log(
    JSON.stringify(
      {
        activeUsers,
        superAdminUsers,
        superAdminRatio: Number(superAdminRatio.toFixed(4)),
        superAdminUsernames: superAdminRows.map((row) => row.username),
        governance,
        rules: ruleResults,
      },
      null,
      2
    )
  );
  warnings.forEach((warning) => console.warn(`WARN: ${warning}`));
  errors.forEach((error) => console.error(`ERROR: ${error}`));

  if (errors.length || (strict && warnings.length)) {
    process.exitCode = 1;
  } else {
    console.log(`Result: OK${warnings.length ? ` (${warnings.length} governance warning(s))` : ''}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      if (typeof pool.end === 'function') await pool.end();
    } catch {
      // ignore
    }
    process.exit(process.exitCode || 0);
  });
  .finally(async () => {
    await pool.end();
  });
