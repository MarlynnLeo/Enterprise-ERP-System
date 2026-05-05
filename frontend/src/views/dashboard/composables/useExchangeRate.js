/**
 * useExchangeRate.js
 * @description 汇率与图表数据的组合式函数（从 Dashboard.vue 抽取）
 */
import { ref, computed } from 'vue'
import * as echarts from 'echarts/core'
import { ElMessage } from 'element-plus'
import { exchangeRateApi } from '../../../api/enhanced'

const DASHBOARD_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY']

export function useExchangeRate() {
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
      change: exchangeRates.value.USDCNY_change
    },
    EURCNY: {
      pair: 'EUR/CNY',
      value: exchangeRates.value.EURCNY,
      change: exchangeRates.value.EURCNY_change
    },
    GBPCNY: {
      pair: 'GBP/CNY',
      value: exchangeRates.value.GBPCNY,
      change: exchangeRates.value.GBPCNY_change
    },
    JPYCNY: {
      pair: 'JPY/CNY',
      value: exchangeRates.value.JPYCNY,
      change: exchangeRates.value.JPYCNY_change
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
    exchangeRateLoading.value = true

    try {
      const entries = await Promise.all(
        DASHBOARD_CURRENCIES.map(async (currency) => {
          const response = await exchangeRateApi.getLatest(currency, 'CNY')
          const rate = Number(response.data?.rate)
          return [currency, Number.isFinite(rate) && rate > 0 ? rate : null]
        })
      )

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
      console.error('获取汇率数据失败:', error)
      ElMessage.error('获取汇率数据失败，请检查网络连接')
      return false
    } finally {
      exchangeRateLoading.value = false
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
        color: isPositive ? '#67C23A' : '#F56C6C',
        width: 1.5
      },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: isPositive ? 'rgba(103, 194, 58, 0.3)' : 'rgba(245, 108, 108, 0.3)' },
            { offset: 1, color: isPositive ? 'rgba(103, 194, 58, 0.1)' : 'rgba(245, 108, 108, 0.1)' }
          ]
        }
      },
      data: history.map(item => item.value || item.price)
    }]
  })

  // 初始化迷你图表（统一函数）
  const initMiniChart = (key, container, chartsObj, historyData, changeValue) => {
    if (!container) return

    // 检查容器尺寸是否有效，避免 ECharts 警告
    if (!container.clientWidth || !container.clientHeight) return

    const chart = echarts.init(container)
    const history = historyData[key] || []
    const isPositive = changeValue >= 0

    chart.setOption(getMiniChartOption(history, isPositive))
    chartsObj[key] = chart
  }

  // 更新迷你图表（统一函数）
  const updateMiniChartsGeneric = (chartRefs, charts, historyData, getChangeValue) => {
    Object.keys(chartRefs).forEach(key => {
      const container = chartRefs[key]
      const history = historyData[key] || []
      const isPositive = getChangeValue(key) >= 0

      if (container && !charts[key]) {
        initMiniChart(key, container, charts, historyData, getChangeValue(key))
      } else if (charts[key]) {
        charts[key].setOption({
          xAxis: {
            data: history.map(item => item.time)
          },
          series: [{
            data: history.map(item => item.value || item.price),
            lineStyle: {
              color: isPositive ? '#67C23A' : '#F56C6C'
            },
            areaStyle: {
              color: {
                type: 'linear',
                x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: isPositive ? 'rgba(103, 194, 58, 0.3)' : 'rgba(245, 108, 108, 0.3)' },
                  { offset: 1, color: isPositive ? 'rgba(103, 194, 58, 0.1)' : 'rgba(245, 108, 108, 0.1)' }
                ]
              }
            }
          }]
        })
      }
    })
  }

  // 初始化汇率走势图
  const initExchangeRateChart = () => {
    if (!exchangeRateChartRef.value) return

    // 检查容器尺寸是否有效，避免 ECharts 警告
    const container = exchangeRateChartRef.value
    if (!container.clientWidth || !container.clientHeight) return

    exchangeRateChart = echarts.init(container)

    const option = {
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross'
        },
        formatter: function(params) {
          let result = params[0].name + '<br/>'
          params.forEach(param => {
            result += `${param.seriesName}: ${param.value}<br/>`
          })
          return result
        }
      },
      legend: {
        data: ['USD/CNY', 'EUR/CNY', 'GBP/CNY'],
        textStyle: {
          fontSize: 12
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: [],
        axisLabel: {
          fontSize: 10
        }
      },
      yAxis: {
        type: 'value',
        scale: true,
        axisLabel: {
          fontSize: 10
        }
      },
      series: [
        {
          name: 'USD/CNY',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: {
            color: '#409EFF',
            width: 2
          },
          itemStyle: {
            color: '#409EFF'
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(64, 158, 255, 0.3)' },
                { offset: 1, color: 'rgba(64, 158, 255, 0.1)' }
              ]
            }
          },
          data: []
        },
        {
          name: 'EUR/CNY',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: {
            color: '#67C23A',
            width: 2
          },
          itemStyle: {
            color: '#67C23A'
          },
          data: []
        },
        {
          name: 'GBP/CNY',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: {
            color: '#E6A23C',
            width: 2
          },
          itemStyle: {
            color: '#E6A23C'
          },
          data: []
        }
      ]
    }

    exchangeRateChart.setOption(option)
  }

  // 更新汇率走势图
  const updateExchangeRateChart = () => {
    if (!exchangeRateChart) return

    const timeData = exchangeRateHistory.value.USDCNY.map(item => item.time)
    const usdData = exchangeRateHistory.value.USDCNY.map(item => item.value)
    const eurData = exchangeRateHistory.value.EURCNY.map(item => item.value)
    const gbpData = exchangeRateHistory.value.GBPCNY.map(item => item.value)

    exchangeRateChart.setOption({
      xAxis: {
        data: timeData
      },
      series: [
        { data: usdData },
        { data: eurData },
        { data: gbpData }
      ]
    })
  }

  // 更新汇率迷你图表
  const updateMiniCharts = () => {
    updateMiniChartsGeneric(
      miniChartRefs.value,
      miniCharts.value,
      exchangeRateHistory.value,
      (key) => exchangeRates.value[`${key}_change`] || 0
    )
  }

  // 设置迷你图表引用
  const setMiniChartRef = (key, el) => {
    if (el) {
      miniChartRefs.value[key] = el
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
    if (exchangeRateChart) {
      exchangeRateChart.dispose()
      exchangeRateChart = null
    }
    Object.values(miniCharts.value).forEach(chart => {
      if (chart) chart.dispose()
    })
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
    initExchangeRateChart,
    updateExchangeRateChart,
    updateMiniCharts,
    refreshExchangeRate,
    getMiniChartOption,
    initMiniChart,
    updateMiniChartsGeneric,
    disposeCharts
  }
}
