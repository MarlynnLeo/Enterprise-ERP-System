/**
 * 天气控制器
 * @description 提供天气数据查询服务（使用高德地图API）
 * @author 系统
 * @date 2025-11-29
 */

const axios = require('axios');
const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');

// 高德地图天气API配置
const AMAP_CONFIG = {
  key: process.env.AMAP_API_KEY || '',
  baseUrl: 'https://restapi.amap.com/v3/weather/weatherInfo',
  timeout: 5000,
};

// 城市adcode映射（高德使用行政区划代码）
// 查询地址: https://lbs.amap.com/api/webservice/download
const CITY_ADCODE_MAP = {
  乐清: '330382',
  温州: '330300',
  杭州: '330100',
  上海: '310000',
  北京: '110000',
};

/**
 * 获取天气数据
 */
const getWeather = async (req, res) => {
  try {
    const { city = '乐清' } = req.query;

    // 检查API密钥是否配置
    if (!AMAP_CONFIG.key) {
      logger.warn('高德地图API密钥未配置，天气服务不可用');
      return ResponseHandler.error(
        res,
        '天气服务未配置，请维护 AMAP_API_KEY',
        'WEATHER_CONFIG_MISSING',
        503
      );
    }

    // 获取城市adcode
    const adcode = CITY_ADCODE_MAP[city] || CITY_ADCODE_MAP['乐清'];

    // 调用高德天气API - 实时天气
    const weatherResponse = await axios.get(AMAP_CONFIG.baseUrl, {
      params: {
        city: adcode,
        key: AMAP_CONFIG.key,
        extensions: 'base', // base返回实况，all返回预报
      },
      timeout: AMAP_CONFIG.timeout,
    });

    if (weatherResponse.data.status !== '1') {
      throw new Error(`高德天气API返回错误: ${weatherResponse.data.info}`);
    }

    const live = weatherResponse.data.lives[0];

    // 映射天气描述到天气类型
    const weatherType = mapWeatherType(live.weather);

    const weatherData = {
      city: live.city,
      temperature: live.temperature,
      feelsLike: live.temperature, // 高德API没有体感温度，用实际温度代替
      description: live.weather,
      weatherCode: weatherType,
      windSpeed: live.windpower,
      windDir: live.winddirection + '风',
      humidity: live.humidity,
      pressure: '-',
      visibility: '-',
      updateTime: live.reporttime.split(' ')[1].substring(0, 5),
      isDefault: false,
    };

    logger.debug('天气数据获取成功', { city: live.city, temperature: live.temperature });
    return ResponseHandler.success(res, weatherData);
  } catch (error) {
    logger.error('获取天气数据失败:', error);
    return ResponseHandler.error(
      res,
      '天气数据获取失败，请稍后重试',
      'WEATHER_FETCH_FAILED',
      502,
      error
    );
  }
};

/**
 * 映射高德天气描述到天气类型
 */
const mapWeatherType = (weather) => {
  if (!weather) return 'cloudy';

  if (weather.includes('晴')) return 'sunny';
  if (weather.includes('多云') || weather.includes('少云')) return 'partly-cloudy';
  if (weather.includes('阴')) return 'cloudy';
  if (weather.includes('雨')) return 'rainy';
  if (weather.includes('雪')) return 'cloudy';
  if (weather.includes('雾') || weather.includes('霾')) return 'cloudy';

  return 'cloudy';
};

module.exports = {
  getWeather,
};
