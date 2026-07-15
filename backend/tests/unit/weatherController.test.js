/* global afterEach, describe, expect, jest, test */

jest.mock('../../src/utils/logger', () => {
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  return Object.assign(logger, { logger });
});

jest.mock('../../src/services/external/PublicMarketDataService', () => ({
  fetchOpenMeteoCurrent: jest.fn(),
  fetchWttrIn: jest.fn(),
}));

process.env.OPEN_METEO_BASE_URL = 'https://api.open-meteo.com/v1/forecast';
process.env.OPEN_METEO_TIMEOUT_MS = '5000';
process.env.OPEN_METEO_TIMEZONE = 'Asia/Shanghai';
process.env.OPEN_METEO_RETRIES = '1';
process.env.WEATHER_ENABLE_WTTR_FALLBACK = 'true';

const PublicMarketDataService = require('../../src/services/external/PublicMarketDataService');
const { logger } = require('../../src/utils/logger');
const { getWeather } = require('../../src/controllers/weather/weatherController');

const createResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('weatherController', () => {
  afterEach(() => {
    PublicMarketDataService.fetchOpenMeteoCurrent.mockReset();
    PublicMarketDataService.fetchWttrIn.mockReset();
    logger.info.mockReset();
    logger.warn.mockReset();
    logger.error.mockReset();
    logger.debug.mockReset();
  });

  test('Open-Meteo 成功时返回实时天气', async () => {
    PublicMarketDataService.fetchOpenMeteoCurrent.mockResolvedValueOnce({
      data: {
        current: {
          temperature_2m: 26.4,
          apparent_temperature: 28,
          weather_code: 0,
          wind_speed_10m: 12,
          wind_direction_10m: 90,
          relative_humidity_2m: 70,
          surface_pressure: 1012,
          visibility: 10000,
          time: '2026-07-10T12:00',
        },
      },
      source: 'open-meteo',
    });
    const res = createResponse();
    await getWeather({ query: { city: '温州' } }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          city: '温州',
          temperature: '26',
          description: '晴',
          isDefault: false,
          source: 'open-meteo',
        }),
      })
    );
  });

  test('Open-Meteo 失败时降级 wttr.in', async () => {
    PublicMarketDataService.fetchOpenMeteoCurrent.mockRejectedValueOnce(new Error('timeout'));
    PublicMarketDataService.fetchWttrIn.mockResolvedValueOnce({
      temperature: 25,
      feelsLike: 26,
      description: '多云',
      humidity: 80,
      windSpeed: 10,
      windDir: 'NE',
      pressure: 1010,
      visibility: 8,
    });
    const res = createResponse();
    // 使用新城市避免命中成功缓存
    await getWeather({ query: { city: '北京' } }, res);

    expect(PublicMarketDataService.fetchWttrIn).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          city: '北京',
          temperature: '25',
          source: 'wttr.in',
          isDefault: false,
        }),
      })
    );
  });

  test('全部源失败时返回默认天气且 200', async () => {
    PublicMarketDataService.fetchOpenMeteoCurrent.mockRejectedValueOnce(new Error('down'));
    PublicMarketDataService.fetchWttrIn.mockRejectedValueOnce(new Error('down2'));
    const res = createResponse();
    await getWeather({ query: { city: '杭州' } }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: '天气数据暂不可用',
        data: expect.objectContaining({
          city: '杭州',
          isDefault: true,
        }),
      })
    );
  });
});
