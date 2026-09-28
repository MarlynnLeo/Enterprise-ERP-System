import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { isProxy } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { useExchangeRate } from '@/views/dashboard/composables/useExchangeRate'
import { useMetalPrices } from '@/views/dashboard/composables/useMetalPrices'

const mocks = vi.hoisted(() => ({ init: vi.fn(), rates: vi.fn(), metalPrices: vi.fn(), refreshMetalPrices: vi.fn(), success: vi.fn() }))
vi.mock('@/utils/echartsCore', () => ({ echarts: { init: mocks.init } }))
vi.mock('@/api/enhanced', () => ({ exchangeRateApi: { getLatest: mocks.rates } }))
vi.mock('@/api', () => ({ metalPricesApi: { getRealTimePrices: mocks.metalPrices, refreshPrices: mocks.refreshMetalPrices } }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { success: mocks.success, error: vi.fn() } }))

let observers
let charts
let dashboard
let metals

const makeContainer = (width = 240, height = 40) => {
  const element = document.createElement('div')
  const size = { width, height }
  Object.defineProperties(element, {
    clientWidth: { get: () => size.width },
    clientHeight: { get: () => size.height }
  })
  return { element, size }
}

beforeEach(() => {
  observers = []
  charts = []
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback) {
      this.callback = callback
      this.observe = vi.fn()
      this.unobserve = vi.fn()
      this.disconnect = vi.fn()
      observers.push(this)
    }
    notify(...targets) {
      this.callback(targets.map(target => ({ target })))
    }
  })
  mocks.init.mockImplementation((container) => {
    let disposed = false
    const chart = {
      getDom: () => disposed ? null : container,
      isDisposed: () => disposed,
      setOption: vi.fn(),
      resize: vi.fn(),
      dispose: vi.fn(() => { disposed = true })
    }
    charts.push(chart)
    return chart
  })
  dashboard = useExchangeRate()
})

afterEach(() => {
  metals?.disposeMetalCharts()
  metals = undefined
  dashboard.disposeCharts()
  document.documentElement.removeAttribute('style')
  vi.unstubAllGlobals()
})

describe('dashboard chart container resize', () => {
  test('a stale metal request cannot overwrite fresh prices or clear its loading state', async () => {
    let resolveOld, resolveNew
    mocks.metalPrices.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve }))
      .mockReturnValueOnce(new Promise(resolve => { resolveNew = resolve }))
    metals = useMetalPrices()
    const old = metals.fetchMetalPrices()
    const latest = metals.fetchMetalPrices()
    resolveOld({ data: { COPPER: { price: 10, changePercent: 0 } } })
    expect(await old).toBe(false)
    expect(metals.metalPricesLoading.value).toBe(true)
    resolveNew({ data: { COPPER: { price: 20, changePercent: 1 } } })
    expect(await latest).toBe(true)
    expect(metals.metalPrices.value.COPPER.price).toBe(20)
    expect(metals.metalPriceHistory.value.COPPER).toHaveLength(1)
  })

  test('late exchange rates cannot replace a newer successful refresh', async () => {
    const pending = []
    mocks.rates.mockImplementation(() => new Promise(resolve => pending.push(resolve)))
    const old = dashboard.fetchExchangeRates()
    const latest = dashboard.fetchExchangeRates()
    pending.slice(4).forEach(resolve => resolve({ data: { rate: 9 } }))
    expect(await latest).toBe(true)
    pending.slice(0, 4).forEach(resolve => resolve({ data: { rate: 7 } }))
    expect(await old).toBe(false)
    expect(dashboard.exchangeRates.value.USDCNY).toBe('9.0000')
  })

  test('resizes the exchange chart and shared metal mini charts when CSS changes their containers', async () => {
    const exchange = makeContainer(480, 160)
    const metal = makeContainer()
    dashboard.exchangeRateChartRef.value = exchange.element
    await dashboard.initExchangeRateChart()
    dashboard.updateMiniChartsGeneric({ GOLD: metal.element }, {}, { GOLD: [] }, () => 0)

    expect(observers).toHaveLength(1)
    expect(observers[0].observe).toHaveBeenCalledWith(exchange.element)
    expect(observers[0].observe).toHaveBeenCalledWith(metal.element)
    exchange.size.width = 360
    metal.size.height = 32
    observers[0].notify(exchange.element, metal.element)
    expect(charts[0].resize).toHaveBeenCalledTimes(1)
    expect(charts[1].resize).toHaveBeenCalledTimes(1)

    observers[0].notify(exchange.element, metal.element)
    expect(charts[0].resize).toHaveBeenCalledTimes(1)
    expect(charts[1].resize).toHaveBeenCalledTimes(1)
  })

  test('skips hidden tabs and resizes when the same dimensions become visible again', async () => {
    const mini = makeContainer()
    await dashboard.ensureEcharts()
    dashboard.setMiniChartRef('USDCNY', mini.element)
    dashboard.updateMiniCharts()

    mini.size.width = 0
    mini.size.height = 0
    observers[0].notify(mini.element)
    expect(charts[0].resize).not.toHaveBeenCalled()

    mini.size.width = 240
    mini.size.height = 40
    observers[0].notify(mini.element)
    expect(charts[0].resize).toHaveBeenCalledTimes(1)
  })

  test('initializes a hidden mini chart once its tab is opened and releases it when its ref is removed', async () => {
    const mini = makeContainer(0, 0)
    await dashboard.ensureEcharts()
    dashboard.setMiniChartRef('USDCNY', mini.element)
    dashboard.updateMiniCharts()
    expect(mocks.init).not.toHaveBeenCalled()

    mini.size.width = 240
    mini.size.height = 32
    dashboard.updateMiniCharts()
    expect(charts).toHaveLength(1)
    dashboard.setMiniChartRef('USDCNY', null)
    expect(observers[0].unobserve).toHaveBeenCalledWith(mini.element)
    expect(charts[0].dispose).toHaveBeenCalledTimes(1)
    expect(dashboard.miniChartRefs.value.USDCNY).toBeUndefined()
  })

  test('replaces old containers and recreates externally disposed mini charts without observing stale nodes', async () => {
    const oldMini = makeContainer()
    const newMini = makeContainer(200, 32)
    const miniCharts = {}
    await dashboard.ensureEcharts()
    dashboard.updateMiniChartsGeneric({ GOLD: oldMini.element }, miniCharts, { GOLD: [] }, () => 0)
    dashboard.updateMiniChartsGeneric({ GOLD: newMini.element }, miniCharts, { GOLD: [] }, () => 0)
    expect(charts[0].dispose).toHaveBeenCalledTimes(1)
    expect(observers[0].unobserve).toHaveBeenCalledWith(oldMini.element)

    charts[1].dispose()
    dashboard.updateMiniChartsGeneric({ GOLD: newMini.element }, miniCharts, { GOLD: [] }, () => 0)
    expect(charts).toHaveLength(3)
    newMini.size.width = 180
    observers[0].notify(oldMini.element, newMini.element)
    expect(charts[0].resize).not.toHaveBeenCalled()
    expect(charts[1].resize).not.toHaveBeenCalled()
    expect(charts[2].resize).toHaveBeenCalledTimes(1)
  })

  test('disconnects on disposal and creates a fresh observer when charts are rebuilt', async () => {
    const exchange = makeContainer(480, 160)
    const replacement = makeContainer(360, 160)
    dashboard.exchangeRateChartRef.value = exchange.element
    await dashboard.initExchangeRateChart()
    dashboard.exchangeRateChartRef.value = replacement.element
    await dashboard.initExchangeRateChart()
    expect(charts[0].dispose).toHaveBeenCalledTimes(1)
    expect(observers[0].unobserve).toHaveBeenCalledWith(exchange.element)

    const previousObserver = observers[0]
    dashboard.disposeCharts()
    expect(previousObserver.disconnect).toHaveBeenCalledTimes(1)
    replacement.size.width = 300
    previousObserver.notify(replacement.element)
    expect(charts[1].resize).not.toHaveBeenCalled()
    await dashboard.initExchangeRateChart()
    expect(observers).toHaveLength(2)
    replacement.size.width = 280
    observers[1].notify(replacement.element)
    expect(charts[2].resize).toHaveBeenCalledTimes(1)
  })

  test('does not initialize a chart after disposal while its lazy import is pending', async () => {
    dashboard.exchangeRateChartRef.value = makeContainer(480, 160).element
    const initialization = dashboard.initExchangeRateChart()
    dashboard.disposeCharts()
    await initialization
    expect(mocks.init).not.toHaveBeenCalled()
    expect(observers).toHaveLength(0)
  })

  test('keeps shared chart instances out of Vue proxies and preserves zero values', async () => {
    const { reactive } = await import('vue')
    const mini = makeContainer()
    const registry = reactive({})
    await dashboard.ensureEcharts()
    dashboard.updateMiniChartsGeneric({ GOLD: mini.element }, registry, { GOLD: [{ time: '12:00', value: 0 }] }, () => 0)
    expect(isProxy(registry.GOLD)).toBe(false)
    expect(charts[0].setOption.mock.calls[0][0].series[0].data).toEqual([0])
  })

  test('refreshes axis, legend and series colors when the applied theme changes', async () => {
    const exchange = makeContainer(480, 160)
    dashboard.exchangeRateChartRef.value = exchange.element
    await dashboard.initExchangeRateChart()
    document.documentElement.style.setProperty('--color-primary', '#112233')
    document.documentElement.style.setProperty('--color-text-regular', '#eeeeee')
    await flushPromises()
    expect(charts[0].setOption.mock.lastCall[0]).toMatchObject({
      legend: { textStyle: { color: '#eeeeee' } },
      xAxis: { axisLabel: { color: '#eeeeee' } },
      series: [{ lineStyle: { color: '#112233' } }, {}, {}]
    })
    dashboard.disposeCharts()
    const calls = charts[0].setOption.mock.calls.length
    document.documentElement.style.setProperty('--color-primary', '#334455')
    await flushPromises()
    expect(charts[0].setOption).toHaveBeenCalledTimes(calls)
  })

  test('releases metal chart containers immediately when their refs disappear', async () => {
    const metal = makeContainer()
    await dashboard.ensureEcharts()
    metals = useMetalPrices(dashboard.updateMiniChartsGeneric, dashboard.disposeMiniChart)
    metals.setMetalMiniChartRef('GOLD', metal.element)
    metals.updateMetalMiniCharts()
    expect(charts).toHaveLength(1)
    expect(isProxy(metals.metalMiniCharts.value.GOLD)).toBe(false)
    metals.setMetalMiniChartRef('GOLD', null)
    expect(observers[0].unobserve).toHaveBeenCalledWith(metal.element)
    expect(charts[0].dispose).toHaveBeenCalledTimes(1)
    expect(metals.metalMiniChartRefs.value.GOLD).toBeUndefined()
    expect(metals.metalMiniCharts.value.GOLD).toBeUndefined()
  })

  test('ignores metal data returned after disposal and does not report failed refreshes as success', async () => {
    let resolve
    mocks.metalPrices.mockImplementationOnce(() => new Promise(accept => { resolve = accept }))
    metals = useMetalPrices(dashboard.updateMiniChartsGeneric, dashboard.disposeMiniChart)
    const request = metals.fetchMetalPrices()
    metals.disposeMetalCharts()
    resolve({ data: { GOLD: { price: 310, changePercent: 0 } } })
    expect(await request).toBe(false)
    expect(metals.metalPrices.value.GOLD.price).toBe('--')
    mocks.refreshMetalPrices.mockRejectedValueOnce({ response: { status: 403 } })
    await metals.refreshMetalPrices()
    expect(mocks.success).not.toHaveBeenCalled()
  })
})
