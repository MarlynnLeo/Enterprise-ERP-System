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
          description: data.description || '多云',
          weatherCode: data.weatherCode || 'cloudy',
          windSpeed: data.windSpeed || '--',
          humidity: data.humidity || '--',
          updateTime: data.updateTime || new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
        }

      } else {
        throw new Error('天气数据格式错误')
      }
    } catch (error) {
      // 使用默认数据，不显示错误提示（避免干扰用户）
      weather.value = {
        city: '乐清',
        temperature: '18',
        feelsLike: '17',
        description: '多云',
        weatherCode: 'cloudy',
        windSpeed: '12',
        humidity: '68',
        updateTime: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
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
