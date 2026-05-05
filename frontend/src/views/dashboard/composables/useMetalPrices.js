/**
 * useMetalPrices.js
 * @description 金属价格数据的组合式函数（从 Dashboard.vue 抽取）
 */
import { ref, computed } from 'vue'
import { metalPricesApi } from '../../../services/api'
import { ElMessage } from 'element-plus'
// 单位转换系数
const GRAMS_PER_TROY_OUNCE = 31.1035  // 1金衡盎司 = 31.1035克
const _GRAMS_PER_TON = 1000000  // 1吨 = 1,000,000克
export function useMetalPrices(updateMiniChartsGeneric) {
  // 金属价格数据（统一按克计算）
  const metalPrices = ref({
    GOLD: { name: '黄金', price: '--', changePercent: 0, unit: '¥/克' },
    PLATINUM: { name: '白金', price: '--', changePercent: 0, unit: '¥/克' },
    ALUMINUM: { name: '铝', price: '--', changePercent: 0, unit: '¥/吨' },
    COPPER: { name: '铜', price: '--', changePercent: 0, unit: '¥/吨' },
    lastUpdate: null
  })
  const metalPricesLoading = ref(false)
  // 金属价格历史数据
  const metalPriceHistory = ref({
    GOLD: [],
    PLATINUM: [],
    ALUMINUM: [],
    COPPER: []
  })
  // 金属价格卡片数据（简化版）
  const metalPriceCards = computed(() => {
    const result = {}
    Object.keys(metalPrices.value).forEach(key => {
      if (key !== 'lastUpdate') {
        result[key] = metalPrices.value[key]
      }
    })
    return result
  })
  // 金属价格迷你图表引用
  const metalMiniChartRefs = ref({})
  const metalMiniCharts = ref({})
  const setMetalMiniChartRef = (key, el) => {
    if (el) {
      metalMiniChartRefs.value[key] = el
    }
  }
  // 获取金属价格数据
  const fetchMetalPrices = async () => {
    metalPricesLoading.value = true
    try {
      const response = await metalPricesApi.getRealTimePrices()
      // 拦截器已解包，response.data 就是业务数据
      if (response.data) {
        const data = response.data
        const currentTime = new Date()
        // 更新金属价格数据（统一转换为克）
        Object.keys(data).forEach(symbol => {
          if (metalPrices.value[symbol] && data[symbol]) {
            let priceInGrams
            // 贵金属（黄金、白金）从盎司转换为克
            if (symbol === 'GOLD' || symbol === 'PLATINUM') {
              // 后端返回 ¥/盎司,转换为 ¥/克: 价格 ÷ 31.1035
              priceInGrams = data[symbol].price / GRAMS_PER_TROY_OUNCE
              metalPrices.value[symbol].unit = '¥/克'
            }
            // 有色金属（铝、铜）保持每吨价格
            else {
              priceInGrams = data[symbol].price
              metalPrices.value[symbol].unit = '¥/吨'
            }
            metalPrices.value[symbol] = {
              ...metalPrices.value[symbol],
              price: priceInGrams,
              changePercent: data[symbol].changePercent
            }
            // 添加到历史数据
            metalPriceHistory.value[symbol].push({
              time: currentTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
              price: priceInGrams,
              timestamp: currentTime
            })
            // 保留最近24个数据点
            if (metalPriceHistory.value[symbol].length > 24) {
              metalPriceHistory.value[symbol].shift()
            }
          }
        })
        metalPrices.value.lastUpdate = currentTime
        // 更新迷你图表
        updateMetalMiniCharts()
      }
    } catch (error) {
      console.error('获取金属价格数据失败:', error)
      ElMessage.error('获取金属价格数据失败，请检查网络连接')
    } finally {
      metalPricesLoading.value = false
    }
  }
  // 更新金属价格迷你图表
  const updateMetalMiniCharts = () => {
    if (updateMiniChartsGeneric) {
      updateMiniChartsGeneric(
        metalMiniChartRefs.value,
        metalMiniCharts.value,
        metalPriceHistory.value,
        (key) => metalPrices.value[key]?.changePercent || 0
      )
    }
  }
  // 刷新金属价格
  const refreshMetalPrices = async () => {
    await fetchMetalPrices()
    ElMessage.success('金属价格数据已手动更新')
  }
  // 销毁图表
  const disposeMetalCharts = () => {
    Object.values(metalMiniCharts.value).forEach(chart => {
      if (chart) chart.dispose()
    })
  }
  return {
    metalPrices,
    metalPricesLoading,
    metalPriceHistory,
    metalPriceCards,
    metalMiniChartRefs,
    metalMiniCharts,
    setMetalMiniChartRef,
    fetchMetalPrices,
    refreshMetalPrices,
    updateMetalMiniCharts,
    disposeMetalCharts
  }
}