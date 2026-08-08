/**
 * 列出启用超级管理员账号（只读），用于最小权限治理。
 * 用法：
 *   node scripts/list-super-admins.js
 *   node scripts/list-super-admins.js --json
 */
const { pool } = require('../src/config/db');
const NotificationGovernanceConfig = require('../src/services/system/NotificationGovernanceConfig');

async function main() {
  const asJson = process.argv.includes('--json');
  const governance = await NotificationGovernanceConfig.get();
  const [[stats]] = await pool.query(
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
  const [rows] = await pool.query(
    `SELECT u.id,
            u.username,
            u.real_name,
            u.email,
            GROUP_CONCAT(r.code ORDER BY r.code) AS role_codes,
            GROUP_CONCAT(r.name ORDER BY r.code) AS role_names
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id AND r.status = 1
      WHERE u.status = 1
        AND r.is_super_admin = 1
      GROUP BY u.id, u.username, u.real_name, u.email
      ORDER BY u.id`
  );

  const activeUsers = Number(stats.active_users || 0);
  const superAdminUsers = Number(stats.super_admin_users || 0);
  const ratio = activeUsers ? superAdminUsers / activeUsers : 0;
  const payload = {
    activeUsers,
    superAdminUsers,
    superAdminRatio: Number(ratio.toFixed(4)),
    adminRatioWarning: governance.adminRatioWarning,
    exceedsWarning: ratio > governance.adminRatioWarning,
    users: rows,
    recommendation:
      '日常业务账号应使用业务角色（purchase_manager/sales_manager 等）；admin 角色仅保留 1–3 个 break-glass 账号。',
  };

  if (asJson) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log('=== Super Admin Report ===');
    console.log(
      `activeUsers=${payload.activeUsers} superAdmins=${payload.superAdminUsers} ratio=${(
        payload.superAdminRatio * 100
      ).toFixed(1)}% (warn>${(payload.adminRatioWarning * 100).toFixed(0)}%)`
    );
    if (payload.exceedsWarning) {
      console.log('STATUS: EXCEEDS recommended super-admin ratio');
    } else {
      console.log('STATUS: within warning threshold');
    }
    console.log('--- users ---');
    for (const row of rows) {
      console.log(
        `#${row.id}\t${row.username}\t${row.real_name || '-'}\troles=${row.role_codes || '-'}`
      );
    }
    console.log(payload.recommendation);
  }

  process.exitCode = payload.exceedsWarning ? 2 : 0;
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
      // ignore pool shutdown errors
    }
    process.exit(process.exitCode || 0);
  });
