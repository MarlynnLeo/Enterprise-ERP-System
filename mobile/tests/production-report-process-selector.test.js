import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import Selector from '@/views/production/components/ReportProcessSelector.vue'
import { productionApi } from '@/api'
vi.mock('@/api', () => ({ productionApi: { getTaskReportProcesses: vi.fn(), getTaskReportStats: vi.fn() } }))
vi.mock('vant', () => ({
  Field: { template: '<div><slot name="input" /></div>' },
  Cell: { props: ['title', 'value'], template: '<div>{{ title }} {{ value }}</div>' },
}))
let wrapper
beforeEach(() => {
  productionApi.getTaskReportProcesses.mockResolvedValue({ data: [
    { id: 1, sequence: 1, processName: '前道', status: 'completed' },
    { id: 2, sequence: 2, processName: '末道', status: 'in_progress' },
  ] })
  productionApi.getTaskReportStats.mockResolvedValue({ data: { reporting_mode: 'process', report_count: 1, remaining_quantity: 100 } })
})
afterEach(() => wrapper?.unmount())
test('selects the active process and keeps its identity ready for both mobile report forms', async () => {
  wrapper = mount(Selector, { props: { taskId: 42 } })
  await flushPromises()
  expect(wrapper.emitted('change').at(-1)[0]).toEqual({ ready: true, processId: 2, processName: '末道' })
  expect(productionApi.getTaskReportStats).toHaveBeenLastCalledWith(42, { processId: '2' })
  expect(wrapper.find('option[value=""]').element.disabled).toBe(true)
  expect(wrapper.text()).toContain('本工序剩余可报工：100')
})
test('load failures block reporting and provide retry instead of silently dropping the process', async () => {
  productionApi.getTaskReportProcesses.mockRejectedValue(new Error('网络错误'))
  wrapper = mount(Selector, { props: { taskId: 42 } })
  await flushPromises()
  expect(wrapper.emitted('change').at(-1)[0].ready).toBe(false)
  expect(wrapper.text()).toContain('重试')
})
