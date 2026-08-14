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
      data: {
        result: 'success',
        rates: { CNY: 6.76 },
        time_last_update_utc: 'Fri, 14 Aug 2026',
      },
    });
    const r = await PublicMarketDataService.fetchExchangeRate('USD', 'CNY');
    expect(r.rate).toBe(6.76);
    expect(r.source).toContain('er-api');
  });

  test('fetchExchangeRate 首源失败切换下一源', async () => {
    httpGet
      .mockRejectedValueOnce(new Error('er-api down'))
      .mockResolvedValueOnce({
        status: 200,
        data: { amount: 1, base: 'USD', date: '2026-08-13', rates: { CNY: 6.74 } },
      });
    const r = await PublicMarketDataService.fetchExchangeRate('USD', 'CNY');
    expect(r.rate).toBe(6.74);
    expect(r.source).toContain('frankfurter');
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

  test('fetchMetalPricesCny 金/银走现货、铝/铜走 Yahoo', async () => {
    httpGet
      .mockResolvedValueOnce({
        status: 200,
        data: { price: 4345, currency: 'USD', symbol: 'XAU' },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: { price: 64.7, currency: 'USD', symbol: 'XAG' },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: { chart: { result: [{ meta: { regularMarketPrice: 2500, currency: 'USD' } }] } },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: { chart: { result: [{ meta: { regularMarketPrice: 4.5, currency: 'USD' } }] } },
      });

    const metals = await PublicMarketDataService.fetchMetalPricesCny(6.76);
    expect(metals.GOLD.price).toBeCloseTo(4345 * 6.76, 0);
    expect(metals.SILVER.price).toBeCloseTo(64.7 * 6.76, 0);
    expect(metals.COPPER.price).toBeGreaterThan(1000);
    expect(metals.GOLD.source).toContain('gold-api');
    expect(metals.SILVER.source).toContain('gold-api');
  });

  test('fetchMetalPricesCny 拒绝过期金价后回退 Yahoo', async () => {
    httpGet
      .mockResolvedValueOnce({
        status: 200,
        data: { price: 2050, currency: 'USD', symbol: 'XAU' },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: { chart: { result: [{ meta: { regularMarketPrice: 4400, currency: 'USD' } }] } },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: { price: 64.7, currency: 'USD', symbol: 'XAG' },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: { chart: { result: [{ meta: { regularMarketPrice: 2500, currency: 'USD' } }] } },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: { chart: { result: [{ meta: { regularMarketPrice: 4.5, currency: 'USD' } }] } },
      });

    const metals = await PublicMarketDataService.fetchMetalPricesCny(6.76);
    expect(metals.GOLD.usdPrice).toBe(4400);
    expect(metals.GOLD.source).toContain('yahoo');
  });
});
