/**
 * 按在岗用户实测其可进模块的页面启动接口。
 * 只发 GET，不写业务数据。
 *
 * 用法：node scripts/audit-department-page-permissions.js
 * 可选：API_BASE=http://127.0.0.1:8080
 */
'use strict';

require('dotenv').config();
const axios = require('axios');
const { pool } = require('../src/config/db');
const { generateToken } = require('../src/config/jwtEnhanced');
const PermissionService = require('../src/services/PermissionService');
const PasswordSecurity = require('../src/utils/passwordSecurity');

const API_BASE = String(process.env.API_BASE || 'http://127.0.0.1:8080').replace(/\/+$/, '');

const PAGE_CHECKS = [
  {
    name: '首页',
    menuPaths: ['/', '/dashboard'],
    gets: [
      '/api/auth/profile',
      '/api/auth/permissions',
      '/api/auth/menus',
      '/api/user-activities/online-time-ranking',
      '/api/enhanced/exchange-rates/latest?from=USD&to=CNY',
      '/api/metal-prices/realtime',
      '/api/todos?page=1&pageSize=10',
    ],
  },
  {
    name: '采购申请',
    menuPaths: ['/purchase/requisitions'],
    gets: [
      '/api/purchase/requisitions?page=1&pageSize=5',
      '/api/base-data/suppliers?page=1&pageSize=5',
      '/api/base-data/materials?page=1&pageSize=5',
    ],
  },
  {
    name: '采购订单',
    menuPaths: ['/purchase/orders'],
    gets: [
      '/api/purchase/orders?page=1&pageSize=5',
      '/api/base-data/suppliers?page=1&pageSize=5',
      '/api/base-data/materials?page=1&pageSize=5',
    ],
  },
  {
    name: '采购收货',
    menuPaths: ['/purchase/receipts'],
    gets: [
      '/api/purchase/receipts?page=1&pageSize=5',
      '/api/quality/inspections/incoming?page=1&pageSize=5',
      '/api/base-data/suppliers?page=1&pageSize=5',
      '/api/base-data/materials?page=1&pageSize=5',
    ],
  },
  {
    name: '销售订单',
    menuPaths: ['/sales/orders'],
    gets: [
      '/api/sales/orders?page=1&pageSize=5',
      '/api/base-data/customers?page=1&pageSize=5',
      '/api/base-data/materials?page=1&pageSize=5',
    ],
  },
  {
    name: '库存查询',
    menuPaths: ['/inventory/stock'],
    gets: [
      '/api/inventory/stock?page=1&pageSize=5',
      '/api/base-data/materials?page=1&pageSize=5',
      '/api/base-data/locations?page=1&pageSize=5',
    ],
  },
  {
    name: '库存出库',
    menuPaths: ['/inventory/outbound'],
    gets: [
      '/api/inventory/outbound?page=1&pageSize=5',
      '/api/system/departments?status=1',
      '/api/production/tasks?status[]=pending',
      '/api/base-data/materials?page=1&pageSize=5',
      '/api/base-data/locations?page=1&pageSize=5',
    ],
  },
  {
    name: '库存入库',
    menuPaths: ['/inventory/inbound'],
    gets: [
      '/api/inventory/inbound?page=1&pageSize=5',
      '/api/system/departments?status=1',
      '/api/production/tasks?status[]=pending',
      '/api/base-data/materials?page=1&pageSize=5',
      '/api/base-data/locations?page=1&pageSize=5',
    ],
  },
  {
    name: '生产计划',
    menuPaths: ['/production/plan'],
    gets: [
      '/api/production/plans?page=1&pageSize=5',
      '/api/system/departments',
      '/api/base-data/materials?page=1&pageSize=5',
    ],
  },
  {
    name: '生产任务',
    menuPaths: ['/production/task'],
    gets: [
      '/api/production/tasks?page=1&pageSize=5',
      '/api/system/departments',
      '/api/base-data/boms?page=1&pageSize=5',
      '/api/base-data/materials?page=1&pageSize=5',
    ],
  },
  {
    name: '生产过程',
    menuPaths: ['/production/process'],
    gets: [
      '/api/production/processes?page=1&pageSize=5',
      '/api/finance/cost/supplement-reasons',
      '/api/base-data/materials?page=1&pageSize=5',
    ],
  },
  {
    name: '来料检验',
    menuPaths: ['/quality/incoming'],
    gets: [
      '/api/quality/inspections/incoming?page=1&pageSize=5',
      '/api/inventory/stock?page=1&pageSize=5',
      '/api/base-data/materials?page=1&pageSize=5',
      '/api/base-data/suppliers?page=1&pageSize=5',
    ],
  },
  {
    name: '银行账户',
    menuPaths: ['/finance/cash/accounts'],
    gets: [
      '/api/finance/bank-accounts?page=1&pageSize=5',
      '/api/finance/bank-accounts/stats',
      '/api/finance/settings/options',
    ],
  },
  {
    name: '应收发票',
    menuPaths: ['/finance/ar/invoices'],
    gets: [
      '/api/finance/ar/invoices?page=1&pageSize=5',
      '/api/finance/bank-accounts?page=1&pageSize=5',
      '/api/finance/settings',
      '/api/base-data/customers?page=1&pageSize=5',
      '/api/base-data/materials?page=1&pageSize=5',
    ],
  },
  {
    name: '应付发票',
    menuPaths: ['/finance/ap/invoices'],
    gets: [
      '/api/finance/ap/invoices?page=1&pageSize=5',
      '/api/finance/bank-accounts?page=1&pageSize=5',
      '/api/finance/settings',
      '/api/base-data/suppliers?page=1&pageSize=5',
      '/api/base-data/materials?page=1&pageSize=5',
    ],
  },
  {
    name: '物料主数据',
    menuPaths: ['/basedata/materials'],
    gets: [
      '/api/base-data/materials?page=1&pageSize=5',
      '/api/base-data/units?page=1&pageSize=5',
      '/api/common/enums/production_group',
    ],
  },
  {
    name: '用户管理',
    menuPaths: ['/system/users'],
    gets: [
      '/api/system/users?page=1&pageSize=5',
      '/api/system/users/list',
      '/api/system/departments/list',
    ],
  },
  {
    name: '部门管理',
    menuPaths: ['/system/departments'],
    gets: ['/api/system/departments?page=1&pageSize=5'],
  },
];

async function request(token, path) {
  try {
    const res = await axios.get(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000,
      validateStatus: () => true,
    });
    return { path, status: res.status };
  } catch (error) {
    return { path, status: 0 };
  }
}

async function main() {
  const [users] = await pool.query(`
    SELECT u.id, u.token_version, u.force_password_change,
           u.password_changed_at, u.password_expires_at
      FROM users u
     WHERE u.status = 1
       AND EXISTS (
         SELECT 1
           FROM user_roles ur
           JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = u.id AND r.status = 1
       )
       AND NOT EXISTS (
         SELECT 1
           FROM user_roles ur
           JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = u.id AND r.status = 1 AND r.is_super_admin = 1
       )
     ORDER BY u.id
  `);

  const report = [];
  let skippedPasswordLifecycle = 0;
  let usersWithoutMenus = 0;

  for (const user of users) {
    if (PasswordSecurity.isPasswordChangeRequired(user)) {
      skippedPasswordLifecycle += 1;
      continue;
    }

    const token = generateToken(user);
    const [menuRows] = await pool.query(
      `SELECT DISTINCT m.path
         FROM user_roles ur
         JOIN role_menus rm ON rm.role_id = ur.role_id
         JOIN menus m ON m.id = rm.menu_id
        WHERE ur.user_id = ?
          AND m.path IS NOT NULL AND m.path <> ''`,
      [user.id]
    );
    const paths = menuRows.map((row) => String(row.path));
    if (!paths.length) usersWithoutMenus += 1;
    // Warm the same SSOT path used by requirePermission so cache/DB failures are
    // surfaced before HTTP checks, without printing user-identifying data.
    await PermissionService.getUserPermissions(user.id);
    const failures = [];

    for (const suite of PAGE_CHECKS) {
      if (!suite.menuPaths.some((menuPath) => paths.includes(menuPath))) continue;
      for (const getPath of suite.gets) {
        const result = await request(token, getPath);
        if (result.status === 0 || result.status >= 400) {
          failures.push({ suite: suite.name, ...result });
        }
      }
    }

    report.push({
      failed: failures.length,
      failures,
    });
  }

  const broken = report.filter((row) => row.failed > 0);
  const failureSummary = new Map();
  for (const row of broken) {
    for (const failure of row.failures) {
      const key = `${failure.suite}|${failure.path}|${failure.status}`;
      failureSummary.set(key, (failureSummary.get(key) || 0) + 1);
    }
  }
  console.log(JSON.stringify({
    api: API_BASE,
    eligibleUsers: users.length,
    auditedUsers: report.length,
    skippedPasswordLifecycle,
    usersWithoutMenus,
    broken: broken.length,
    failures: [...failureSummary.entries()].map(([key, affectedUsers]) => {
      const [suite, path, status] = key.split('|');
      return { suite, path, status: Number(status), affectedUsers };
    }),
  }, null, 2));
  if (broken.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
