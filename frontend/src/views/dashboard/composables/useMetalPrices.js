/**
 * useMetalPrices.js
 * @description 金属价格数据的组合式函数（从 Dashboard.vue 抽取）
 */
import { ref, computed } from 'vue'
import { metalPricesApi } from '@/api'
import { ElMessage } from 'element-plus/es/components/message/index'
import { observeChartTheme } from '../../../utils/chartThemeObserver'
// 单位转换系数
const TROY_OUNCE_GRAMS = 31.1034768

const toDisplayPrice = (symbol, payload) => {
  const raw = Number(payload?.price)
  if (!Number.isFinite(raw) || raw <= 0) return null
  return symbol === 'GOLD' || symbol === 'SILVER' ? raw / TROY_OUNCE_GRAMS : raw
}

export function useMetalPrices(updateMiniChartsGeneric, disposeMiniChart) {
  let stopThemeRefresh
  let lifecycle = 0
  let priceRequest = 0
  // 金属价格数据（贵金属按克、有色按吨）
  const metalPrices = ref({
    GOLD: { name: '黄金', price: '--', changePercent: 0, unit: '¥/克', source: '' },
    SILVER: { name: '白银', price: '--', changePercent: 0, unit: '¥/克', source: '' },
    ALUMINUM: { name: '铝', price: '--', changePercent: 0, unit: '¥/吨', source: '' },
    COPPER: { name: '铜', price: '--', changePercent: 0, unit: '¥/吨', source: '' },
    lastUpdate: null,
    dataSource: ''
  })
  const metalPricesLoading = ref(false)
  // 金属价格历史数据
  const metalPriceHistory = ref({
    GOLD: [],
    SILVER: [],
    ALUMINUM: [],
    COPPER: []
  })
  // 金属价格卡片数据（简化版）
  const metalPriceCards = computed(() => {
    const result = {}
    Object.keys(metalPrices.value).forEach(key => {
      if (key !== 'lastUpdate' && key !== 'dataSource') {
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
    } else {
      disposeChart(metalMiniCharts.value[key])
      delete metalMiniCharts.value[key]
      delete metalMiniChartRefs.value[key]
    }
  }
  // 获取金属价格数据
  const applyMetalPayload = (data) => {
    const currentTime = data.timestamp ? new Date(data.timestamp) : new Date()
    const sources = []
    Object.keys(data).forEach((symbol) => {
      if (!metalPrices.value[symbol] || !data[symbol]) return
      const displayPrice = toDisplayPrice(symbol, data[symbol])
      if (displayPrice == null) return
      const isPrecious = symbol === 'GOLD' || symbol === 'SILVER'
      metalPrices.value[symbol] = {
        ...metalPrices.value[symbol],
        price: displayPrice,
        changePercent: data[symbol].changePercent,
        unit: isPrecious ? '¥/克' : '¥/吨',
        source: data[symbol].source || ''
      }
      if (data[symbol].source) sources.push(data[symbol].source)
      metalPriceHistory.value[symbol].push({
        time: currentTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        price: displayPrice,
        timestamp: currentTime
      })
      if (metalPriceHistory.value[symbol].length > 24) {
        metalPriceHistory.value[symbol].shift()
      }
    })
    metalPrices.value.lastUpdate = currentTime
    metalPrices.value.dataSource = [...new Set(sources)].join(' / ')
    updateMetalMiniCharts()
  }

  const fetchMetalPrices = async ({ force = false } = {}) => {
    const requestLifecycle = lifecycle
    const request = ++priceRequest
    const isCurrent = () => requestLifecycle === lifecycle && request === priceRequest
    metalPricesLoading.value = true
    try {
      const response = force
        ? await metalPricesApi.refreshPrices()
        : await metalPricesApi.getRealTimePrices()
      if (!isCurrent() || !response.data) return false
      applyMetalPayload(response.data)
      return true
    } catch (error) {
      if (!isCurrent() || error?.response?.status === 403) return false
      console.error('获取金属价格数据失败:', error)
      ElMessage.error('获取金属价格数据失败，请检查网络连接')
      return false
    } finally {
      if (isCurrent()) metalPricesLoading.value = false
    }
  }
  // 更新金属价格迷你图表
  const updateMetalMiniCharts = () => {
    if (updateMiniChartsGeneric && Object.keys(metalMiniChartRefs.value).length) {
      if (!stopThemeRefresh) stopThemeRefresh = observeChartTheme(updateMetalMiniCharts)
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
    if (await fetchMetalPrices({ force: true })) ElMessage.success('金属价格数据已手动更新')
  }
  // 销毁图表
  const disposeChart = (chart) => {
    if (!chart) return
    if (disposeMiniChart) disposeMiniChart(chart)
    else if (!chart.isDisposed()) chart.dispose()
  }
  const disposeMetalCharts = () => {
    lifecycle++
    stopThemeRefresh?.()
    stopThemeRefresh = undefined
    Object.values(metalMiniCharts.value).forEach(disposeChart)
    metalMiniCharts.value = {}
    metalMiniChartRefs.value = {}
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
