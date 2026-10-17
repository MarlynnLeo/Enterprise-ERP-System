import { shallowMount, flushPromises } from '@vue/test-utils'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import { Button, Field, Search, Uploader } from 'vant'
import AnomalyReport from '@/views/production/AnomalyReport.vue'
import AnomalyImages from '@/components/AnomalyImages.vue'
import { productionApi } from '@/api'

vi.mock('@/api', () => ({ productionApi: {
  getAnomalies: vi.fn(), getAnomalyStats: vi.fn(), getAnomalyTaskOptions: vi.fn(),
  getAnomalyById: vi.fn(), createAnomaly: vi.fn(), uploadAnomalyImage: vi.fn(), downloadAnomalyImage: vi.fn()
} }))
vi.mock('vant', async original => ({ ...await original(), showToast: vi.fn(), showImagePreview: vi.fn() }))

let wrapper
const task = { id: 42, code: 'TASK-42', planCode: 'PLAN-11', productCode: 'P01', productName: '阀门', specification: 'DN20', processName: '装配' }
const field = label => wrapper.findAllComponents(Field).find(item => item.props('label') === label)
const submit = () => wrapper.findAllComponents(Button).find(item => item.text() === '提交上报').trigger('click')
async function open() {
  wrapper = shallowMount(AnomalyReport, {
    global: { renderStubDefaultSlot: true, stubs: { AnomalyImages: false, 'van-search': false, 'van-nav-bar': { template: '<nav><slot name="right" /></nav>' } } }
  })
  await flushPromises()
  await wrapper.find('[name="plus"]').trigger('click')
  field('标题').vm.$emit('update:modelValue', '电机异响')
  field('描述').vm.$emit('update:modelValue', '运转后出现异响，请检查')
  await wrapper.vm.$nextTick()
}
async function selectPhoto() {
  wrapper.findComponent(AnomalyImages).findComponent(Uploader).vm.$emit('update:modelValue', [
    { file: new File(['photo'], '现场.jpg', { type: 'image/jpeg' }) }
  ])
  await wrapper.vm.$nextTick()
}
beforeEach(() => {
  Object.values(productionApi).forEach(mock => mock.mockReset())
  productionApi.getAnomalies.mockResolvedValue({ data: { list: [{ id: 9, code: 'AN-9', title: '旧列表标题', status: 'open' }] } })
  productionApi.getAnomalyStats.mockResolvedValue({ data: { open: 1 } })
  productionApi.getAnomalyTaskOptions.mockResolvedValue({ data: { list: [task], total: 1 } })
  productionApi.createAnomaly.mockResolvedValue({ data: { id: 10 } })
  productionApi.uploadAnomalyImage.mockResolvedValue({ data: { url: '/uploads/anomaly-reports/photo.jpg' } })
  productionApi.downloadAnomalyImage.mockResolvedValue({ data: new Blob(['photo'], { type: 'image/jpeg' }) })
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => wrapper?.unmount())

test('selects a production task with plan and product context before submitting', async () => {
  await open()
  await field('关联任务').trigger('click')
  await flushPromises()
  expect(productionApi.getAnomalyTaskOptions).toHaveBeenCalledWith({ keyword: '', page: 1, pageSize: 20 })
  expect(wrapper.find('.task-option').text()).toContain('PLAN-11')
  await wrapper.find('.task-option').trigger('click')
  expect(wrapper.find('.task-context').text()).toContain('P01 · 阀门 · DN20')
  await submit()
  await flushPromises()
  expect(productionApi.createAnomaly).toHaveBeenCalledWith(expect.objectContaining({ taskId: 42, images: [], title: '电机异响' }))
})

test('allows general workshop anomalies without a linked task', async () => {
  await open()
  await submit()
  await flushPromises()
  expect(productionApi.createAnomaly).toHaveBeenCalledWith(expect.objectContaining({ taskId: null, images: [] }))
})

test('retains form and successfully uploaded images when create fails, and prevents duplicate submit', async () => {
  await open()
  await selectPhoto()
  let finishUpload
  productionApi.uploadAnomalyImage.mockImplementationOnce(() => new Promise(resolve => { finishUpload = resolve }))
  productionApi.createAnomaly.mockRejectedValueOnce(new Error('create failed'))
  await submit()
  await submit()
  expect(productionApi.uploadAnomalyImage).toHaveBeenCalledTimes(1)
  expect(productionApi.createAnomaly).not.toHaveBeenCalled()
  finishUpload({ data: { url: '/uploads/anomaly-reports/photo.jpg' } })
  await flushPromises()
  expect(field('标题').props('modelValue')).toBe('电机异响')
  await submit()
  await flushPromises()
  expect(productionApi.uploadAnomalyImage).toHaveBeenCalledTimes(1)
  expect(productionApi.createAnomaly).toHaveBeenCalledTimes(2)
  expect(productionApi.createAnomaly).toHaveBeenLastCalledWith(expect.objectContaining({ images: ['/uploads/anomaly-reports/photo.jpg'] }))
})

test('upload failure never creates an incomplete report and the user can retry', async () => {
  await open()
  await selectPhoto()
  productionApi.uploadAnomalyImage.mockRejectedValueOnce(new Error('offline'))
  await submit()
  await flushPromises()
  expect(productionApi.createAnomaly).not.toHaveBeenCalled()
  expect(field('描述').props('modelValue')).toBe('运转后出现异响，请检查')
  await submit()
  await flushPromises()
  expect(productionApi.createAnomaly).toHaveBeenCalledTimes(1)
})

test('searches tasks and ignores an earlier request that finishes late', async () => {
  await open()
  let finishEarlier
  productionApi.getAnomalyTaskOptions.mockImplementationOnce(() => new Promise(resolve => { finishEarlier = resolve }))
  await field('关联任务').trigger('click')
  wrapper.findComponent(Search).vm.$emit('update:modelValue', '新版产品')
  await wrapper.vm.$nextTick()
  await wrapper.find('.task-search-button').trigger('click')
  await flushPromises()
  expect(productionApi.getAnomalyTaskOptions).toHaveBeenLastCalledWith({ keyword: '新版产品', page: 1, pageSize: 20 })
  finishEarlier({ data: { list: [{ id: 1, code: '过时任务' }], total: 1 } })
  await flushPromises()
  expect(wrapper.find('.task-option').text()).toContain('TASK-42')
  expect(wrapper.text()).not.toContain('过时任务')
})

test('fetches full details and renders linked task and authenticated photo preview', async () => {
  await open()
  productionApi.getAnomalyById.mockResolvedValue({ data: {
    id: 9, code: 'AN-9', title: '最新详情标题', status: 'open', taskId: 42, taskCode: 'TASK-42',
    planCode: 'PLAN-11', productName: '阀门', images: ['/uploads/anomaly-reports/photo.jpg']
  } })
  await wrapper.find('.anomaly-card').trigger('click')
  await flushPromises()
  expect(productionApi.getAnomalyById).toHaveBeenCalledWith(9)
  expect(wrapper.find('.detail-content').text()).toContain('最新详情标题')
  expect(wrapper.find('.detail-content').text()).toContain('TASK-42')
  expect(wrapper.find('.detail-content').text()).toContain('PLAN-11')
  expect(wrapper.find('.detail-content img').attributes('src')).toBe('blob:preview')
})
