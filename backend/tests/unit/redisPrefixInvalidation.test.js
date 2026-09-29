jest.mock('../../src/config/redisClient', () => ({ getRedisClient: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({ logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
const redisCache = require('../../src/services/cache/RedisCacheService');
const cache = require('../../src/services/cache/CacheManager');
const { BasicCommandParser } = require('@redis/client/dist/lib/client/parser');
const del = require('@redis/client/dist/lib/commands/DEL').default;

afterEach(() => { cache.useRedis = false; redisCache.client = null; redisCache.isConnected = false; });

test('invalidates every Redis 5 scan page, skips empty pages and counts actual deletions', async () => {
  const keys = new Set(['user_permissions:11', 'user_permissions:22', 'user_permissions:33', 'other']);
  const client = {
    async *scanIterator() { yield []; yield ['user_permissions:11']; yield []; yield ['user_permissions:22', 'user_permissions:33', 'user_permissions:11']; },
    del: jest.fn(async (...args) => {
      const parser = new BasicCommandParser();
      del.parseCommand(parser, ...args);
      return parser.redisArgs.slice(1).reduce((count, key) => count + Number(keys.delete(key)), 0);
    }),
  };
  redisCache.client = client; redisCache.isConnected = true; cache.useRedis = true;
  expect(await cache.deleteByPrefix('user_permissions:')).toBe(3);
  expect([...keys]).toEqual(['other']);
  expect(client.del).toHaveBeenCalledTimes(2);
});

test('pattern invalidation reports a failed Redis deletion', async () => {
  redisCache.isConnected = true;
  redisCache.client = { async *scanIterator() { yield ['key']; }, del: jest.fn().mockRejectedValue(new Error('unavailable')) };
  expect(await redisCache.delPattern('*')).toBe(false);
});

test('pattern invalidation removes every page through the same scanner', async () => {
  const deleted = [];
  redisCache.isConnected = true;
  redisCache.client = { async *scanIterator() { yield ['a']; yield ['b']; }, del: async keys => { deleted.push(...keys); return keys.length; } };
  expect(await redisCache.delPattern('*')).toBe(true);
  expect(deleted).toEqual(['a', 'b']);
});
