/**
 * useWeather.js
 * @description 天气数据组合式函数
 */
import { ref } from 'vue'
import { api } from '../../../services/api'

const DEFAULT_CITY = '乐清'

const createUnavailableWeather = () => ({
  city: DEFAULT_CITY,
  temperature: '--',
  feelsLike: '--',
  description: '天气暂不可用',
  weatherCode: 'cloudy',
  windSpeed: '--',
  humidity: '--',
  updateTime: ''
})

export function useWeather() {
  const weather = ref({
    ...createUnavailableWeather(),
    description: '加载中...',
    weatherCode: 'sunny'
  })
  const weatherLoading = ref(true)

  const fetchWeatherData = async () => {
    weatherLoading.value = true

    try {
      const response = await api.get('/weather/current', {
        params: { city: DEFAULT_CITY }
      })

      const data = response.data || response

      if (data && (data.city || data.temperature)) {
        weather.value = {
          city: data.city || DEFAULT_CITY,
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
    } catch {
      weather.value = createUnavailableWeather()
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
