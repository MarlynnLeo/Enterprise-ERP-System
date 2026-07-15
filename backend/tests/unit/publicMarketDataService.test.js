/**
 * PublicMarketDataService 多源故障转移单测
 */

jest.mock('../../src/utils/httpClient', () => ({
  httpGet: jest.fn(),
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const { httpGet } = require('../../src/utils/httpClient');
const PublicMarketDataService = require('../../src/services/external/PublicMarketDataService');

describe('PublicMarketDataService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('fetchExchangeRate 首源成功', async () => {
    httpGet.mockResolvedValueOnce({
      status: 200,
      data: { amount: 1, base: 'USD', date: '2026-07-09', rates: { CNY: 6.8 } },
    });
    const r = await PublicMarketDataService.fetchExchangeRate('USD', 'CNY');
    expect(r.rate).toBe(6.8);
    expect(r.source).toContain('frankfurter');
  });

  test('fetchExchangeRate 首源失败切换下一源', async () => {
    httpGet
      .mockRejectedValueOnce(new Error('frankfurter down'))
      .mockResolvedValueOnce({
        status: 200,
        data: {
          result: 'success',
          rates: { CNY: 7.1 },
          time_last_update_utc: 'Thu, 09 Jul 2026',
        },
      });
    const r = await PublicMarketDataService.fetchExchangeRate('USD', 'CNY');
    expect(r.rate).toBe(7.1);
    expect(r.source).toContain('er-api');
  });

  test('fetchOpenMeteoCurrent 返回 current', async () => {
    httpGet.mockResolvedValueOnce({
      status: 200,
      data: { current: { temperature_2m: 20, weather_code: 1 } },
    });
    const r = await PublicMarketDataService.fetchOpenMeteoCurrent({
      latitude: 30,
      longitude: 120,
    });
    expect(r.data.current.temperature_2m).toBe(20);
  });

  test('fetchMetalPricesCny 解析 Yahoo 报价（金/银/铝/铜）', async () => {
    httpGet
      .mockResolvedValueOnce({
        status: 200,
        data: { chart: { result: [{ meta: { regularMarketPrice: 2000, currency: 'USD' } }] } },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: { chart: { result: [{ meta: { regularMarketPrice: 30, currency: 'USD' } }] } },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: { chart: { result: [{ meta: { regularMarketPrice: 2500, currency: 'USD' } }] } },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: { chart: { result: [{ meta: { regularMarketPrice: 4.5, currency: 'USD' } }] } },
      });

    const metals = await PublicMarketDataService.fetchMetalPricesCny(7);
    expect(metals.GOLD.price).toBeCloseTo(14000, 0);
    expect(metals.SILVER.price).toBeCloseTo(210, 0);
    expect(metals.COPPER.price).toBeGreaterThan(1000);
    expect(metals.GOLD.source).toContain('yahoo');
    expect(metals.SILVER.source).toContain('SI=F');
  });
});
