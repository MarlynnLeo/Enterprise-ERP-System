jest.mock('../../src/config/db', () => ({
  pool: { execute: jest.fn(), getConnection: jest.fn() },
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
jest.mock('../../src/models/system', () => ({
  getRoleById: jest.fn(),
  updateRoleStatus: jest.fn(),
  updateUserStatus: jest.fn(),
}));
jest.mock('../../src/services/AuditService', () => ({
  AuditService: { log: jest.fn() },
  AuditAction: {},
  AuditModule: {},
}));
jest.mock('../../src/services/PermissionChangeService', () => ({}));
jest.mock('../../src/services/cache/CacheManager', () => ({}));
jest.mock('../../src/services/business/DLQService', () => ({ markResolved: jest.fn() }));
jest.mock('../../src/services/system/BackupService', () => ({}));
jest.mock('../../src/services/system/AccountLockService', () => ({}));
jest.mock('../../src/services/PermissionService', () => ({
  isAdmin: jest.fn(),
  clearUserPermissionsCache: jest.fn(),
}));
jest.mock('../../src/services/RoleAccessService', () => ({
  applyRole: jest.fn(),
  applyAllProfiles: jest.fn(),
}));
jest.mock('../../src/services/PermissionRegistry', () => ({
  normalizePermissionCode: (code) => code,
  bindMenuPermission: jest.fn(),
  syncRolePermissionsFromMenus: jest.fn(),
}));
jest.mock('../../src/utils/sessionRevocation', () => ({
  disconnectUserSessions: jest.fn(),
  revokeRoleSessionsInTransaction: jest.fn(),
}));

const { pool } = require('../../src/config/db');
const model = require('../../src/models/system');
const PermissionService = require('../../src/services/PermissionService');
const RoleAccessService = require('../../src/services/RoleAccessService');
const registry = require('../../src/services/PermissionRegistry');
const revoke = require('../../src/utils/sessionRevocation');
const controller = require('../../src/controllers/system/systemController');
const DLQService = require('../../src/services/business/DLQService');
let connection;
let res;
const req = (body = {}) => ({ params: { id: '3' }, body, user: { id: 7 }, headers: {} });

beforeEach(() => {
  jest.resetAllMocks();
  res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  connection = {
    execute: jest.fn(),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
  };
  pool.getConnection.mockResolvedValue(connection);
  pool.execute.mockResolvedValue([[{ is_super_admin: 0 }]]);
  PermissionService.isAdmin.mockResolvedValue(true);
  model.getRoleById.mockResolvedValue({ id: 3, code: 'finance', is_super_admin: 0 });
  RoleAccessService.applyRole.mockResolvedValue({ role: 'finance' });
  RoleAccessService.applyAllProfiles.mockResolvedValue([{ role: 'finance' }]);
  revoke.revokeRoleSessionsInTransaction.mockResolvedValue([7, 8]);
});

test('system failed-job resolution returns a business conflict for an unfinished domain event', async () => {
  DLQService.markResolved.mockRejectedValue(
    Object.assign(new Error('关联领域事件尚未完成'), { statusCode: 409 })
  );
  await controller.resolveFailedJob(req(), res);
  expect(res.status).toHaveBeenCalledWith(409);
});

test('system failed-job resolution reports a missing job instead of successful resolution', async () => {
  DLQService.markResolved.mockResolvedValue(false);
  await controller.resolveFailedJob(req(), res);
  expect(res.status).toHaveBeenCalledWith(404);
});

test('system failed-job resolution still reports successful completed jobs', async () => {
  DLQService.markResolved.mockResolvedValue(true);
  await controller.resolveFailedJob(req(), res);
  expect(res.status).toHaveBeenCalledWith(200);
});

test('profile reset revokes authorization within its transaction and sockets after commit', async () => {
  await controller.applyRoleAccessProfile(req(), res);
  expect(revoke.revokeRoleSessionsInTransaction).toHaveBeenCalledWith(connection, [3]);
  expect(revoke.revokeRoleSessionsInTransaction.mock.invocationCallOrder[0]).toBeLessThan(
    connection.commit.mock.invocationCallOrder[0]
  );
  expect(revoke.disconnectUserSessions.mock.invocationCallOrder[0]).toBeGreaterThan(
    connection.commit.mock.invocationCallOrder[0]
  );
  expect(res.status).toHaveBeenCalledWith(200);
});

test('a revocation error rolls back a profile reset without disconnecting sessions', async () => {
  revoke.revokeRoleSessionsInTransaction.mockRejectedValue(new Error('write failed'));
  await controller.applyRoleAccessProfile(req(), res);
  expect(connection.rollback).toHaveBeenCalled();
  expect(connection.commit).not.toHaveBeenCalled();
  expect(revoke.disconnectUserSessions).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(500);
});

test('ordinary permission managers cannot reset every role including protected admin roles', async () => {
  PermissionService.isAdmin.mockResolvedValue(false);
  await controller.applyAllRoleAccessProfiles(req(), res);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(pool.getConnection).not.toHaveBeenCalled();
});

test('bulk profile reset revokes every affected role before commit', async () => {
  connection.execute.mockResolvedValue([[{ id: 3 }, { id: 4 }]]);
  await controller.applyAllRoleAccessProfiles(req(), res);
  expect(revoke.revokeRoleSessionsInTransaction).toHaveBeenCalledWith(connection, [3, 4]);
  expect(res.status).toHaveBeenCalledWith(200);
});

test.each(['disabled', 'inactive', 'locked', false, '0'])(
  'admin user cannot be disabled with status %j',
  async (status) => {
    pool.execute.mockResolvedValue([[{ count: 1 }]]);
    await controller.updateUserStatus(req({ status }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(model.updateUserStatus).not.toHaveBeenCalled();
  }
);

test.each(['disabled', 'inactive', 'locked', false, '0'])(
  'admin role cannot be disabled with status %j',
  async (status) => {
    pool.execute.mockResolvedValue([[{ is_super_admin: 1 }]]);
    await controller.updateRoleStatus(req({ status }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(model.updateRoleStatus).not.toHaveBeenCalled();
  }
);

test('ordinary permission manager cannot reactivate a protected super-admin role', async () => {
  pool.execute.mockResolvedValue([[{ is_super_admin: 1 }]]);
  PermissionService.isAdmin.mockResolvedValue(false);
  await controller.updateRoleStatus(req({ status: 1 }), res);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(model.updateRoleStatus).not.toHaveBeenCalled();
});

test('menu import refreshes affected role grants and revokes sessions in the same transaction', async () => {
  connection.execute.mockImplementation(async (sql) => {
    if (sql.includes('SELECT id, permission FROM menus'))
      return [[{ id: 10, permission: 'finance:ar:view' }]];
    if (sql.includes('SELECT DISTINCT role_id')) return [[{ role_id: 3 }]];
    if (sql.includes('SELECT menu_id')) return [[{ menu_id: 10 }]];
    return [{ affectedRows: 1 }];
  });
  await controller.importMenus(
    req({ menus: [{ id: 10, name: '应收', permission: 'finance:ar:view', status: 0 }] }),
    res
  );
  expect(registry.syncRolePermissionsFromMenus).toHaveBeenCalledWith(connection, 3, [10]);
  expect(revoke.revokeRoleSessionsInTransaction).toHaveBeenCalledWith(connection, [3]);
  expect(registry.syncRolePermissionsFromMenus.mock.invocationCallOrder[0]).toBeLessThan(
    connection.commit.mock.invocationCallOrder[0]
  );
  expect(revoke.disconnectUserSessions).toHaveBeenCalledWith([7, 8], 'menus_imported');
  expect(res.status).toHaveBeenCalledWith(200);
});
