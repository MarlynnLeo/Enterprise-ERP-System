import { shallowMount, mount, flushPromises } from '@vue/test-utils'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import { Uploader, showImagePreview, showToast } from 'vant'
import AnomalyImages from '@/components/AnomalyImages.vue'
import { productionApi } from '@/api'

vi.mock('@/api', () => ({ productionApi: { uploadAnomalyImage: vi.fn(), downloadAnomalyImage: vi.fn() } }))
vi.mock('vant', async original => ({ ...await original(), showToast: vi.fn(), showImagePreview: vi.fn() }))

let wrapper
const photo = name => ({ file: new File(['photo'], name, { type: 'image/jpeg' }) })
async function open(props = {}, real = false) {
  wrapper = (real ? mount : shallowMount)(AnomalyImages, { props })
  await flushPromises()
}
async function select(items) {
  wrapper.findComponent(Uploader).vm.$emit('update:modelValue', items)
  await wrapper.vm.$nextTick()
}
beforeEach(() => {
  productionApi.uploadAnomalyImage.mockReset().mockImplementation(async data => ({ data: { url: `/uploads/anomaly-reports/${data.get('file').name}` } }))
  productionApi.downloadAnomalyImage.mockReset().mockResolvedValue({ data: new Blob(['photo'], { type: 'image/jpeg' }) })
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => wrapper?.unmount())

test('keeps uploaded paths for report retries and uploads only failed images again', async () => {
  await open()
  productionApi.uploadAnomalyImage.mockRejectedValueOnce(new Error('offline'))
  await select([photo('failed.jpg'), photo('saved.jpg')])
  await expect(wrapper.vm.uploadPending()).rejects.toThrow('部分图片上传失败')
  expect(await wrapper.vm.uploadPending()).toEqual(['/uploads/anomaly-reports/failed.jpg', '/uploads/anomaly-reports/saved.jpg'])
  expect(await wrapper.vm.uploadPending()).toHaveLength(2)
  expect(productionApi.uploadAnomalyImage.mock.calls.map(([data]) => data.get('file').name)).toEqual(['failed.jpg', 'saved.jpg', 'failed.jpg'])
})

test('deleting an uploaded draft photo removes it from the report payload', async () => {
  await open()
  const first = photo('first.jpg')
  const second = photo('second.jpg')
  await select([first, second])
  await wrapper.vm.uploadPending()
  await select([second])
  expect(await wrapper.vm.uploadPending()).toEqual(['/uploads/anomaly-reports/second.jpg'])
  expect(productionApi.uploadAnomalyImage).toHaveBeenCalledTimes(2)
})

test('camera shares the gallery queue and enforces the combined five photo limit', async () => {
  await open()
  const camera = wrapper.findAllComponents(Uploader)[1]
  expect(camera.props('capture')).toBe('environment')
  await camera.props('afterRead')(photo('camera.jpg'))
  expect(await wrapper.vm.uploadPending()).toEqual(['/uploads/anomaly-reports/camera.jpg'])
  await select(Array.from({ length: 5 }, (_, i) => photo(`${i}.jpg`)))
  expect(wrapper.findAllComponents(Uploader)).toHaveLength(1)
  expect(wrapper.findComponent(Uploader).props('beforeRead')(photo('sixth.jpg').file)).toBe(false)
  expect(showToast).toHaveBeenCalledWith('最多上传 5 张图片')
})

test('rejects unsupported filename and MIME combinations before upload', async () => {
  await open()
  const validate = wrapper.findComponent(Uploader).props('beforeRead')
  expect(validate(photo('camera.jpg').file)).toBe(true)
  expect(validate(new File(['x'], 'photo.heic', { type: 'image/heic' }))).toBe(false)
  expect(validate(new File(['x'], 'photo.jpg', { type: 'application/pdf' }))).toBe(false)
  expect(validate(new File(['x'], 'photo.svg', { type: 'image/svg+xml' }))).toBe(false)
})

test('oversized files from the actual picker cannot enter the upload queue', async () => {
  await open({}, true)
  const file = photo('large.jpg').file
  Object.defineProperty(file, 'size', { value: 5 * 1024 * 1024 + 1 })
  const input = wrapper.find('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await vi.waitFor(() => expect(showToast).toHaveBeenCalledWith('每张图片不能超过 5MB'))
  expect(await wrapper.vm.uploadPending()).toEqual([])
  expect(productionApi.uploadAnomalyImage).not.toHaveBeenCalled()
})

test('downloads persisted images with authentication and previews them, releasing URLs on close', async () => {
  await open({ images: ['/uploads/anomaly-reports/photo.jpg'], editable: false })
  expect(productionApi.downloadAnomalyImage).toHaveBeenCalledWith('/uploads/anomaly-reports/photo.jpg')
  expect(wrapper.find('img').attributes('src')).toBe('blob:preview')
  await wrapper.find('button').trigger('click')
  expect(showImagePreview).toHaveBeenCalledWith({ images: ['blob:preview'], startPosition: 0 })
  wrapper.unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
})

test('ignores stale image responses after switching reports', async () => {
  let finish
  productionApi.downloadAnomalyImage.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await open({ images: ['/uploads/anomaly-reports/old.jpg'], editable: false })
  await wrapper.setProps({ images: [] })
  finish({ data: new Blob(['photo'], { type: 'image/jpeg' }) })
  await flushPromises()
  expect(wrapper.findAll('img')).toHaveLength(0)
  expect(URL.createObjectURL).not.toHaveBeenCalled()
})
