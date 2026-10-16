jest.mock('../../src/config/db', () => ({ pool: { execute: jest.fn() } }));
jest.mock('../../src/services/cache/CacheManager', () => ({}));
jest.mock('../../src/utils/logger', () => ({ logger: { warn: jest.fn() } }));
const { pool } = require('../../src/config/db');
const PermissionService = require('../../src/services/PermissionService');

function grants(roles, permissions) {
  pool.execute.mockReset();
  pool.execute.mockResolvedValueOnce([roles]);
  pool.execute.mockResolvedValueOnce([permissions]);
  return PermissionService.getUserRolePermissions(7);
}

test('managed roles cannot use drifted inventory finance grants observed in the configuration audit', async () => {
  const permissions = await grants(
    [{ id: 2, code: 'employee' }],
    [
      { role_id: 2, permission: 'dashboard' },
      { role_id: 2, permission: 'finance:inventory:view' },
      { role_id: 2, permission: 'finance:inventory:approve' },
      { role_id: 2, permission: 'finance:inventory:reverse' },
    ]
  );
  expect(permissions).toEqual(['dashboard']);
});

test('the permission union keeps grants from each permitted role without a lower role masking a higher one', async () => {
  const permissions = await grants(
    [
      { id: 2, code: 'accountant' },
      { id: 3, code: 'finance_manager' },
    ],
    [
      { role_id: 2, permission: 'finance:entries:approve' },
      { role_id: 2, permission: 'finance:ar:view' },
      { role_id: 2, permission: 'system:users:update' },
      { role_id: 3, permission: 'finance:entries:approve' },
      { role_id: 3, permission: 'finance:closing:execute' },
    ]
  );
  expect(permissions).toEqual(
    expect.arrayContaining([
      'finance:ar:view',
      'finance:entries:approve',
      'finance:closing:execute',
    ])
  );
  expect(permissions).not.toContain('system:users:update');
});

test('unknown custom roles retain explicitly assigned grants alongside managed roles', async () => {
  const permissions = await grants(
    [
      { id: 2, code: 'employee' },
      { id: 9, code: 'custom-auditor' },
    ],
    [
      { role_id: 2, permission: 'finance:ar:view' },
      { role_id: 9, permission: 'system:logs' },
      { role_id: 9, permission: 'finance:reports:*' },
    ]
  );
  expect(permissions).toEqual(['system:logs', 'finance:reports:*']);
});

test('managed profile equivalents retain their legacy route spelling and action level', async () => {
  const permissions = await grants(
    [{ id: 2, code: 'production_planner' }],
    [
      { role_id: 2, permission: 'production:routes:view' },
      { role_id: 2, permission: 'basedata:bom:view' },
    ]
  );
  expect(permissions).toEqual(
    expect.arrayContaining([
      'production:routes:view',
      'basedata:processtemplates:view',
      'basedata:boms:view',
    ])
  );
  expect(permissions).not.toContain('basedata:processtemplates:update');
});

test('a managed wildcard or action alias cannot bypass an explicitly denied approval', async () => {
  const permissions = await grants(
    [
      { id: 2, code: 'accountant' },
      { id: 3, code: 'salesperson' },
    ],
    [
      { role_id: 2, permission: 'finance:entries:*' },
      { role_id: 2, permission: 'finance:entries:approve' },
      { role_id: 3, permission: 'sales:exchanges:approve' },
    ]
  );
  expect(permissions).toEqual([]);
});

test('an unbound permission row cannot be treated as an unrestricted custom role', async () => {
  expect(
    await grants(
      [{ id: 2, code: 'employee' }],
      [{ role_id: 999, permission: 'system:users:update' }]
    )
  ).toEqual([]);
});
