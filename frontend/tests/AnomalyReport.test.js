import { reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import AnomalyReport from '@/views/production/AnomalyReport.vue'

const mocks = vi.hoisted(() => ({
  api: Object.fromEntries(['getList', 'getStats', 'getById', 'getTaskOptions', 'uploadImage', 'create', 'assign', 'resolve', 'close'].map(name => [name, vi.fn()])),
  downloadResource: vi.fn(), route: null, canCreate: vi.fn(),
  message: { warning: vi.fn(), error: vi.fn(), success: vi.fn() },
}))
vi.mock('@/api/productionAssist', () => ({ anomalyReportApi: mocks.api }))
vi.mock('@/api/common', () => ({ commonApi: { downloadResource: mocks.downloadResource } }))
vi.mock('vue-router', () => ({ useRoute: () => mocks.route }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ hasPermission: mocks.canCreate }) }))
vi.mock('@/utils/themePageSize', () => ({ getThemeDefaultPageSize: () => 20 }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: mocks.message }))
vi.mock('element-plus/es/components/message-box/index', () => ({ ElMessageBox: { prompt: vi.fn() } }))

const Slot = { template: '<div><slot name="actions"/><slot/><slot name="footer"/></div>' }
const Input = { props: ['modelValue', 'placeholder'], emits: ['update:modelValue'], template: '<input :placeholder="placeholder" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"/>' }
const Button = { props: ['disabled', 'loading'], emits: ['click'], template: '<button :disabled="disabled || loading" @click="$emit(\'click\')"><slot/></button>' }
const Select = {
  props: ['modelValue', 'placeholder', 'remoteMethod', 'disabled'], emits: ['update:modelValue', 'change'],
  template: '<div><input v-if="remoteMethod" :disabled="disabled" :placeholder="placeholder" @input="remoteMethod($event.target.value)"/><select :disabled="disabled" :value="modelValue" @change="$emit(\'update:modelValue\', Number($event.target.value) || $event.target.value); $emit(\'change\', Number($event.target.value) || $event.target.value)"><option value="">未关联</option><slot/></select><slot name="footer"/></div>',
}
const Dialog = { props: ['modelValue', 'title'], template: '<section v-if="modelValue" :data-dialog="title"><slot/><slot name="footer"/></section>' }
const Table = { props: ['data'], emits: ['row-click'], template: '<div><div v-for="row in data" :key="row.id" :data-row="row.id" @click="$emit(\'row-click\', row, {}, $event)">{{ row.title }}</div></div>' }
const stubs = {
  PageHeader: Slot, ElCard: Slot, ElRow: Slot, ElCol: Slot, ElButton: Button, ElInput: Input,
  ElSelect: Select, ElOption: { props: ['value', 'label'], template: '<option :value="value">{{ label }}</option>' },
  ElForm: Slot, ElFormItem: Slot, ElTable: Table, ElTableColumn: true, AppDialog: Dialog,
  ElDescriptions: Slot, ElDescriptionsItem: Slot, ElTag: Slot, ElIcon: true, ElPagination: true,
}
const task = { id: 41, code: 'TASK-41', productCode: 'ITEM-1', productName: '电源组件', planCode: 'PLAN-12', processName: '装配' }
let wrapper
const open = async (query = {}) => {
  mocks.route.query = query
  wrapper = mount(AnomalyReport, { global: { stubs, directives: { loading() {}, permission() {} } } })
  await flushPromises()
}
const button = (text, scope = wrapper) => {
  const result = scope.findAll('button').find(item => item.text().trim() === text)
  expect(result, text).toBeDefined()
  return result
}
const click = async (text, scope) => { await button(text, scope).trigger('click'); await flushPromises() }
const fill = async () => {
  const form = wrapper.get('[data-dialog="上报异常"]')
  await form.get('[placeholder="简要描述异常"]').setValue('  扭矩异常  ')
  await form.get('[placeholder="详细描述异常情况"]').setValue('  实测扭矩不足，请检查  ')
  return form
}
beforeEach(() => {
  Object.values(mocks.api).forEach(mock => mock.mockReset())
  mocks.downloadResource.mockReset()
  mocks.canCreate.mockReset().mockReturnValue(true)
  mocks.route = reactive({ query: {} })
  mocks.api.getList.mockResolvedValue({ data: { list: [{ id: 7, title: '列表摘要', status: 'open' }], total: 1 } })
  mocks.api.getStats.mockResolvedValue({ data: { open: 1 } })
  mocks.api.getTaskOptions.mockResolvedValue({ data: { list: [task], total: 1 } })
  mocks.api.create.mockResolvedValue({ data: { id: 8 } })
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: vi.fn(() => 'blob:anomaly-preview'), revokeObjectURL: vi.fn() }))
})
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals() })

describe('异常上报页面交互', () => {
  test('任务页传入 taskId 后自动关联，提交使用任务 ID 与修剪后的描述', async () => {
    await open({ taskId: '41' })
    expect(mocks.api.getTaskOptions).toHaveBeenCalledExactlyOnceWith({ taskId: '41' })
    const form = await fill()
    expect(form.text()).toContain('PLAN-12')
    expect(form.text()).toContain('电源组件')
    expect(form.text()).toContain('装配')
    await click('提交', form)
    expect(mocks.api.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ taskId: 41, title: '扭矩异常', description: '实测扭矩不足，请检查', images: [] }))
    expect(wrapper.find('[data-dialog="上报异常"]').exists()).toBe(false)
  })

  test('未填写描述时不提交，现场异常允许不关联生产任务', async () => {
    await open()
    await click('上报异常')
    await click('提交')
    expect(mocks.api.create).not.toHaveBeenCalled()
    expect(mocks.message.warning).toHaveBeenCalledWith('请填写标题')
    const form = await fill()
    await click('提交', form)
    expect(mocks.api.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ taskId: null, images: [] }))
  })

  test('任务预填未完成时禁止提交，加载后使用正确任务；缺少创建权限时不自动打开', async () => {
    let finish
    mocks.api.getTaskOptions.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    await open({ taskId: '41' })
    const form = await fill()
    expect(button('提交', form).element.disabled).toBe(true)
    await click('提交', form)
    expect(mocks.api.create).not.toHaveBeenCalled()
    finish({ data: { list: [task] } })
    await flushPromises()
    await click('提交', form)
    expect(mocks.api.create).toHaveBeenCalledWith(expect.objectContaining({ taskId: 41 }))
    wrapper.unmount()
    mocks.canCreate.mockReturnValue(false)
    await open({ taskId: '41' })
    expect(wrapper.find('[data-dialog="上报异常"]').exists()).toBe(false)
  })

  test('上报失败后保留照片，重试不重复上传；保存中重复点击只创建一次', async () => {
    let finishCreate
    mocks.api.uploadImage.mockResolvedValue({ data: { url: '/uploads/anomalies/scene.jpg' } })
    mocks.api.create.mockRejectedValueOnce(new Error('服务暂不可用'))
      .mockImplementationOnce(() => new Promise(resolve => { finishCreate = resolve }))
    await open()
    await click('上报异常')
    const form = await fill()
    const input = form.get('input[multiple]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [new File(['photo'], 'scene.jpg', { type: 'image/jpeg' })] })
    await input.trigger('change')
    await click('提交', form)
    expect(wrapper.find('[data-dialog="上报异常"]').exists()).toBe(true)
    expect(form.findAll('.image-thumb')).toHaveLength(1)
    expect(mocks.api.uploadImage).toHaveBeenCalledOnce()
    const submit = button('提交', form)
    await submit.trigger('click')
    await flushPromises()
    await submit.trigger('click')
    expect(mocks.api.create).toHaveBeenCalledTimes(2)
    expect(mocks.api.uploadImage).toHaveBeenCalledOnce()
    expect(button('取消', form).element.disabled).toBe(true)
    finishCreate({ data: { id: 8 } })
    await flushPromises()
    expect(wrapper.find('[data-dialog="上报异常"]').exists()).toBe(false)
    expect(mocks.api.create).toHaveBeenLastCalledWith(expect.objectContaining({ images: ['/uploads/anomalies/scene.jpg'] }))
  })

  test('读取完整详情和鉴权图片，而非直接使用表格摘要', async () => {
    mocks.api.getById.mockResolvedValue({ data: { id: 7, title: '详情最新标题', description: '详细的异常经过', status: 'open', category: 'quality', severity: 'high', taskCode: task.code, planCode: task.planCode, images: ['/uploads/anomalies/detail.jpg'] } })
    mocks.downloadResource.mockResolvedValue({ data: new Blob(['photo'], { type: 'image/jpeg' }) })
    await open()
    await wrapper.get('[data-row="7"]').trigger('click')
    await flushPromises()
    expect(mocks.api.getById).toHaveBeenCalledExactlyOnceWith(7)
    const detail = wrapper.get('[data-dialog="异常详情"]')
    expect(detail.text()).toContain('详情最新标题')
    expect(detail.text()).toContain('详细的异常经过')
    expect(detail.text()).toContain('TASK-41')
    expect(mocks.downloadResource).toHaveBeenCalledExactlyOnceWith('/uploads/anomalies/detail.jpg')
    expect(detail.get('.image-thumb img').attributes('src')).toBe('blob:anomaly-preview')
  })

  test('远程任务搜索较慢的旧响应不会覆盖新搜索', async () => {
    let finishOld
    mocks.api.getTaskOptions.mockImplementation(({ keyword }) => keyword === 'old'
      ? new Promise(resolve => { finishOld = resolve })
      : Promise.resolve({ data: { list: [{ ...task, id: 42, code: 'TASK-NEW' }], total: 1 } }))
    await open()
    await click('上报异常')
    const search = wrapper.get('[placeholder="搜索任务单号、生产计划或产品"]')
    await search.setValue('old')
    await search.setValue('new')
    await flushPromises()
    finishOld({ data: { list: [{ ...task, code: 'TASK-OLD' }], total: 1 } })
    await flushPromises()
    const form = wrapper.get('[data-dialog="上报异常"]')
    expect(form.text()).toContain('TASK-NEW')
    expect(form.text()).not.toContain('TASK-OLD')
  })
})
