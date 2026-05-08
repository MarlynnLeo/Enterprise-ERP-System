/**
 * 天气控制器
 * @description 提供天气数据查询服务（使用 Open-Meteo API）
 */

const axios = require('axios');
const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');

const OPEN_METEO_CONFIG = {
  baseUrl: 'https://api.open-meteo.com/v1/forecast',
  timeout: 5000,
  timezone: 'Asia/Shanghai',
};

const DEFAULT_CITY = '乐清';

const CITY_COORDINATE_MAP = {
  乐清: { name: '乐清', latitude: 28.1137, longitude: 120.9839 },
  温州: { name: '温州', latitude: 27.9938, longitude: 120.6994 },
  杭州: { name: '杭州', latitude: 30.2741, longitude: 120.1551 },
  上海: { name: '上海', latitude: 31.2304, longitude: 121.4737 },
  北京: { name: '北京', latitude: 39.9042, longitude: 116.4074 },
};

const WMO_WEATHER_MAP = {
  0: { description: '晴', weatherCode: 'sunny' },
  1: { description: '大部晴朗', weatherCode: 'sunny' },
  2: { description: '局部多云', weatherCode: 'partly-cloudy' },
  3: { description: '阴', weatherCode: 'cloudy' },
  45: { description: '雾', weatherCode: 'cloudy' },
  48: { description: '雾凇', weatherCode: 'cloudy' },
  51: { description: '小毛毛雨', weatherCode: 'rainy' },
  53: { description: '中等毛毛雨', weatherCode: 'rainy' },
  55: { description: '大毛毛雨', weatherCode: 'rainy' },
  56: { description: '冻毛毛雨', weatherCode: 'rainy' },
  57: { description: '强冻毛毛雨', weatherCode: 'rainy' },
  61: { description: '小雨', weatherCode: 'rainy' },
  63: { description: '中雨', weatherCode: 'rainy' },
  65: { description: '大雨', weatherCode: 'rainy' },
  66: { description: '冻雨', weatherCode: 'rainy' },
  67: { description: '强冻雨', weatherCode: 'rainy' },
  71: { description: '小雪', weatherCode: 'cloudy' },
  73: { description: '中雪', weatherCode: 'cloudy' },
  75: { description: '大雪', weatherCode: 'cloudy' },
  77: { description: '雪粒', weatherCode: 'cloudy' },
  80: { description: '小阵雨', weatherCode: 'rainy' },
  81: { description: '中阵雨', weatherCode: 'rainy' },
  82: { description: '强阵雨', weatherCode: 'rainy' },
  85: { description: '小阵雪', weatherCode: 'cloudy' },
  86: { description: '强阵雪', weatherCode: 'cloudy' },
  95: { description: '雷暴', weatherCode: 'rainy' },
  96: { description: '雷暴伴小冰雹', weatherCode: 'rainy' },
  99: { description: '雷暴伴强冰雹', weatherCode: 'rainy' },
};

const createUnavailableWeather = (city = DEFAULT_CITY) => ({
  city,
  temperature: '--',
  feelsLike: '--',
  description: '天气暂不可用',
  weatherCode: 'cloudy',
  windSpeed: '--',
  windDir: '--',
  humidity: '--',
  pressure: '-',
  visibility: '-',
  updateTime: '',
  isDefault: true,
});

const getCityLocation = (city) => CITY_COORDINATE_MAP[city] || CITY_COORDINATE_MAP[DEFAULT_CITY];

const formatNumber = (value) => {
  if (value === null || value === undefined || value === '') return '--';
  return Number.isFinite(Number(value)) ? String(Math.round(Number(value))) : String(value);
};

const formatVisibility = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  const visibilityInKm = Number(value) / 1000;
  return Number.isFinite(visibilityInKm) ? visibilityInKm.toFixed(1) : '-';
};

const formatUpdateTime = (time) => {
  if (!time || typeof time !== 'string') return '';
  const [, clock = time] = time.split('T');
  return clock.substring(0, 5);
};

const formatWindDirection = (degrees) => {
  if (!Number.isFinite(Number(degrees))) return '--';

  const directions = ['北风', '东北风', '东风', '东南风', '南风', '西南风', '西风', '西北风'];
  const index = Math.round(Number(degrees) / 45) % directions.length;
  return directions[index];
};

const mapWeatherCode = (weatherCode) => WMO_WEATHER_MAP[Number(weatherCode)] || {
  description: '未知',
  weatherCode: 'cloudy',
};

/**
 * 获取天气数据
 */
const getWeather = async (req, res) => {
  const { city = DEFAULT_CITY } = req.query;
  const location = getCityLocation(city);

  try {
    const weatherResponse = await axios.get(OPEN_METEO_CONFIG.baseUrl, {
      params: {
        latitude: location.latitude,
        longitude: location.longitude,
        current: [
          'temperature_2m',
          'relative_humidity_2m',
          'apparent_temperature',
          'weather_code',
          'wind_speed_10m',
          'wind_direction_10m',
          'surface_pressure',
          'visibility',
        ].join(','),
        timezone: OPEN_METEO_CONFIG.timezone,
        wind_speed_unit: 'kmh',
      },
      timeout: OPEN_METEO_CONFIG.timeout,
    });

    const current = weatherResponse.data?.current;
    if (!current) {
      throw new Error('Open-Meteo API 未返回 current 天气数据');
    }

    const weatherType = mapWeatherCode(current.weather_code);
    const weatherData = {
      city: location.name,
      temperature: formatNumber(current.temperature_2m),
      feelsLike: formatNumber(current.apparent_temperature),
      description: weatherType.description,
      weatherCode: weatherType.weatherCode,
      windSpeed: formatNumber(current.wind_speed_10m),
      windDir: formatWindDirection(current.wind_direction_10m),
      humidity: formatNumber(current.relative_humidity_2m),
      pressure: formatNumber(current.surface_pressure),
      visibility: formatVisibility(current.visibility),
      updateTime: formatUpdateTime(current.time),
      isDefault: false,
    };

    logger.debug('天气数据获取成功', { city: weatherData.city, temperature: weatherData.temperature });
    return ResponseHandler.success(res, weatherData);
  } catch (error) {
    logger.error('获取天气数据失败:', error);
    return ResponseHandler.success(res, createUnavailableWeather(location.name), '天气数据暂不可用');
  }
};

module.exports = {
  getWeather,
};
