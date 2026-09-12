import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import ProductionPlan from '@/views/production/ProductionPlan.vue'

const { getPlans, messageError } = vi.hoisted(() => ({
  getPlans: vi.fn(), messageError: vi.fn()
}))
vi.mock('@/api', () => ({
  productionApi: { getProductionPlans: getPlans },
  baseDataApi: { getMaterials: async () => ({ data: [] }) },
  purchaseApi: {}, systemApi: {}
}))
vi.mock('@/api/bom', () => ({ bomApi: {} }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ hasPermission: () => true }) }))
vi.mock('@/utils/optionLoaders', () => ({ loadDepartmentOptions: async () => [] }))
vi.mock('@/utils/commonHelpers', () => ({ debounce: (callback) => callback }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { error: messageError } }))
vi.mock('element-plus/es/components/message/style/css', () => ({}))

const TableStub = defineComponent({
  props: ['data'],
  setup: (props) => () => h('div', { class: 'plan-rows' }, props.data.map((row) => row.code).join(','))
})
const PaginationStub = defineComponent({
  props: ['pageSize', 'total', 'currentPage'],
  emits: ['size-change'],
  setup: (props, { emit }) => () => h('button', {
    class: 'select-page-size',
    'data-size': props.pageSize,
    'data-total': props.total,
    onClick: () => emit('size-change', 100)
  }, '100条/页')
})
const SlotStub = { template: '<div><slot /></div>' }
const loadingDirective = (element, binding) => { element.dataset.loading = String(binding.value) }
const response = (code, total) => ({ data: { list: [{ id: code, code }], total } })

let wrapper
let pending
beforeEach(() => {
  pending = []
  getPlans.mockReset()
  messageError.mockClear()
  getPlans.mockImplementation(() => new Promise((resolve, reject) => pending.push({ resolve, reject })))
})
afterEach(() => wrapper?.unmount())

const openPage = async () => {
  wrapper = mount(ProductionPlan, {
    global: {
      stubs: {
        PageHeader: true, FinanceQueryCard: true, AppDialog: true, EmptyState: true,
        ElTable: TableStub, ElTableColumn: true, ElPagination: PaginationStub,
        ElRow: SlotStub, ElCol: SlotStub, ElCard: SlotStub,
        ElButton: true, ElIcon: true, ElTag: true, ElTooltip: true,
        ElInput: true, ElInputNumber: true, ElSelect: true, ElOption: true,
        ElDatePicker: true, ElForm: true, ElFormItem: true, ElPopconfirm: true,
        ElAlert: true, ElDivider: true, ElRadio: true, ElRadioGroup: true,
        ElDescriptions: true, ElDescriptionsItem: true
      },
      directives: { loading: loadingDirective, permission: () => {} }
    }
  })
  await flushPromises()
  expect(getPlans).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 10 }))
  await wrapper.get('.select-page-size').trigger('click')
  expect(getPlans).toHaveBeenLastCalledWith(expect.objectContaining({ pageSize: 100 }))
}

describe('production plan loading interactions', () => {
  test('accepts pagination during loading and ignores an older response that finishes last', async () => {
    await openPage()
    pending[1].resolve(response('LATEST', 123))
    await flushPromises()
    expect(wrapper.get('.plan-rows').text()).toBe('LATEST')
    expect(wrapper.get('.select-page-size').attributes('data-total')).toBe('123')
    pending[0].resolve(response('STALE', 10))
    await flushPromises()
    expect(wrapper.get('.plan-rows').text()).toBe('LATEST')
    expect(wrapper.get('.select-page-size').attributes('data-total')).toBe('123')
    expect(wrapper.get('.plan-rows').attributes('data-loading')).toBe('false')
  })

  test('a stale failure neither interrupts the latest loading state nor shows a false error', async () => {
    await openPage()
    pending[0].reject(new Error('Old request failed'))
    await flushPromises()
    expect(messageError).not.toHaveBeenCalled()
    expect(wrapper.get('.plan-rows').attributes('data-loading')).toBe('true')
    pending[1].resolve(response('LATEST', 123))
    await flushPromises()
    expect(wrapper.get('.plan-rows').text()).toBe('LATEST')
    expect(wrapper.get('.plan-rows').attributes('data-loading')).toBe('false')
  })
})
