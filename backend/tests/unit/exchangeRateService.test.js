/**
 * ExchangeRateService 单元测试
 * @description 测试汇率 Service 层的核心逻辑（参数校验、SQL 调用委托）
 */

const ExchangeRateService = require('../../src/services/business/ExchangeRateService');

// Mock 依赖
jest.mock('../../src/config/db', () => ({
  pool: {
    query: jest.fn(),
  },
}));
jest.mock('../../src/utils/softDelete', () => ({
  softDelete: jest.fn(),
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { pool } = require('../../src/config/db');
const { softDelete } = require('../../src/utils/softDelete');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ExchangeRateService', () => {
  describe('getList', () => {
    test('should return paginated results with default pagination', async () => {
      pool.query
        .mockResolvedValueOnce([[{ total: 2 }]]) // count query
        .mockResolvedValueOnce([
          [
            { id: 1, from_currency: 'USD', to_currency: 'CNY', rate: 7.25 },
            { id: 2, from_currency: 'EUR', to_currency: 'CNY', rate: 7.85 },
          ],
        ]); // list query

      const result = await ExchangeRateService.getList({});
      expect(result.total).toBe(2);
      expect(result.rows).toHaveLength(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(50);
      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    test('should filter by from_currency when provided', async () => {
      pool.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[{ id: 1, from_currency: 'USD' }]]);

      await ExchangeRateService.getList({ from_currency: 'USD' });
      // Verify the count query includes the filter
      const countCall = pool.query.mock.calls[0];
      expect(countCall[0]).toContain('from_currency = ?');
      expect(countCall[1]).toContain('USD');
    });
  });

  describe('upsert', () => {
    test('should throw on missing from_currency', async () => {
      await expect(
        ExchangeRateService.upsert({ rate: 7.25, effective_date: '2026-01-01' }, 1)
      ).rejects.toThrow('from_currency');
    });

    test('should throw on non-positive rate', async () => {
      await expect(
        ExchangeRateService.upsert(
          { from_currency: 'USD', rate: -1, effective_date: '2026-01-01' },
          1
        )
      ).rejects.toThrow('positive rate');
    });

    test('should throw on missing effective_date', async () => {
      await expect(
        ExchangeRateService.upsert({ from_currency: 'USD', rate: 7.25 }, 1)
      ).rejects.toThrow('effective_date');
    });

    test('should uppercase currency codes', async () => {
      pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      await ExchangeRateService.upsert(
        { from_currency: 'usd', to_currency: 'cny', rate: 7.25, effective_date: '2026-01-01' },
        1
      );
      const args = pool.query.mock.calls[0][1];
      expect(args[0]).toBe('USD');
      expect(args[1]).toBe('CNY');
    });

    test('should default to_currency to CNY', async () => {
      pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      await ExchangeRateService.upsert(
        { from_currency: 'USD', rate: 7.25, effective_date: '2026-01-01' },
        1
      );
      const args = pool.query.mock.calls[0][1];
      expect(args[1]).toBe('CNY');
    });
  });

  describe('delete', () => {
    test('should delegate to softDelete', async () => {
      softDelete.mockResolvedValueOnce(undefined);
      await ExchangeRateService.delete(42);
      expect(softDelete).toHaveBeenCalledWith(pool, 'exchange_rates', 'id', 42);
    });
  });

  describe('getLatestRate', () => {
    test('should throw on missing from currency', async () => {
      await expect(ExchangeRateService.getLatestRate(null)).rejects.toThrow('from currency');
    });

    test('should return null when no rate found', async () => {
      pool.query.mockResolvedValueOnce([[undefined]]);
      const result = await ExchangeRateService.getLatestRate('JPY');
      expect(result).toBeNull();
    });

    test('should return the rate row when found', async () => {
      const row = { id: 1, from_currency: 'USD', to_currency: 'CNY', rate: 7.25 };
      pool.query.mockResolvedValueOnce([[[row]]]);
      // Note: pool.query returns [[row]] for destructured [[row]]
      pool.query.mockReset();
      pool.query.mockResolvedValueOnce([[row]]);
      const result = await ExchangeRateService.getLatestRate('USD', 'CNY');
      expect(result).toEqual(row);
    });
  });
});
