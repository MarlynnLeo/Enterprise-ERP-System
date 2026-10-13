import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ProductionProcess from '@/views/production/ProductionProcess.vue'

const { getTasks } = vi.hoisted(() => ({ getTasks: vi.fn() }))
vi.mock('@/api', () => ({
  productionApi: {
    getProductionTasks: getTasks,
    getTaskManagers: async () => ({ data: ['机加组'] })
  },
  baseDataApi: {}, commonApi: {}, financeApi: {}, inventoryApi: {}
}))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ user: { id: 101 } }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { error: vi.fn() } }))
vi.mock('element-plus/es/components/message-box/index', () => ({ ElMessageBox: {} }))
vi.mock('element-plus/es/components/message/style/css', () => ({}))

// Only cards and the query reset button render; closed dialogs and table internals
// are irrelevant to verifying that actual page markup consumes API statistics.
const stubs = Object.fromEntries([
  'PageHeader', 'AppDialog', 'EmptyState', 'ElTable', 'ElTableColumn', 'ElPagination',
  'ElRow', 'ElCol', 'ElButton', 'ElInput', 'ElInputNumber', 'ElForm', 'ElFormItem',
  'ElSelect', 'ElOption', 'ElDatePicker', 'ElTag', 'ElProgress', 'ElSlider',
  'ElRadio', 'ElRadioGroup', 'ElCheckbox', 'ElCheckboxGroup', 'ElAlert', 'ElDivider',
  'ElDescriptions', 'ElDescriptionsItem', 'ElSwitch'
].map(name => [name, true]))
stubs.ElCard = { template: '<section><slot /></section>' }
stubs.FinanceQueryCard = {
  emits: ['reset'],
  template: '<button class="reset-query" @click="$emit(\'reset\')">重置</button>'
}

let wrapper
const stats = () => Object.fromEntries(wrapper.findAll('.stat-card').map(card => [
  card.get('.stat-label').text(), card.get('.stat-value').text()
]))
const open = () => {
  wrapper = mount(ProductionProcess, {
    global: { stubs, directives: { loading() {}, permission() {} } }
  })
}
beforeEach(() => getTasks.mockReset())
afterEach(() => wrapper?.unmount())

describe('production process statistics', () => {
  test('renders scoped API totals with camelCase keys after the response arrives', async () => {
    let resolve
    getTasks.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    open()
    expect(Object.values(stats())).toEqual(['0', '0', '0', '0', '0', '0'])
    resolve({ data: {
      list: [{ id: 1, status: 'material_issued' }], total: 37,
      statistics: { total: 37, pending: 1, preparing: 2, materialIssued: 11, inProgress: 17, completed: 6 }
    } })
    await flushPromises()
    expect(stats()).toEqual({ 任务总数: '37', 未开始: '1', 配料中: '2', 已发料: '11', 生产中: '17', 已完成: '6' })
    expect(getTasks).toHaveBeenCalledWith(expect.objectContaining({
      statusList: 'material_issued,material_partial_issued,in_progress,inspection,warehousing,completed'
    }))
  })

  test('clears previous counts when reset returns no statistics', async () => {
    getTasks.mockResolvedValueOnce({ data: {
      list: [], total: 9,
      statistics: { total: 9, materialIssued: 4, inProgress: 5 }
    } }).mockResolvedValueOnce({ data: { list: [], total: 0 } })
    open()
    await flushPromises()
    expect(stats()).toMatchObject({ 已发料: '4', 生产中: '5' })
    await wrapper.get('.reset-query').trigger('click')
    await flushPromises()
    expect(Object.values(stats())).toEqual(['0', '0', '0', '0', '0', '0'])
    expect(getTasks).toHaveBeenLastCalledWith(expect.objectContaining({
      page: 1, manager: '', keyword: '',
      statusList: 'material_issued,material_partial_issued,in_progress,inspection,warehousing,completed'
    }))
  })
})
