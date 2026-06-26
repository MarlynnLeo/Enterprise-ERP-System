/**
 * cacheManager.test.js
 * @description 内存缓存管理器单元测试
 */

const cache = require('../../src/utils/cacheManager');

describe('CacheManager', () => {
  beforeEach(() => {
    cache.clear();
  });

  describe('get / set', () => {
    test('应正确存取值', () => {
      cache.set('key1', { name: '物料A' }, 60);
      expect(cache.get('key1')).toEqual({ name: '物料A' });
    });

    test('未设置的 key 应返回 null', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    test('过期后应返回 null', async () => {
      cache.set('expire-key', 'value', 0.05); // 50ms TTL
      expect(cache.get('expire-key')).toBe('value');

      await new Promise((r) => setTimeout(r, 80));
      expect(cache.get('expire-key')).toBeNull();
    });

    test('默认 TTL 为 60 秒', () => {
      cache.set('default-ttl', 'val');
      const entry = cache._store.get('default-ttl');
      const expectedExpiry = Date.now() + 60 * 1000;
      // 允许 100ms 误差
      expect(entry.expiresAt).toBeGreaterThan(expectedExpiry - 100);
      expect(entry.expiresAt).toBeLessThan(expectedExpiry + 100);
    });
  });

  describe('getOrSet', () => {
    test('缓存未命中时应调用 fetchFn', async () => {
      const fetchFn = jest.fn().mockResolvedValue({ id: 1, rate: 7.2 });
      const result = await cache.getOrSet('rate:USD:CNY', fetchFn, 300);

      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ id: 1, rate: 7.2 });
    });

    test('缓存命中时不应调用 fetchFn', async () => {
      cache.set('rate:USD:CNY', { id: 1, rate: 7.2 }, 300);
      const fetchFn = jest.fn();
      const result = await cache.getOrSet('rate:USD:CNY', fetchFn, 300);

      expect(fetchFn).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 1, rate: 7.2 });
    });
  });

  describe('invalidate', () => {
    test('应删除指定 key', () => {
      cache.set('del-key', 'value');
      cache.invalidate('del-key');
      expect(cache.get('del-key')).toBeNull();
    });
  });

  describe('invalidatePrefix', () => {
    test('应按前缀批量删除', () => {
      cache.set('rate:USD:CNY', 7.2);
      cache.set('rate:EUR:CNY', 7.8);
      cache.set('material:list', []);

      const count = cache.invalidatePrefix('rate:');
      expect(count).toBe(2);
      expect(cache.get('rate:USD:CNY')).toBeNull();
      expect(cache.get('rate:EUR:CNY')).toBeNull();
      expect(cache.get('material:list')).toEqual([]);
    });
  });

  describe('stats', () => {
    test('应正确统计命中率', () => {
      cache.set('hit-key', 'value');
      cache.get('hit-key'); // hit
      cache.get('hit-key'); // hit
      cache.get('miss-key'); // miss

      const stats = cache.stats();
      expect(stats.size).toBe(1);
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe('66.7%');
    });
  });

  describe('clear', () => {
    test('应清空所有缓存和统计', () => {
      cache.set('k1', 'v1');
      cache.set('k2', 'v2');
      cache.get('k1');

      cache.clear();
      const stats = cache.stats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });
});
