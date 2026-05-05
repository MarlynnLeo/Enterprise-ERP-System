/**
 * useWeather.js
 * @description 天气数据的组合式函数（从 Dashboard.vue 抽取）
 */
import { ref } from 'vue'
import { api } from '../../../services/api'

export function useWeather() {
  // 天气数据
  const weather = ref({
    city: '乐清',
    temperature: '--',
    feelsLike: '--',
    description: '加载中...',
    weatherCode: 'sunny',
    windSpeed: '--',
    humidity: '--',
    updateTime: ''
  })
  const weatherLoading = ref(true)

  // 获取天气数据
  const fetchWeatherData = async () => {
    weatherLoading.value = true

    try {
      // 使用后端天气API（集成和风天气）
      const response = await api.get('/weather/current', {
        params: { city: '乐清' }
      })

      // axios拦截器已自动解包，兼容多种数据格式
      const data = response.data?.data || response.data || response

      if (data && (data.city || data.temperature)) {
        weather.value = {
          city: data.city || '乐清',
          temperature: data.temperature || '--',
          feelsLike: data.feelsLike || '--',
          description: data.description || '未知',
          weatherCode: data.weatherCode || 'cloudy',
          windSpeed: data.windSpeed || '--',
          humidity: data.humidity || '--',
          updateTime: data.updateTime || ''
        }

      } else {
        throw new Error('天气数据格式错误')
      }
    } catch (error) {
      console.warn('天气数据加载失败:', error)
      weather.value = {
        city: '乐清',
        temperature: '--',
        feelsLike: '--',
        description: '天气暂不可用',
        weatherCode: 'cloudy',
        windSpeed: '--',
        humidity: '--',
        updateTime: ''
      }
    } finally {
      weatherLoading.value = false
    }
  }

  return {
    weather,
    weatherLoading,
    fetchWeatherData
  }
}
