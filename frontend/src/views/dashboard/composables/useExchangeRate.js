/**
 * useExchangeRate.js
 * @description 汇率与图表数据的组合式函数（从 Dashboard.vue 抽取）
 */
import { ref, computed, markRaw, toRaw } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index'
import { exchangeRateApi } from '../../../api/enhanced'
import { alphaColor, chartTheme, getCssTokenValue } from '../../../utils/designTokens'
import { observeChartTheme } from '../../../utils/chartThemeObserver'

const DASHBOARD_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY']

export function useExchangeRate() {
  let echarts = null
  let echartsPromise = null
  let chartResizeObserver = null
  let chartLifecycle = 0
  let rateRequest = 0
  let stopThemeRefresh
  const observedCharts = new Map()

  const unobserveChart = (chart) => {
    // dispose() 后 ECharts 会清空 getDom()，从登记记录释放原容器。
    observedCharts.forEach((observed, container) => {
      if (observed.chart !== toRaw(chart)) return
      chartResizeObserver?.unobserve(container)
      observedCharts.delete(container)
    })
  }

  // 布局、主题和页签显隐都会改变容器尺寸；ECharts 不会自动跟随 CSS 缩放。
  const observeChart = (chart, container) => {
    if (!stopThemeRefresh) {
      stopThemeRefresh = observeChartTheme(() => {
        updateExchangeRateChart()
        updateMiniCharts()
      })
    }
    if (typeof ResizeObserver === 'undefined') return
    if (!chartResizeObserver) {
      chartResizeObserver = new ResizeObserver((entries) => {
        entries.forEach(({ target }) => {
          const observed = observedCharts.get(target)
          if (!observed) return
          if (observed.chart.isDisposed()) {
            unobserveChart(observed.chart)
            return
          }

          const width = target.clientWidth
          const height = target.clientHeight
          const changed = width !== observed.width || height !== observed.height
          observed.width = width
          observed.height = height
          // v-show 隐藏页签时不重置画布；重新显示后仍会检测到尺寸变化。
          if (changed && width > 0 && height > 0) observed.chart.resize()
        })
      })
    }
    if (observedCharts.has(container)) return
    observedCharts.set(container, {
      chart,
      width: container.clientWidth,
      height: container.clientHeight
    })
    chartResizeObserver.observe(container)
  }

  // ECharts 是仪表盘中体积最大的依赖之一。只有图表真正需要绘制时才加载，
  // 数据请求与文字卡片可先完成，不再阻塞首页首屏渲染。
  const ensureEcharts = async () => {
    if (echarts) return echarts
    if (!echartsPromise) {
      echartsPromise = import('@/utils/echartsCore')
        .then((module) => module.echarts)
        .catch((error) => {
          echartsPromise = null
          throw error
        })
    }
    echarts = await echartsPromise
    return echarts
  }

  // 外汇数据
  const exchangeRates = ref({
    USDCNY: '--',
    EURCNY: '--',
    GBPCNY: '--',
    JPYCNY: '--',
    USDCNY_change: 0,
    EURCNY_change: 0,
    GBPCNY_change: 0,
    JPYCNY_change: 0,
    lastUpdate: null
  })
  const exchangeRateLoading = ref(false)

  // 汇率历史数据
  const exchangeRateHistory = ref({
    USDCNY: [],
    EURCNY: [],
    GBPCNY: [],
    JPYCNY: []
  })

  // 汇率卡片数据
  const exchangeRateCards = computed(() => ({
    USDCNY: {
      pair: 'USD/CNY',
      value: exchangeRates.value.USDCNY,
      change: exchangeRates.value.USDCNY_change,
      unit: '中间价'
    },
    EURCNY: {
      pair: 'EUR/CNY',
      value: exchangeRates.value.EURCNY,
      change: exchangeRates.value.EURCNY_change,
      unit: '中间价'
    },
    GBPCNY: {
      pair: 'GBP/CNY',
      value: exchangeRates.value.GBPCNY,
      change: exchangeRates.value.GBPCNY_change,
      unit: '中间价'
    },
    JPYCNY: {
      pair: 'JPY/CNY',
      value: exchangeRates.value.JPYCNY,
      change: exchangeRates.value.JPYCNY_change,
      unit: '中间价'
    }
  }))

  // 图表引用
  const exchangeRateChartRef = ref(null)
  const miniChartRefs = ref({})
  let exchangeRateChart = null
  const miniCharts = ref({})

  // 处理汇率数据并更新（提取公共逻辑）
  const processExchangeRateData = (rates, dataSource, mode = 'usdBase') => {
    const prevRates = { ...exchangeRates.value }

    // 计算对人民币的汇率
    const usdToCny = mode === 'direct' ? Number(rates.USD) : rates.CNY || 0
    const eurToCny = mode === 'direct' ? Number(rates.EUR) : (rates.EUR ? (rates.CNY / rates.EUR) : 0)
    const gbpToCny = mode === 'direct' ? Number(rates.GBP) : (rates.GBP ? (rates.CNY / rates.GBP) : 0)
    const jpyToCny = mode === 'direct' ? Number(rates.JPY) : (rates.JPY ? (rates.CNY / rates.JPY) : 0)

    // 计算变化
    const usdChange = prevRates.USDCNY !== '--' ? usdToCny - parseFloat(prevRates.USDCNY) : 0
    const eurChange = prevRates.EURCNY !== '--' ? eurToCny - parseFloat(prevRates.EURCNY) : 0
    const gbpChange = prevRates.GBPCNY !== '--' ? gbpToCny - parseFloat(prevRates.GBPCNY) : 0
    const jpyChange = prevRates.JPYCNY !== '--' ? jpyToCny - parseFloat(prevRates.JPYCNY) : 0

    const currentTime = new Date()

    // 更新历史数据（保留最近24个数据点）
    const updateHistory = (currency, value) => {
      const history = exchangeRateHistory.value[currency]
      history.push({
        time: currentTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        value: parseFloat(value)
      })
      if (history.length > 24) {
        history.shift()
      }
    }

    updateHistory('USDCNY', usdToCny.toFixed(4))
    updateHistory('EURCNY', eurToCny.toFixed(4))
    updateHistory('GBPCNY', gbpToCny.toFixed(4))
    updateHistory('JPYCNY', jpyToCny.toFixed(6))

    exchangeRates.value = {
      USDCNY: usdToCny.toFixed(4),
      EURCNY: eurToCny.toFixed(4),
      GBPCNY: gbpToCny.toFixed(4),
      JPYCNY: jpyToCny.toFixed(6),
      USDCNY_change: usdChange,
      EURCNY_change: eurChange,
      GBPCNY_change: gbpChange,
      JPYCNY_change: jpyChange,
      lastUpdate: currentTime,
      dataSource: dataSource
    }

    // 更新图表
    updateExchangeRateChart()
    updateMiniCharts()
  }

  // 获取外汇数据
  const fetchExchangeRates = async () => {
    const lifecycle = chartLifecycle
    const request = ++rateRequest
    const isCurrent = () => lifecycle === chartLifecycle && request === rateRequest
    exchangeRateLoading.value = true

    try {
      const entries = await Promise.all(
        DASHBOARD_CURRENCIES.map(async (currency) => {
          const response = await exchangeRateApi.getLatest(currency, 'CNY')
          const rate = Number(response.data?.rate)
          return [currency, Number.isFinite(rate) && rate > 0 ? rate : null]
        })
      )
      if (!isCurrent()) return false

      const maintainedRates = Object.fromEntries(entries.filter(([, rate]) => rate !== null))
      const missingCurrencies = DASHBOARD_CURRENCIES.filter(currency => !maintainedRates[currency])

      if (missingCurrencies.length > 0) {
        exchangeRates.value = {
          ...exchangeRates.value,
          lastUpdate: new Date(),
          dataSource: '汇率维护'
        }
        ElMessage.warning(`请先维护 ${missingCurrencies.join('/')} 对人民币汇率`)
        return false
      }

      processExchangeRateData(maintainedRates, '汇率维护', 'direct')
      return true
    } catch (error) {
      if (!isCurrent() || error?.response?.status === 403) return false
      console.error('获取汇率数据失败:', error)
      ElMessage.error('获取汇率数据失败，请检查网络连接')
      return false
    } finally {
      if (isCurrent()) exchangeRateLoading.value = false
    }
  }

  // 通用迷你图表配置生成器
  const getMiniChartOption = (history, isPositive) => ({
    grid: {
      left: 0,
      right: 0,
      top: 0,
      bottom: 0
    },
    xAxis: {
      type: 'category',
      show: false,
      data: history.map(item => item.time)
    },
    yAxis: {
      type: 'value',
      show: false,
      scale: true
    },
    series: [{
      type: 'line',
      smooth: true,
      symbol: 'none',
      lineStyle: {
        color: isPositive ? getCssTokenValue('success') : getCssTokenValue('danger'),
        width: 1.5
      },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: isPositive ? alphaColor('success', 0.3) : alphaColor('danger', 0.3) },
            { offset: 1, color: isPositive ? alphaColor('success', 0.1) : alphaColor('danger', 0.1) }
          ]
        }
      },
      data: history.map(item => item.value ?? item.price)
    }]
  })

  // 初始化迷你图表（统一函数）
  const initMiniChart = (key, container, chartsObj, historyData, changeValue) => {
    if (!container || !echarts) return

    // 检查容器尺寸是否有效，避免 ECharts 警告
    if (!container.clientWidth || !container.clientHeight) return

    const previousChart = chartsObj[key]
    if (previousChart) {
      unobserveChart(previousChart)
      if (!previousChart.isDisposed()) previousChart.dispose()
    }
    const chart = echarts.init(container)
    const history = historyData[key] || []
    const isPositive = changeValue >= 0

    chart.setOption(getMiniChartOption(history, isPositive))
    chartsObj[key] = markRaw(chart)
    observeChart(chart, container)
  }

  // 更新迷你图表（统一函数）
  const updateMiniChartsGeneric = (chartRefs, charts, historyData, getChangeValue) => {
    if (!echarts) return

    Object.keys(chartRefs).forEach(key => {
      const container = chartRefs[key]
      const history = historyData[key] || []
      const isPositive = getChangeValue(key) >= 0

      if (container && (!charts[key] || charts[key].isDisposed() || charts[key].getDom() !== container)) {
        initMiniChart(key, container, charts, historyData, getChangeValue(key))
      } else if (charts[key] && !charts[key].isDisposed()) {
        charts[key].setOption(getMiniChartOption(history, isPositive))
      }
    })
  }

  const exchangeSeries = [
    { key: 'USDCNY', name: 'USD/CNY', color: 'primary' },
    { key: 'EURCNY', name: 'EUR/CNY', color: 'success' },
    { key: 'GBPCNY', name: 'GBP/CNY', color: 'warning' }
  ]

  // Initialize only for the current mounted container after the lazy import.
  const initExchangeRateChart = async () => {
    if (!exchangeRateChartRef.value) return
    const lifecycle = chartLifecycle
    await ensureEcharts()
    if (lifecycle !== chartLifecycle) return

    const container = exchangeRateChartRef.value
    if (!container?.clientWidth || !container.clientHeight) return
    if (exchangeRateChart && (exchangeRateChart.isDisposed() || exchangeRateChart.getDom() !== container)) {
      unobserveChart(exchangeRateChart)
      if (!exchangeRateChart.isDisposed()) exchangeRateChart.dispose()
      exchangeRateChart = null
    }
    if (exchangeRateChart) {
      exchangeRateChart.resize()
      updateExchangeRateChart()
      return exchangeRateChart
    }

    exchangeRateChart = echarts.init(container)
    exchangeRateChart.setOption({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: (params) => params.length
          ? `${params[0].name}<br/>${params.map(param => `${param.seriesName}: ${param.value}`).join('<br/>')}`
          : ''
      },
      legend: { data: exchangeSeries.map(series => series.name), textStyle: { fontSize: 12 } },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'category', boundaryGap: false, data: [], axisLabel: { fontSize: 10 } },
      yAxis: { type: 'value', scale: true, axisLabel: { fontSize: 10 } },
      series: exchangeSeries.map(series => ({
        name: series.name, type: 'line', smooth: true, symbol: 'circle', symbolSize: 4,
        lineStyle: { width: 2 }, data: []
      }))
    })
    updateExchangeRateChart()
    observeChart(exchangeRateChart, container)
    return exchangeRateChart
  }

  const updateExchangeRateChart = () => {
    if (!exchangeRateChart || exchangeRateChart.isDisposed()) return
    const theme = chartTheme()
    exchangeRateChart.setOption({
      textStyle: { color: theme.text },
      legend: { textStyle: { color: theme.text } },
      tooltip: { backgroundColor: theme.tooltipBg, borderColor: theme.axis, textStyle: { color: theme.tooltipText } },
      xAxis: {
        data: exchangeRateHistory.value.USDCNY.map(item => item.time),
        axisLabel: { color: theme.text },
        axisLine: { lineStyle: { color: theme.axis } }
      },
      yAxis: {
        axisLabel: { color: theme.text },
        axisLine: { lineStyle: { color: theme.axis } },
        splitLine: { lineStyle: { color: theme.splitLine } }
      },
      series: exchangeSeries.map((series, index) => ({
        data: exchangeRateHistory.value[series.key].map(item => item.value),
        lineStyle: { color: getCssTokenValue(series.color) },
        itemStyle: { color: getCssTokenValue(series.color) },
        ...(index === 0 ? { areaStyle: { color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: alphaColor(series.color, 0.3) },
            { offset: 1, color: alphaColor(series.color, 0.1) }
          ]
        } } } : {})
      }))
    })
  }

  const updateMiniCharts = () => {
    updateMiniChartsGeneric(
      miniChartRefs.value,
      miniCharts.value,
      exchangeRateHistory.value,
      (key) => exchangeRates.value[`${key}_change`] || 0
    )
  }

  const disposeMiniChart = (chart) => {
    if (!chart) return
    unobserveChart(chart)
    if (!chart.isDisposed()) chart.dispose()
  }

  const setMiniChartRef = (key, el) => {
    if (el) {
      miniChartRefs.value[key] = el
    } else {
      disposeMiniChart(miniCharts.value[key])
      delete miniCharts.value[key]
      delete miniChartRefs.value[key]
    }
  }

  // 刷新汇率
  const refreshExchangeRate = async () => {
    try {
      const updated = await fetchExchangeRates()
      if (updated) {
        ElMessage.success('汇率数据已更新')
      }
    } catch (error) {
      console.error('手动刷新汇率失败:', error)
      ElMessage.error('刷新汇率失败，请稍后重试')
    }
  }

  // 销毁图表
  const disposeCharts = () => {
    chartLifecycle += 1
    chartResizeObserver?.disconnect()
    chartResizeObserver = null
    observedCharts.clear()
    stopThemeRefresh?.()
    stopThemeRefresh = undefined
    if (exchangeRateChart) {
      if (!exchangeRateChart.isDisposed()) exchangeRateChart.dispose()
      exchangeRateChart = null
    }
    Object.values(miniCharts.value).forEach(chart => {
      if (chart && !chart.isDisposed()) chart.dispose()
    })
    miniCharts.value = {}
    miniChartRefs.value = {}
  }

  return {
    exchangeRates,
    exchangeRateLoading,
    exchangeRateHistory,
    exchangeRateCards,
    exchangeRateChartRef,
    miniChartRefs,
    setMiniChartRef,
    fetchExchangeRates,
    ensureEcharts,
    initExchangeRateChart,
    updateExchangeRateChart,
    updateMiniCharts,
    refreshExchangeRate,
    getMiniChartOption,
    initMiniChart,
    updateMiniChartsGeneric,
    disposeMiniChart,
    disposeCharts
  }
}
