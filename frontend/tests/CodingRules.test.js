import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import CodingRules from '@/views/system/CodingRules.vue'

const mocks = vi.hoisted(() => ({ getList: vi.fn(), create: vi.fn(), update: vi.fn(), success: vi.fn(), error: vi.fn(), leave: vi.fn(), routeUpdate: vi.fn() }))
vi.mock('@/api/enhanced', () => ({ codingRuleApi: mocks }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: mocks }))
vi.mock('vue-router', () => ({ onBeforeRouteLeave: mocks.leave, onBeforeRouteUpdate: mocks.routeUpdate }))

let wrapper
const mountRules = async (renderForm = false) => {
  wrapper = shallowMount(CodingRules, {
    global: {
      directives: { loading: () => {}, permission: () => {} },
      stubs: { ...Object.fromEntries([
        'PageHeader', 'FinanceQueryCard', 'AppDialog', 'EmptyState', 'ElButton', 'ElTag',
        'ElForm', 'ElFormItem', 'ElInput', 'ElInputNumber', 'ElSelect', 'ElOption', 'ElCard',
        'ElTable', 'ElTableColumn', 'ElIcon', 'ElRow', 'ElCol', 'ElSwitch', 'ElDrawer',
        'ElDescriptions', 'ElDescriptionsItem', 'ElPopconfirm',
      ].map(name => [name, true])), AppDialog: renderForm ? { template: '<div><slot /></div>' } : true },
    },
  })
  await flushPromises()
  if (renderForm) wrapper.vm.$.setupState.formRef = { validate: async () => true }
}

beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset())
  mocks.getList.mockResolvedValue({ data: { list: [], total: 0 } })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 12, 10, 0, 0))
})

afterEach(() => {
  wrapper?.unmount()
  vi.useRealTimers()
})

describe('coding rule management', () => {
  test('saving locks editing, closing and leaving until completion and cannot create twice', async () => {
    let finish
    mocks.create.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    await mountRules(true)
    wrapper.vm.openForm()
    Object.assign(wrapper.vm.form, { businessType: 'new_type', name: '待保存', prefix: 'NP' })
    const save = wrapper.vm.handleSave()
    await flushPromises()
    expect(wrapper.find('el-form-stub').attributes('disabled')).toBe('true')
    expect(wrapper.find('el-form-stub').attributes()).toHaveProperty('inert')
    await wrapper.vm.closeForm()
    expect(wrapper.vm.formVis).toBe(true)
    expect(await mocks.leave.mock.calls[0][0]()).toBe(false)
    wrapper.vm.openForm({ id: 22, name: '不可换单' })
    expect(wrapper.vm.form.name).toBe('待保存')
    await wrapper.vm.handleSave()
    expect(mocks.create).toHaveBeenCalledTimes(1)
    finish({ data: { id: 21 } })
    await save
    expect(wrapper.vm.formVis).toBe(false)
    expect(await mocks.leave.mock.calls[0][0]()).toBe(true)
    await wrapper.vm.handleSave()
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })
  test('failed saves preserve input and allow retry', async () => {
    mocks.create.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: { id: 21 } })
    await mountRules()
    wrapper.vm.openForm()
    Object.assign(wrapper.vm.form, { businessType: 'new_type', name: '保留名称', prefix: 'NP' })
    await wrapper.vm.handleSave()
    expect(wrapper.vm.formVis).toBe(true)
    expect(wrapper.vm.saving).toBe(false)
    expect(wrapper.vm.form.name).toBe('保留名称')
    await wrapper.vm.handleSave()
    expect(mocks.create).toHaveBeenCalledTimes(2)
    expect(wrapper.vm.formVis).toBe(false)
  })
  test('a completed request cannot close a replacement form or report success after unmount', async () => {
    let finish
    mocks.create.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    await mountRules()
    wrapper.vm.openForm()
    const save = wrapper.vm.handleSave()
    wrapper.unmount()
    finish({ data: { id: 21 } })
    await save
    expect(mocks.success).not.toHaveBeenCalled()
    expect(mocks.getList).toHaveBeenCalledTimes(1)
  })
  test('unexpected later model edits are not silently marked saved or closed', async () => {
    let finish
    mocks.create.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    await mountRules()
    wrapper.vm.openForm()
    wrapper.vm.form.name = 'submitted name'
    const save = wrapper.vm.handleSave()
    wrapper.vm.form.name = 'unsent name'
    finish({ data: { id: 21 } })
    await save
    expect(mocks.create.mock.calls[0][0].name).toBe('submitted name')
    expect(wrapper.vm.dirty).toBe(true)
    expect(wrapper.vm.formVis).toBe(true)
  })
  test('loads every page so rules beyond the first page can be found and edited', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, name: `规则${index + 1}` }))
    const lastRule = { id: 101, name: '出库单', businessType: 'inventory_outbound', preview: 'OUT260912002' }
    mocks.getList
      .mockResolvedValueOnce({ data: { list: firstPage, total: 101 } })
      .mockResolvedValueOnce({ data: { list: [lastRule], total: 101 } })

    await mountRules()
    wrapper.vm.keyword = '出库单'

    expect(mocks.getList).toHaveBeenNthCalledWith(1, { page: 1, pageSize: 100 })
    expect(mocks.getList).toHaveBeenNthCalledWith(2, { page: 2, pageSize: 100 })
    expect(wrapper.vm.tableData).toHaveLength(101)
    expect(wrapper.vm.filteredData).toEqual([lastRule])
  })

  test('previews and saves a new compact daily rule starting at 001', async () => {
    await mountRules()
    wrapper.vm.openForm()
    Object.assign(wrapper.vm.form, { businessType: 'inventory_outbound', name: '出库单', prefix: 'OUT' })

    expect(wrapper.vm.livePreview).toBe('OUT260912001')
    await wrapper.vm.handleSave()

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      dateFormat: 'YYMMDD', separator: '', sequenceLength: 3, initialValue: 1, step: 1,
    }))
    expect(mocks.error).not.toHaveBeenCalled()
  })

  test.each([
    ['YYMM', 7, 'PP2609007'],
    ['YY', 12, 'PP26012'],
    ['', 0, 'PP000'],
  ])('previews %s using the actual configured initial value', async (dateFormat, initialValue, code) => {
    await mountRules()
    wrapper.vm.openForm({ id: 1, prefix: 'PP', dateFormat, initialValue, sequenceLength: 3, separator: '' })

    expect(wrapper.vm.livePreview).toBe(code)
  })
})
