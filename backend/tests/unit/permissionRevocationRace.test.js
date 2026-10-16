jest.mock('../../src/config/db', () => ({ pool: { execute: jest.fn() } }));
jest.mock('../../src/services/cache/CacheManager', () => ({
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  deleteByPrefix: jest.fn(),
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const { pool } = require('../../src/config/db');
const cache = require('../../src/services/cache/CacheManager');
const PermissionService = require('../../src/services/PermissionService');

beforeEach(() => jest.resetAllMocks());

test('a pre-revocation read cannot refill the grants used by a new login', async () => {
  const values = new Map();
  cache.get.mockImplementation(async (key) => values.get(key) ?? null);
  cache.set.mockImplementation(async (key, value) => values.set(key, value));
  // Simulate failed/disconnected cache invalidation: old entries remain present.
  cache.delete.mockResolvedValue(false);
  cache.deleteByPrefix.mockResolvedValue(0);
  let version = 3;
  let admin = true;
  let releaseOldRead;
  let oldReadStarted;
  const started = new Promise((resolve) => {
    oldReadStarted = resolve;
  });
  pool.execute.mockImplementation(async (sql) => {
    if (sql.includes('SELECT status, token_version'))
      return [[{ status: 1, token_version: version }]];
    if (sql.includes('COUNT(*)')) {
      if (admin) {
        oldReadStarted();
        return new Promise((resolve) => {
          releaseOldRead = () => resolve([[{ count: 1 }]]);
        });
      }
      return [[{ count: 0 }]];
    }
    if (sql.includes('SELECT r.id')) return [[{ id: 4, code: 'reader' }]];
    if (sql.includes('role_permissions')) return [[{ role_id: 4, permission: 'finance:ar:view' }]];
    throw new Error(`Unexpected query: ${sql}`);
  });
  const inFlight = PermissionService.getUserPermissions(7);
  await started;
  version = 4;
  admin = false;
  await PermissionService.clearUserPermissionsCache(7);
  releaseOldRead();
  expect(await inFlight).toEqual(['*']);
  expect(values.get('user_permissions:7:v3')).toEqual(['*']);
  expect(await PermissionService.getUserPermissions(7)).toEqual(['finance:ar:view']);
  expect(values.get('user_permissions:7:v4')).toEqual(['finance:ar:view']);
});

test.each([null, { status: 0, token_version: 3 }, { status: 1, token_version: -1 }])(
  'a missing, disabled or invalid-version account cannot read cached permissions: %j',
  async (user) => {
    pool.execute.mockResolvedValue([user ? [user] : []]);
    expect(await PermissionService.getUserPermissions(7)).toEqual([]);
    expect(cache.get).not.toHaveBeenCalled();
  }
);

test('callers cannot mutate a cached grant array', async () => {
  pool.execute.mockResolvedValue([[{ status: 1, token_version: 4 }]]);
  const grants = ['finance:ar:view'];
  cache.get.mockResolvedValue(grants);
  const loaded = await PermissionService.getUserPermissions(7);
  loaded.push('*');
  expect(grants).toEqual(['finance:ar:view']);
});
