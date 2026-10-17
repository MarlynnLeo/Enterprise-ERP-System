import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { animator } from 'chart.js'
import Chart from '@/utils/chartCore'
import { createLineChartConfig } from '@/utils/chartConfig'
import {
  disposePerformanceMode, getPerformanceMode, initPerformanceMode
} from '@/utils/performanceMode'

let echarts
let nativeEcharts
const chartJsInstances = []
const echartsInstances = []
const savedNavigatorProperties = new Map()
let reducedMotion
let connection

beforeAll(async () => {
  // zrender reads the default DPR when its module loads.
  vi.stubGlobal('devicePixelRatio', 2)
  ;({ echarts } = await import('@/utils/echartsCore'))
  nativeEcharts = await import('echarts/core')
  for (const key of ['hardwareConcurrency', 'deviceMemory', 'connection']) {
    savedNavigatorProperties.set(key, Object.getOwnPropertyDescriptor(navigator, key))
  }
})

beforeEach(() => {
  disposePerformanceMode()
  localStorage.clear()
  reducedMotion = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }
  connection = { saveData: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }
  Object.defineProperties(navigator, {
    hardwareConcurrency: { configurable: true, value: 8 },
    deviceMemory: { configurable: true, value: 8 },
    connection: { configurable: true, value: connection }
  })
  vi.stubGlobal('devicePixelRatio', 2)
  vi.stubGlobal('matchMedia', vi.fn(query => query.includes('reduced-motion')
    ? reducedMotion
    : { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  const contexts = new WeakMap()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () {
    if (!contexts.has(this)) {
      const gradient = { addColorStop() {} }
      contexts.set(this, new Proxy({
        canvas: this,
        measureText: text => ({ width: String(text).length * 8 }),
        getLineDash: () => [],
        createLinearGradient: () => gradient,
        createRadialGradient: () => gradient
      }, { get: (target, key) => key in target ? target[key] : () => {} }))
    }
    return contexts.get(this)
  })
})

afterEach(async () => {
  for (const chart of echartsInstances.splice(0)) if (!chart.isDisposed()) chart.dispose()
  for (const chart of chartJsInstances.splice(0)) if (chart.canvas) chart.destroy()
  disposePerformanceMode()
  document.body.replaceChildren()
  document.documentElement.className = ''
  document.documentElement.removeAttribute('style')
  localStorage.clear()
  await flushPromises()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

afterAll(() => {
  for (const [key, descriptor] of savedNavigatorProperties) {
    if (descriptor) Object.defineProperty(navigator, key, descriptor)
    else delete navigator[key]
  }
})

function setMode(mode) {
  if (mode === 'low-end') localStorage.setItem('erp_low_end_mode', 'true')
  else localStorage.removeItem('erp_low_end_mode')
  reducedMotion.matches = mode === 'reduced-motion'
  connection.saveData = mode === 'save-data'
  initPerformanceMode()
}

function makeEcharts(options, api = echarts) {
  const container = document.createElement('div')
  container.style.cssText = 'width:480px;height:240px'
  Object.defineProperties(container, { clientWidth: { value: 480 }, clientHeight: { value: 240 } })
  document.body.append(container)
  const chart = api.init(container, null, options)
  echartsInstances.push(chart)
  return chart
}

function lineOption() {
  return {
    animation: true,
    animationDuration: 12000,
    animationDurationUpdate: 12000,
    stateAnimation: { duration: 1000 },
    legend: { data: ['Revenue', 'Cost'] },
    tooltip: {
      trigger: 'item', transitionDuration: 2,
      formatter: () => 'ERP chart tooltip',
      axisPointer: { animation: true, animationDuration: 1000 }
    },
    xAxis: { type: 'category', data: ['A', 'B', 'C'], axisPointer: { animation: true } },
    yAxis: { type: 'value' },
    dataZoom: [{ type: 'inside', start: 0, end: 100 }],
    series: [
      { id: 'revenue', name: 'Revenue', type: 'line', animation: true,
        animationDuration: 9000, stateAnimation: { duration: 1500 }, data: [3, 5, 8] },
      { id: 'cost', name: 'Cost', type: 'bar', animation: false, data: [1, 2, 4] }
    ]
  }
}

function makeChartJs(options = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = 480
  canvas.height = 240
  document.body.append(canvas)
  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: ['A', 'B', 'C'],
      datasets: [{ label: 'Revenue', data: [3, 5, 8], animation: { duration: 9000 } }]
    },
    options: {
      ...createLineChartConfig(), responsive: false,
      animation: { duration: 12000 },
      transitions: { active: { animation: { duration: 8000 } } },
      ...options
    }
  })
  chartJsInstances.push(chart)
  return chart
}

describe('ERP immediate chart rendering with the real chart engines', () => {
  test.each([
    ['normal', 2], ['low-end', 1], ['save-data', 1], ['reduced-motion', 2]
  ])('%s disables both engines without reducing clarity unnecessarily', (mode, expectedRatio) => {
    setMode(mode)
    const echartsChart = makeEcharts()
    const submitted = lineOption()
    echartsChart.setOption(submitted)
    const applied = echartsChart.getOption()
    expect(applied.animation).toBe(false)
    expect(applied.animationDurationUpdate).toBe(0)
    expect(applied.stateAnimation.duration).toBe(0)
    expect(applied.series.every(series => series.animation === false)).toBe(true)
    expect(applied.series[0].stateAnimation.duration).toBe(0)
    expect(applied.tooltip[0].transitionDuration).toBe(0)
    expect(applied.xAxis[0].axisPointer.animation).toBe(false)
    expect(echartsChart.getZr().animation.isFinished()).toBe(true)
    expect(echartsChart.getDevicePixelRatio()).toBe(expectedRatio)
    expect(submitted.animation).toBe(true)
    expect(submitted.series[0].animationDuration).toBe(9000)

    const chartJs = makeChartJs()
    expect(chartJs.options.animation).toBe(false)
    expect(animator.has(chartJs)).toBe(false)
    expect(chartJs.currentDevicePixelRatio).toBe(expectedRatio)
    expect(chartJs.data.datasets[0].data).toEqual([3, 5, 8])
  })

  test('later option merges, replacements and lazy updates cannot restore ECharts animation', async () => {
    setMode('normal')
    const chart = makeEcharts()
    chart.setOption(lineOption())
    chart.setOption({ animation: true, series: [{ id: 'revenue', animation: true, data: [10, 20, 30] }] })
    expect(chart.getOption().series[0].data).toEqual([10, 20, 30])
    expect(chart.getOption().series[0].animation).toBe(false)
    expect(chart.getZr().animation.isFinished()).toBe(true)

    chart.setOption(lineOption(), { notMerge: true, lazyUpdate: true })
    chart.resize()
    await flushPromises()
    expect(chart.getOption().animation).toBe(false)
    expect(chart.getOption().series[0].animation).toBe(false)
    expect(chart.getZr().animation.isFinished()).toBe(true)
    chart.setOption({ series: [{ id: 'replaced', type: 'line', animation: true, data: [4, 6, 9] }] }, { replaceMerge: ['series'] })
    expect(chart.getOption().series.filter(Boolean)).toHaveLength(1)
    expect(chart.getOption().series.find(Boolean).animation).toBe(false)
    expect(chart.getZr().animation.isFinished()).toBe(true)
  })

  test('nested graphic keyframes, explicit transitions and custom-series keyframes stay static', () => {
    const chart = makeEcharts()
    chart.setOption({
      graphic: { animation: true, elements: [{
        id: 'root', type: 'group', children: [{
          id: 'circle', type: 'circle', shape: { cx: 40, cy: 40, r: 10 },
          enterFrom: { x: -20 }, leaveTo: { x: 200 },
          enterAnimation: { duration: 9000 }, updateAnimation: { duration: 9000 },
          leaveAnimation: { duration: 9000 },
          keyframeAnimation: [{ duration: 9000, loop: true, keyframes: [{ percent: 1, rotation: 6.28 }] }]
        }]
      }] },
      xAxis: {}, yAxis: {},
      series: [{ type: 'custom', animation: true, data: [[1, 1]], renderItem: () => ({
        type: 'circle', shape: { cx: 100, cy: 80, r: 8 },
        keyframeAnimation: { duration: 9000, loop: true, keyframes: [{ percent: 1, rotation: 6.28 }] }
      }) }]
    })
    expect(chart.getOption().graphic[0].animation).toBe(false)
    expect(chart.getZr().animation.isFinished()).toBe(true)
    chart.setOption({ graphic: { elements: [{ id: 'circle', $action: 'remove' }] } })
    expect(chart.getZr().animation.isFinished()).toBe(true)
  })

  test('ECharts tooltip, legend selection and zoom keep working on the original instance', async () => {
    const chart = makeEcharts()
    chart.setOption(lineOption())
    const reference = makeEcharts(undefined, nativeEcharts)
    expect(Object.getPrototypeOf(chart)).toBe(Object.getPrototypeOf(reference))
    for (const method of ['setOption', 'resize', 'dispose']) {
      expect(Object.hasOwn(chart, method)).toBe(Object.hasOwn(reference, method))
      if (!Object.hasOwn(chart, method)) expect(chart[method]).toBe(reference[method])
      else expect(chart[method].name).toBe(reference[method].name)
    }
    expect(echarts.getInstanceByDom(chart.getDom())).toBe(chart)
    chart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: 1 })
    await flushPromises()
    expect(chart.getDom().textContent).toContain('ERP chart tooltip')
    chart.dispatchAction({ type: 'legendUnSelect', name: 'Cost' })
    chart.dispatchAction({ type: 'dataZoom', start: 25, end: 90 })
    expect(chart.getOption().legend[0].selected.Cost).toBe(false)
    expect(chart.getOption().dataZoom[0]).toMatchObject({ start: 25, end: 90 })
    chart.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: 1 })
    chart.getZr().animation.update()
    expect(chart.getZr().animation.isFinished()).toBe(true)
  })

  test('Chart.js data updates and hover tooltip remain immediate even after replacing options', () => {
    const chart = makeChartJs()
    expect(chart.update).toBe(Chart.prototype.update)
    expect(chart.destroy).toBe(Chart.prototype.destroy)
    chart.data.datasets[0].data = [10, 20, 30]
    chart.options = { ...createLineChartConfig(), responsive: false, animation: { duration: 20000 } }
    chart.update()
    expect(chart.options.animation).toBe(false)
    expect(animator.has(chart)).toBe(false)
    const point = chart.getDatasetMeta(0).data[1]
    chart.setActiveElements([{ datasetIndex: 0, index: 1 }])
    chart.tooltip.setActiveElements([{ datasetIndex: 0, index: 1 }], { x: point.x, y: point.y })
    chart.update('active')
    expect(chart.tooltip.dataPoints[0].raw).toBe(20)
    expect(animator.has(chart)).toBe(false)
    expect(chart.getActiveElements()[0].index).toBe(1)
  })

  test('performance changes preserve existing canvases and affect only new canvas resolution', async () => {
    setMode('normal')
    const originalEcharts = makeEcharts()
    originalEcharts.setOption(lineOption())
    originalEcharts.dispatchAction({ type: 'legendUnSelect', name: 'Cost' })
    originalEcharts.dispatchAction({ type: 'dataZoom', start: 25, end: 90 })
    const originalJs = makeChartJs()
    originalJs.setDatasetVisibility(0, false)
    originalJs.update()

    setMode('low-end')
    await flushPromises()
    expect(getPerformanceMode().lowEnd).toBe(true)
    const lowEcharts = makeEcharts()
    lowEcharts.setOption(lineOption())
    const lowJs = makeChartJs()
    expect(originalEcharts.getDevicePixelRatio()).toBe(2)
    expect(originalJs.currentDevicePixelRatio).toBe(2)
    expect(lowEcharts.getDevicePixelRatio()).toBe(1)
    expect(lowJs.currentDevicePixelRatio).toBe(1)
    expect(originalEcharts.getOption().legend[0].selected.Cost).toBe(false)
    expect(originalEcharts.getOption().dataZoom[0]).toMatchObject({ start: 25, end: 90 })
    expect(originalJs.isDatasetVisible(0)).toBe(false)

    setMode('normal')
    await flushPromises()
    expect(lowEcharts.getDevicePixelRatio()).toBe(1)
    expect(lowJs.currentDevicePixelRatio).toBe(1)
    expect(makeEcharts().getDevicePixelRatio()).toBe(2)
    expect(makeChartJs().currentDevicePixelRatio).toBe(2)
  })

  test('explicit resolution is preserved or capped without increasing a smaller requested canvas', () => {
    setMode('normal')
    expect(makeEcharts({ devicePixelRatio: 1.5 }).getDevicePixelRatio()).toBe(1.5)
    expect(makeChartJs({ devicePixelRatio: 1.5 }).currentDevicePixelRatio).toBe(1.5)
    setMode('low-end')
    expect(makeEcharts({ devicePixelRatio: 3 }).getDevicePixelRatio()).toBe(1)
    expect(makeChartJs({ devicePixelRatio: 3 }).currentDevicePixelRatio).toBe(1)
    expect(makeEcharts({ devicePixelRatio: 0.75 }).getDevicePixelRatio()).toBe(0.75)
    expect(makeChartJs({ devicePixelRatio: 0.75 }).currentDevicePixelRatio).toBe(0.75)
  })

  test('destroyed charts receive no work when themes or preferences change', async () => {
    const chart = makeChartJs()
    const ecChart = makeEcharts()
    ecChart.setOption(lineOption())
    chart.destroy()
    ecChart.dispose()
    const update = vi.spyOn(chart, 'update')
    const resize = vi.spyOn(ecChart, 'resize')
    setMode('low-end')
    document.documentElement.style.setProperty('--color-primary', '#112233')
    await flushPromises()
    expect(update).not.toHaveBeenCalled()
    expect(resize).not.toHaveBeenCalled()
  })

  test('application modules cannot bypass the shared chart entries', () => {
    const sourceRoot = resolve('src')
    const engineEntries = new Set(['utils/chartCore.js', 'utils/echartsCore.js'])
    const bypasses = readdirSync(sourceRoot, { recursive: true })
      .filter(path => /\.(js|vue)$/.test(path))
      .filter(path => !engineEntries.has(path.replaceAll('\\', '/')))
      .filter(path => /(?:from\s*|import\s*\(|require\s*\()\s*['"](?:echarts|chart\.js)(?:\/[^'"]*)?['"]/.test(
        readFileSync(resolve(sourceRoot, path), 'utf8')
      ))
    expect(bypasses).toEqual([])
  })
})
