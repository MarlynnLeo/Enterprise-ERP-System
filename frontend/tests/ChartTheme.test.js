import { afterEach, describe, expect, test, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import Chart from '@/utils/chartCore'
import { applyTheme, chartColors, createLineChartConfig, createPieChartConfig } from '@/utils/chartConfig'

let chart
afterEach(() => {
  chart?.destroy()
  chart = undefined
  document.documentElement.removeAttribute('style')
})

const createCanvas = () => {
  const canvas = document.createElement('canvas')
  const context = new Proxy({
    canvas,
    measureText: () => ({ width: 20 }),
    getLineDash: () => []
  }, { get: (target, key) => key in target ? target[key] : () => {} })
  vi.spyOn(canvas, 'getContext').mockReturnValue(context)
  return canvas
}

describe('canvas chart theme integration', () => {
  test('repaints an existing Chart.js canvas with new theme tokens and keeps its data', async () => {
    document.documentElement.style.setProperty('--color-primary', '#112233')
    document.documentElement.style.setProperty('--color-text-secondary', '#667788')
    const canvas = createCanvas()
    chart = new Chart(canvas, {
      type: 'line',
      data: { labels: ['January', 'February'], datasets: [{ data: [12, 18], borderColor: () => chartColors.primary[0] }] },
      options: { ...createLineChartConfig(), responsive: false, animation: false }
    })
    expect(chart.getDatasetMeta(0).dataset.options.borderColor).toBe('#112233')
    expect(chart.scales.x.options.ticks.color).toBe('#667788')
    const update = vi.spyOn(chart, 'update')
    document.documentElement.style.setProperty('--color-primary', '#aabbcc')
    document.documentElement.style.setProperty('--color-text-secondary', '#ddeeff')
    await flushPromises()
    expect(update).toHaveBeenCalledWith('none')
    expect(chart.getDatasetMeta(0).dataset.options.borderColor).toBe('#aabbcc')
    expect(chart.scales.x.options.ticks.color).toBe('#ddeeff')
    expect(chart.data.datasets[0].data).toEqual([12, 18])
    chart.destroy()
    update.mockClear()
    document.documentElement.style.setProperty('--color-primary', '#000000')
    await flushPromises()
    expect(update).not.toHaveBeenCalled()
    chart = undefined
  })

  test('preserves formatter callbacks and independent options when cloning theme configs', () => {
    const formatter = (context) => String(context.raw)
    const first = createLineChartConfig({ tooltipFormatter: formatter })
    const second = createLineChartConfig()
    first.scales.y.max = 100
    expect(second.scales.y.max).toBeUndefined()
    expect(applyTheme(first, 'dark').plugins.tooltip.callbacks.label).toBe(formatter)
    expect(typeof first.scales.y.ticks.color).toBe('function')
    const pie = createPieChartConfig()
    expect(pie.plugins.tooltip.callbacks.label({ label: 'Empty', raw: 0, dataset: { data: [0] } })).toBe('Empty: 0%')
  })

  test('updates pie legend defaults and segment palettes without recreating the chart', async () => {
    document.documentElement.style.setProperty('--color-text-regular', '#223344')
    document.documentElement.style.setProperty('--color-success', '#224422')
    chart = new Chart(createCanvas(), {
      type: 'pie',
      data: { labels: ['A', 'B'], datasets: [{ data: [3, 5], backgroundColor: () => chartColors.primary }] },
      options: { ...createPieChartConfig(), animation: false, responsive: false }
    })
    expect(chart.legend.legendItems[0].fontColor).toBe('#223344')
    expect(chart.getDatasetMeta(0).data[1].options.backgroundColor).toBe('#224422')
    document.documentElement.style.setProperty('--color-text-regular', '#ddeeff')
    document.documentElement.style.setProperty('--color-success', '#aaddaa')
    await flushPromises()
    expect(chart.legend.legendItems[0].fontColor).toBe('#ddeeff')
    expect(chart.getDatasetMeta(0).data[1].options.backgroundColor).toBe('#aaddaa')
  })
})
