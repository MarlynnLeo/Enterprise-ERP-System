import { mount, shallowMount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { Uploader, showToast } from 'vant'
import MaterialImages from '@/components/MaterialImages.vue'
import { baseDataApi } from '@/api'

vi.mock('@/api', () => ({ baseDataApi: {
  getMaterialAttachments: vi.fn(),
  uploadMaterialAttachment: vi.fn()
} }))
vi.mock('vant', async importOriginal => ({
  ...await importOriginal(), showToast: vi.fn(), showImagePreview: vi.fn()
}))

let wrapper
const photo = name => ({ file: new File(['photo'], name, { type: 'image/jpeg' }) })
async function open(props = {}, realUploader = false) {
  wrapper = (realUploader ? mount : shallowMount)(MaterialImages, {
    props,
    global: { stubs: realUploader ? { Uploader: false } : {} }
  })
  await flushPromises()
  return wrapper
}
async function selectPhotos(items) {
  wrapper.findComponent(Uploader).vm.$emit('update:modelValue', items)
  await wrapper.vm.$nextTick()
}
beforeEach(() => {
  baseDataApi.getMaterialAttachments.mockReset().mockResolvedValue({ data: [] })
  baseDataApi.uploadMaterialAttachment.mockReset().mockImplementation(async (id, form) => ({
    data: { id: 42, file_name: form.get('file').name, file_path: '/uploads/saved.jpg', file_type: 'image/jpeg' }
  }))
  showToast.mockClear()
})
afterEach(() => wrapper?.unmount())

test('saving uploads selected images to the saved material and never uploads them twice', async () => {
  await open()
  await selectPhotos([photo('first.jpg'), photo('second.jpg')])
  expect(baseDataApi.uploadMaterialAttachment).not.toHaveBeenCalled()
  expect(await wrapper.vm.uploadPending(17)).toBe(true)
  expect(wrapper.vm.hasPending()).toBe(false)
  expect(await wrapper.vm.uploadPending(17)).toBe(true)
  expect(baseDataApi.uploadMaterialAttachment).toHaveBeenCalledTimes(2)
  expect(baseDataApi.uploadMaterialAttachment.mock.calls.map(([id, form]) => [id, form.get('file').name]))
    .toEqual([[17, 'first.jpg'], [17, 'second.jpg']])
  expect(wrapper.emitted('busy-change')).toEqual([[true], [false]])
})

test('a partial failure keeps only failed images for retry', async () => {
  await open()
  baseDataApi.uploadMaterialAttachment.mockRejectedValueOnce(new Error('offline'))
  await selectPhotos([photo('retry.jpg'), photo('success.jpg')])
  expect(await wrapper.vm.uploadPending(17)).toBe(false)
  expect(wrapper.vm.hasPending()).toBe(true)
  expect(await wrapper.vm.uploadPending(17)).toBe(true)
  expect(baseDataApi.uploadMaterialAttachment.mock.calls.map(([, form]) => form.get('file').name))
    .toEqual(['retry.jpg', 'success.jpg', 'retry.jpg'])
  expect(wrapper.vm.hasPending()).toBe(false)
})

test('requires a saved material before uploading and rejects concurrent duplicate submission', async () => {
  await open()
  await selectPhotos([photo('one.jpg')])
  expect(await wrapper.vm.uploadPending('')).toBe(false)
  expect(baseDataApi.uploadMaterialAttachment).not.toHaveBeenCalled()
  let finish
  baseDataApi.uploadMaterialAttachment.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const first = wrapper.vm.uploadPending(17)
  expect(await wrapper.vm.uploadPending(17)).toBe(false)
  finish({ data: { id: 7, file_name: 'one.jpg', file_path: '/uploads/one.jpg' } })
  expect(await first).toBe(true)
  expect(baseDataApi.uploadMaterialAttachment).toHaveBeenCalledTimes(1)
})

test('validates MIME and filename together, including unsupported phone HEIC images', async () => {
  await open()
  const validate = wrapper.findComponent(Uploader).props('beforeRead')
  expect(validate(new File(['x'], 'camera.JPG', { type: 'image/jpeg' }))).toBe(true)
  expect(validate(new File(['x'], 'camera.png'))).toBe(true)
  expect(validate(new File(['x'], 'camera.heic', { type: 'image/heic' }))).toBe(false)
  expect(validate(new File(['x'], 'document.pdf', { type: 'image/jpeg' }))).toBe(false)
  expect(validate(new File(['x'], 'camera.jpg', { type: 'application/pdf' }))).toBe(false)
})

test('taking a photo on an existing material uploads immediately', async () => {
  await open({ materialId: 17, immediate: true })
  const camera = wrapper.findAllComponents(Uploader)[1]
  expect(camera.props('capture')).toBe('environment')
  await camera.props('afterRead')(photo('camera.jpg'))
  expect(baseDataApi.uploadMaterialAttachment).toHaveBeenCalledTimes(1)
  expect(baseDataApi.uploadMaterialAttachment.mock.calls[0][0]).toBe(17)
  expect(baseDataApi.uploadMaterialAttachment.mock.calls[0][1].get('file').name).toBe('camera.jpg')
  expect(wrapper.vm.hasPending()).toBe(false)
})

test('oversized images selected through the real uploader do not enter the upload queue', async () => {
  await open({}, true)
  const oversized = new File(['x'], 'large.jpg', { type: 'image/jpeg' })
  Object.defineProperty(oversized, 'size', { value: 50 * 1024 * 1024 + 1 })
  const input = wrapper.find('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [oversized], configurable: true })
  await input.trigger('change')
  await flushPromises()
  await vi.waitFor(() => expect(showToast).toHaveBeenCalledWith('每张图片不能超过 50MB'))
  expect(wrapper.vm.hasPending()).toBe(false)
  expect(baseDataApi.uploadMaterialAttachment).not.toHaveBeenCalled()
})

test('renders existing snake-case and camel-case images and retains PC document attachments', async () => {
  baseDataApi.getMaterialAttachments.mockResolvedValue({ data: [
    { id: 1, file_name: 'phone.jpg', file_path: '/uploads/phone.jpg', file_type: 'image/jpeg' },
    { id: 2, fileName: 'desktop.PNG', filePath: '/uploads/desktop.png' },
    { id: 3, fileName: 'drawing.pdf', filePath: '/uploads/drawing.pdf', fileType: 'application/pdf' }
  ] })
  await open({ materialId: 17, editable: false })
  expect(baseDataApi.getMaterialAttachments).toHaveBeenCalledWith(17)
  expect(wrapper.findAll('img').map(image => image.attributes('alt'))).toEqual(['phone.jpg', 'desktop.PNG'])
  expect(wrapper.find('a').attributes('href')).toMatch(/\/uploads\/drawing.pdf$/)
  expect(wrapper.find('a').text()).toBe('drawing.pdf')
  expect(wrapper.findComponent(Uploader).exists()).toBe(false)
})
