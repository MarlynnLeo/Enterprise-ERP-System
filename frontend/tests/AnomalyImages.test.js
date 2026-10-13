import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import AnomalyImages from '@/components/production/AnomalyImages.vue'

const mocks = vi.hoisted(() => ({
  uploadImage: vi.fn(), downloadResource: vi.fn(),
  message: { warning: vi.fn(), error: vi.fn(), success: vi.fn() },
}))
vi.mock('@/api/productionAssist', () => ({ anomalyReportApi: { uploadImage: mocks.uploadImage } }))
vi.mock('@/api/common', () => ({ commonApi: { downloadResource: mocks.downloadResource } }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: mocks.message }))

const Button = {
  props: ['disabled'], emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot/></button>',
}
const Dialog = { props: ['modelValue'], template: '<section v-if="modelValue"><slot/><slot name="footer"/></section>' }
const file = (name = 'photo.jpg', type = 'image/jpeg', content = 'photo') => new File([content], name, { type })
let wrapper
let makeUrl
let revokeUrl
const open = props => {
  wrapper = mount(AnomalyImages, { props, global: { stubs: { ElButton: Button, AppDialog: Dialog } } })
  return wrapper
}
const select = async (files, camera = false) => {
  const input = wrapper.get(camera ? 'input[capture="environment"]' : 'input[multiple]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: files })
  await input.trigger('change')
}
beforeEach(() => {
  mocks.uploadImage.mockReset()
  mocks.downloadResource.mockReset()
  makeUrl = vi.fn().mockImplementation((_, index = makeUrl.mock.calls.length) => `blob:anomaly-${index}`)
  revokeUrl = vi.fn()
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: makeUrl, revokeObjectURL: revokeUrl }))
})
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals() })

describe('异常现场图片', () => {
  test('相册和后置相机可添加图片，拒绝错误扩展名、MIME 与超过 5MB 的文件', async () => {
    open()
    expect(wrapper.get('input[capture="environment"]').attributes('accept')).toContain('image/jpeg')
    await select([file('valid.jpg'), file('bad.svg', 'image/svg+xml'), file('disguised.jpg', 'text/plain'), file('large.png', 'image/png', new Uint8Array(5 * 1024 * 1024 + 1))])
    await select([file('camera.png', 'image/png')], true)
    expect(wrapper.findAll('.image-thumb')).toHaveLength(2)
    expect(makeUrl).toHaveBeenCalledTimes(2)
    expect(mocks.message.warning).toHaveBeenCalledWith('每张图片不能超过 5MB')
    expect(mocks.message.warning).toHaveBeenCalledWith('请选择 JPG、PNG、GIF、WEBP 或 BMP 图片')
    expect(mocks.uploadImage).not.toHaveBeenCalled()
  })

  test('最多保留五张图片，移除后释放预览并允许重新添加', async () => {
    open()
    await select(Array.from({ length: 5 }, (_, i) => file(`${i}.jpg`)))
    await select([file('sixth.jpg')])
    expect(wrapper.findAll('.image-thumb')).toHaveLength(5)
    expect(mocks.message.warning).toHaveBeenCalledWith('最多选择 5 张图片')
    await wrapper.get('[aria-label="移除0.jpg"]').trigger('click')
    expect(revokeUrl).toHaveBeenCalledWith('blob:anomaly-1')
    await select([file('replacement.jpg')])
    expect(wrapper.findAll('.image-thumb')).toHaveLength(5)
    expect(wrapper.get('[aria-label="预览replacement.jpg"]').exists()).toBe(true)
  })

  test('失败重试只上传未成功的图片，保留原始文件与已上传地址', async () => {
    const first = file('first.jpg')
    const second = file('second.jpg')
    mocks.uploadImage.mockResolvedValueOnce({ data: { url: '/uploads/anomalies/first.jpg' } })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ data: { url: '/uploads/anomalies/second.jpg' } })
    open()
    await select([first, second])
    await expect(wrapper.vm.uploadPending()).rejects.toThrow('图片上传失败')
    expect(wrapper.text()).toContain('上传失败')
    await expect(wrapper.vm.uploadPending()).resolves.toEqual(['/uploads/anomalies/first.jpg', '/uploads/anomalies/second.jpg'])
    expect(mocks.uploadImage).toHaveBeenCalledTimes(3)
    expect(mocks.uploadImage.mock.calls.map(([data]) => data.get('file').name)).toEqual(['first.jpg', 'second.jpg', 'second.jpg'])
    await expect(wrapper.vm.uploadPending()).resolves.toHaveLength(2)
    expect(mocks.uploadImage).toHaveBeenCalledTimes(3)
  })

  test('上传中拒绝重复执行，并禁用选择和移除；清空释放全部本地预览', async () => {
    let finish
    mocks.uploadImage.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    open()
    await select([file()])
    const pending = wrapper.vm.uploadPending()
    await flushPromises()
    await expect(wrapper.vm.uploadPending()).rejects.toThrow('图片正在上传')
    expect(wrapper.get('input[multiple]').element.disabled).toBe(true)
    expect(wrapper.get('[aria-label="移除photo.jpg"]').element.disabled).toBe(true)
    finish({ data: { url: '/uploads/anomalies/photo.jpg' } })
    await pending
    wrapper.vm.clearImages()
    await flushPromises()
    expect(wrapper.findAll('.image-thumb')).toHaveLength(0)
    expect(revokeUrl).toHaveBeenCalledWith('blob:anomaly-1')
  })

  test('详情通过鉴权下载 Blob 并预览，替换或卸载释放旧预览', async () => {
    mocks.downloadResource.mockResolvedValue({ data: new Blob(['photo'], { type: 'image/jpeg' }) })
    open({ readonly: true, images: JSON.stringify(['/uploads/anomalies/detail.jpg']) })
    await flushPromises()
    expect(mocks.downloadResource).toHaveBeenCalledExactlyOnceWith('/uploads/anomalies/detail.jpg')
    expect(wrapper.get('.image-thumb img').attributes('src')).toBe('blob:anomaly-1')
    expect(wrapper.find('input[type="file"]').exists()).toBe(false)
    await wrapper.get('.image-thumb').trigger('click')
    expect(wrapper.get('.large-image').attributes('src')).toBe('blob:anomaly-1')
    await wrapper.setProps({ images: ['/uploads/anomalies/new.jpg'] })
    await flushPromises()
    expect(revokeUrl).toHaveBeenCalledWith('blob:anomaly-1')
    wrapper.unmount()
    expect(revokeUrl).toHaveBeenCalledWith('blob:anomaly-2')
  })

  test('已关闭详情的慢请求不创建预览，非图片响应可重新加载', async () => {
    let finish
    mocks.downloadResource.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    open({ readonly: true, images: ['/uploads/anomalies/slow.jpg'] })
    await wrapper.setProps({ images: [] })
    finish({ data: new Blob(['photo'], { type: 'image/jpeg' }) })
    await flushPromises()
    expect(makeUrl).not.toHaveBeenCalled()
    mocks.downloadResource.mockResolvedValueOnce({ data: new Blob(['error'], { type: 'text/html' }) })
      .mockResolvedValueOnce({ data: new Blob(['photo'], { type: 'image/jpeg' }) })
    await wrapper.setProps({ images: ['/uploads/anomalies/retry.jpg'] })
    await flushPromises()
    expect(wrapper.text()).toContain('加载失败')
    await wrapper.findAll('button').find(button => button.text().includes('点击重试')).trigger('click')
    await flushPromises()
    expect(wrapper.get('.image-thumb img').attributes('src')).toBe('blob:anomaly-1')
  })
})
