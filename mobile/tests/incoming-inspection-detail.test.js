import { reactive } from 'vue'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import IncomingDetail from '@/views/quality/IncomingDetail.vue'
import { qualityApi } from '@/api'
import { showConfirmDialog } from 'vant'

const routing = vi.hoisted(() => ({ route: null }))
vi.mock('vue-router', () => ({ useRoute: () => routing.route, useRouter: () => ({ back: vi.fn() }) }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ user: { id: 5, realName: '检验员' } }) }))
vi.mock('@/api', () => ({ qualityApi: {
  getIncomingInspection: vi.fn(), getIncomingInspections: vi.fn(), getInspectionItems: vi.fn(),
  updateIncomingInspection: vi.fn(), startInspection: vi.fn(),
} }))
vi.mock('vant', async importOriginal => ({ ...await importOriginal(), showToast: vi.fn(), showConfirmDialog: vi.fn(async () => {}) }))
const record = id => ({ id: Number(id), status: 'in_progress', isFullInspection: true, sampleQuantity: 100, quantity: 100, qualifiedQuantity: 100,
  unqualifiedQuantity: 0, attachments: [], items: [{ id: 7, itemName: '长度', standard: '≥0', type: 'dimension',
    actualValue: 0, measure1: 0, measure2: 10.2, measure3: 10.4, result: 'passed', toleranceLower: 0,
    measurements: [{ sample_no: 1, measured_value: 0 }, { sample_no: 2, measured_value: 10.2 }, { sample_no: 3, measured_value: 10.4 }],
  }] })
let wrapper
beforeEach(() => {
  routing.route = reactive({ params: { id: '10' }, query: {} })
  qualityApi.getIncomingInspection.mockReset().mockImplementation(async id => ({ data: record(id) }))
  qualityApi.updateIncomingInspection.mockReset().mockResolvedValue({ data: {} })
  qualityApi.startInspection.mockReset().mockResolvedValue({ data: {} })
  qualityApi.getIncomingInspections.mockClear(); showConfirmDialog.mockClear()
})
afterEach(() => wrapper?.unmount())
async function open() { wrapper = shallowMount(IncomingDetail); await flushPromises(); return wrapper.vm }

test('a failed detail never falls back to another record or query data', async () => {
  routing.route.query.data = JSON.stringify(record('99'))
  qualityApi.getIncomingInspection.mockRejectedValue({ response: { status: 404 } })
  const view = await open()
  await view.handleStart(); await view.handleSubmit()
  expect(view.inspection).toBe(null)
  expect(qualityApi.getIncomingInspections).not.toHaveBeenCalled()
  expect(qualityApi.startInspection).not.toHaveBeenCalled()
  expect(qualityApi.updateIncomingInspection).not.toHaveBeenCalled()
})

test('preserves all existing samples and zero values when completing an inspection', async () => {
  const view = await open()
  await view.handleSubmit()
  const [id, body] = qualityApi.updateIncomingInspection.mock.calls[0]
  expect(id).toBe(10)
  expect(body.items[0]).toMatchObject({ measure1: 0, measure2: 10.2, measure3: 10.4, toleranceLower: 0 })
  expect(body.items[0].measurements.map(item => item.measuredValue)).toEqual([0, 10.2, 10.4])
})

test('editing the first measurement retains all other samples', async () => {
  const view = await open()
  view.inspectItems[0].actualValue = '11'
  await view.handleSubmit()
  expect(qualityApi.updateIncomingInspection.mock.calls[0][1].items[0].measurements.map(item => item.measuredValue)).toEqual(['11', 10.2, 10.4])
})

test('preserves six samples when the separate actualValue field is empty', async () => {
  const data = record('10')
  Object.assign(data.items[0], { actualValue: '', measure1: 10, measure2: 11, measure3: 12, measure4: 13, measure5: 14, measure6: 15, measurements: [] })
  qualityApi.getIncomingInspection.mockResolvedValue({ data })
  const view = await open()
  expect(view.inspectItems[0].actualValue).toBe(10)
  await view.handleSubmit()
  expect(qualityApi.updateIncomingInspection.mock.calls[0][1].items[0].measurements.map(item => item.measuredValue)).toEqual([10, 11, 12, 13, 14, 15])
})

test('ignores details arriving after route identity changed', async () => {
  let resolve
  qualityApi.getIncomingInspection.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const view = await open()
  routing.route.params.id = '11'; await flushPromises()
  resolve({ data: record('10') }); await flushPromises()
  expect(view.inspection.id).toBe(11)
})

test('does not submit when the route changes during confirmation', async () => {
  const view = await open()
  let confirm
  showConfirmDialog.mockImplementationOnce(() => new Promise(done => { confirm = done }))
  const submit = view.handleSubmit()
  routing.route.params.id = '11'; await flushPromises()
  confirm(); await submit
  expect(qualityApi.updateIncomingInspection).not.toHaveBeenCalled()
})
