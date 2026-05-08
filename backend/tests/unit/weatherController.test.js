/* global afterEach, describe, expect, jest, test */

jest.mock('axios', () => ({
  get: jest.fn(),
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

const axios = require('axios');
const { getWeather } = require('../../src/controllers/weather/weatherController');

const createResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('weatherController', () => {
  afterEach(() => {
    axios.get.mockReset();
  });

  test('returns unavailable weather without 5xx when upstream weather fetch fails', async () => {
    axios.get.mockRejectedValueOnce(new Error('upstream timeout'));
    const res = createResponse();

    await getWeather({ query: { city: '乐清' } }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: '天气数据暂不可用',
        data: expect.objectContaining({
          city: '乐清',
          weatherCode: 'cloudy',
          isDefault: true,
        }),
      })
    );
  });

  test('returns current weather data when Open-Meteo responds successfully', async () => {
    axios.get.mockResolvedValueOnce({
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

    await getWeather({ query: { city: '乐清' } }, res);

    expect(axios.get).toHaveBeenCalledWith(
      'https://api.open-meteo.com/v1/forecast',
      expect.objectContaining({
        params: expect.objectContaining({
          latitude: 28.1137,
          longitude: 120.9839,
          current: expect.stringContaining('temperature_2m'),
          timezone: 'Asia/Shanghai',
          wind_speed_unit: 'kmh',
        }),
        timeout: 5000,
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          city: '乐清',
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
    axios.get.mockResolvedValueOnce({
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

    expect(axios.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        params: expect.objectContaining({
          latitude: 28.1137,
          longitude: 120.9839,
        }),
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
