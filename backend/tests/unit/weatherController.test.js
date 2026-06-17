/* global afterEach, describe, expect, jest, test */

jest.mock('../../src/utils/httpClient', () => ({
  httpGet: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => {
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  return Object.assign(logger, { logger });
});

const { httpGet } = require('../../src/utils/httpClient');
const { logger } = require('../../src/utils/logger');

process.env.OPEN_METEO_BASE_URL = 'https://api.open-meteo.com/v1/forecast';
process.env.OPEN_METEO_TIMEOUT_MS = '5000';
process.env.OPEN_METEO_TIMEZONE = 'Asia/Shanghai';
process.env.OPEN_METEO_RETRIES = '1';

const { getWeather } = require('../../src/controllers/weather/weatherController');

const createResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('weatherController', () => {
  afterEach(() => {
    httpGet.mockReset();
    logger.info.mockReset();
    logger.warn.mockReset();
    logger.error.mockReset();
    logger.debug.mockReset();
  });

  test('returns unavailable weather without 5xx when upstream weather fetch fails', async () => {
    const error = new Error('Client network socket disconnected before secure TLS connection was established');
    error.code = 'ECONNRESET';
    httpGet.mockRejectedValueOnce(error);
    const res = createResponse();

    await getWeather({ query: { city: '温州' } }, res);

    expect(httpGet).toHaveBeenCalledWith(
      'https://api.open-meteo.com/v1/forecast',
      expect.objectContaining({
        params: expect.objectContaining({
          latitude: 27.9938,
          longitude: 120.6994,
          current: expect.stringContaining('temperature_2m'),
          timezone: 'Asia/Shanghai',
          wind_speed_unit: 'kmh',
        }),
        timeout: 5000,
        retries: 1,
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: '天气数据暂不可用',
        data: expect.objectContaining({
          city: '温州',
          weatherCode: 'cloudy',
          isDefault: true,
        }),
      })
    );
    expect(logger.warn).toHaveBeenCalledWith(
      '天气服务暂不可用，已返回默认天气',
      expect.objectContaining({
        city: '温州',
        code: 'ECONNRESET',
      })
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  test('returns current weather data when Open-Meteo responds successfully', async () => {
    httpGet.mockResolvedValueOnce({
      status: 200,
      data: {
        current: {
          time: '2026-05-06T14:30',
          temperature_2m: 22.3,
          relative_humidity_2m: 65,
          apparent_temperature: 23.1,
          weather_code: 0,
          wind_speed_10m: 12.4,
          wind_direction_10m: 90,
          surface_pressure: 1012.8,
          visibility: 24000,
        },
      },
    });
    const res = createResponse();

    await getWeather({ query: { city: '上海' } }, res);

    expect(httpGet).toHaveBeenCalledWith(
      'https://api.open-meteo.com/v1/forecast',
      expect.objectContaining({
        params: expect.objectContaining({
          latitude: 31.2304,
          longitude: 121.4737,
          current: expect.stringContaining('temperature_2m'),
          timezone: 'Asia/Shanghai',
          wind_speed_unit: 'kmh',
        }),
        timeout: 5000,
        retries: 1,
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          city: '上海',
          temperature: '22',
          feelsLike: '23',
          description: '晴',
          weatherCode: 'sunny',
          windSpeed: '12',
          windDir: '东风',
          humidity: '65',
          pressure: '1013',
          visibility: '24.0',
          updateTime: '14:30',
          isDefault: false,
        }),
      })
    );
  });

  test('falls back to default city coordinates for unsupported city names', async () => {
    httpGet.mockResolvedValueOnce({
      status: 200,
      data: {
        current: {
          time: '2026-05-06T09:15',
          temperature_2m: 18,
          relative_humidity_2m: 80,
          apparent_temperature: 17,
          weather_code: 61,
          wind_speed_10m: 5,
          wind_direction_10m: 180,
          surface_pressure: 1005,
          visibility: 8000,
        },
      },
    });
    const res = createResponse();

    await getWeather({ query: { city: '不存在的城市' } }, res);

    expect(httpGet).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        params: expect.objectContaining({
          latitude: 28.1137,
          longitude: 120.9839,
        }),
        retries: 1,
      })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          city: '乐清',
          description: '小雨',
          weatherCode: 'rainy',
        }),
      })
    );
  });
});
