import { afterEach, describe, expect, test, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { useCharts, useDashboard } from '@/composables/useDashboard'
import { ElMessage } from 'element-plus/es/components/message/index'

vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }))

let wrapper
afterEach(() => { wrapper?.unmount(); vi.useRealTimers() })
const deferred = () => {
  let resolve, reject
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail })
  return { promise, resolve, reject }
}
const harness = (setup) => {
  let state
  wrapper = mount(defineComponent({ setup() { state = setup(); return () => h('div') } }))
  return state
}

describe('dashboard asynchronous lifecycle', () => {
  test('does not register refresh timers or visibility handlers after unmount during data loading', async () => {
    const request = deferred()
    const interval = vi.spyOn(globalThis, 'setInterval')
    const listen = vi.spyOn(document, 'addEventListener')
    const state = harness(() => useDashboard('production', () => request.promise))
    wrapper.unmount()
    interval.mockClear()
    listen.mockClear()
    request.resolve({ plans: { total: 10 } })
    await flushPromises()
    expect(interval).not.toHaveBeenCalled()
    expect(listen.mock.calls.filter(([name]) => name === 'visibilitychange')).toEqual([])
    expect(state.lastUpdated.value).toBeNull()
  })

  test('keeps the newest snapshot and loading state when requests finish out of order', async () => {
    const old = deferred(), latest = deferred()
    const loader = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise)
    const state = harness(() => useDashboard('production', loader, { immediate: false, autoRefresh: false }))
    const first = state.loadData()
    const second = state.loadData()
    old.reject(new Error('stale failure'))
    await first
    expect(state.loading.value).toBe(true)
    expect(state.error.value).toBeNull()
    expect(ElMessage.warning).not.toHaveBeenCalled()
    latest.resolve({ plans: { total: 12 } })
    await second
    expect(state.statistics.plans.total).toBe(12)
    expect(state.loading.value).toBe(false)
  })

  test('keeps automatic refresh alive after the initial request fails', async () => {
    vi.useFakeTimers()
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const loader = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ plans: { total: 7 } })
    const state = harness(() => useDashboard('production', loader, { refreshInterval: 1000, showErrorMessage: false }))
    await flushPromises()
    expect(state.error.value).toBeInstanceOf(Error)
    await vi.advanceTimersByTimeAsync(1000)
    expect(loader).toHaveBeenCalledTimes(2)
    expect(state.statistics.plans.total).toBe(7)
    expect(state.error.value).toBeNull()
  })

  test('retains real statistics on refresh failure and invalidates pending data on reset', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const pending = deferred()
    const failure = new Error('offline')
    const loader = vi.fn().mockResolvedValueOnce({ plans: { total: 9 } }).mockRejectedValueOnce(failure).mockReturnValueOnce(pending.promise)
    const state = harness(() => useDashboard('production', loader, { immediate: false, autoRefresh: false, showErrorMessage: false }))
    await state.loadData()
    const updated = state.lastUpdated.value
    await expect(state.loadData()).rejects.toBe(failure)
    expect(state.statistics.plans.total).toBe(9)
    expect(state.lastUpdated.value).toBe(updated)
    const request = state.loadData()
    state.reset()
    pending.resolve({ plans: { total: 99 } })
    await request
    expect(state.statistics.plans.total).toBe(0)
    expect(state.lastUpdated.value).toBeNull()
  })

  test('does not announce a manual refresh after unmount', async () => {
    vi.useFakeTimers()
    const request = deferred()
    const state = harness(() => useDashboard('production', () => request.promise, { immediate: false, autoRefresh: false }))
    state.refresh()
    await vi.advanceTimersByTimeAsync(1000)
    wrapper.unmount()
    request.resolve({ plans: { total: 3 } })
    await flushPromises()
    expect(ElMessage.success).not.toHaveBeenCalled()
  })

  test('preserves dynamic chart colors when updating reactive data', async () => {
    const state = harness(() => useCharts({ trend: ref(document.createElement('canvas')) }))
    const color = () => '#112233'
    const data = ref({ labels: ['A'], datasets: [{ data: [5], borderColor: color }] })
    const chart = { data: {}, update: vi.fn(), destroy: vi.fn() }
    await state.initChart('trend', () => chart)
    state.updateChart('trend', data.value)
    expect(chart.data.datasets[0].borderColor).toBe(color)
    chart.data.datasets[0].data.push(10)
    expect(data.value.datasets[0].data).toEqual([5])
  })

  test('disposes a chart returned after its owner unmounts', async () => {
    const state = harness(() => useCharts({ trend: ref(document.createElement('canvas')) }))
    const request = deferred()
    const instance = { destroy: vi.fn() }
    const pending = state.initAllCharts({ trend: () => request.promise })
    await nextTick()
    wrapper.unmount()
    request.resolve(instance)
    await pending
    expect(instance.destroy).toHaveBeenCalledTimes(1)
    expect(state.chartInstances.trend).toBeUndefined()
    expect(state.chartsReady.value).toBe(false)
  })

  test('retains only the latest initializer when requests complete out of order', async () => {
    const state = harness(() => useCharts({ trend: ref(document.createElement('canvas')) }))
    const old = deferred()
    let oldIsCurrent
    const oldChart = { destroy: vi.fn() }
    const newest = { destroy: vi.fn() }
    const previous = state.initChart('trend', ({ isCurrent }) => { oldIsCurrent = isCurrent; return old.promise })
    await nextTick()
    await state.initChart('trend', () => newest)
    expect(oldIsCurrent()).toBe(false)
    old.resolve(oldChart)
    await previous
    expect(oldChart.destroy).toHaveBeenCalledTimes(1)
    expect(state.chartInstances.trend).toBe(newest)
    expect(newest.destroy).not.toHaveBeenCalled()
  })
})
