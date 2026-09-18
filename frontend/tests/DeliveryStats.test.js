import { defineComponent, h, inject, provide, toRef } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import DeliveryStats from '@/views/sales/DeliveryStats.vue'

const mocks = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), confirm: vi.fn(),
  success: vi.fn(), warning: vi.fn(), error: vi.fn(),
}))
vi.mock('@/services/axiosInstance', () => ({ api: { get: mocks.get, post: mocks.post }, fastApi: {} }))
vi.mock('@/api', async () => ({ salesApi: (await import('@/api/sales')).salesApi }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }))
vi.mock('@/stores/dictionary', () => ({ useDictionaryStore: () => ({ groups: {}, isLoaded: false, getOptions: () => [] }) }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: mocks }))
vi.mock('element-plus/es/components/message-box/index', () => ({ ElMessageBox: { confirm: mocks.confirm } }))

const Slot = { template: '<div><slot /></div>' }
const Button = {
  props: ['loading', 'disabled'], emits: ['click'],
  template: '<button :disabled="loading || disabled" @click="$emit(\'click\')"><slot /></button>',
}
const Table = defineComponent({
  props: ['data'], emits: ['selection-change'],
  setup(props, { slots }) {
    provide('tableRows', toRef(props, 'data'))
    return () => h('div', slots.default?.())
  },
})
const Column = defineComponent({
  props: ['prop', 'label'],
  setup(props, { slots }) {
    const rows = inject('tableRows')
    return () => h('div', { 'data-column': props.label }, rows.value.map(row =>
      h('div', slots.default ? slots.default({ row }) : String(row[props.prop] ?? ''))))
  },
})
const Input = {
  props: ['modelValue', 'type', 'size'], emits: ['update:modelValue', 'input'],
  template: '<input :type="type || \'text\'" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value); $emit(\'input\', $event.target.value)"/>',
}
const rows = [
  { orderId: 14517, orderNo: 'SO202609100001', materialId: 9461, unshippedQuantity: 2000, stockQuantity: 21879 },
  { orderId: 14518, orderNo: 'SO202609100002', materialId: 9461, unshippedQuantity: 500, stockQuantity: 300 },
]
let wrapper

beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset())
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 14, 12))
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.get.mockResolvedValue({ data: { list: rows, total: 2 } })
  mocks.post.mockResolvedValue({ data: { id: 7 } })
  mocks.confirm.mockResolvedValue('confirm')
})
afterEach(() => {
  wrapper?.unmount()
  vi.useRealTimers()
})

const openPage = async () => {
  wrapper = mount(DeliveryStats, { global: {
    stubs: {
      PageHeader: true, FinanceQueryCard: true, ElCard: Slot,
      ElTable: Table, ElTableColumn: Column, ElButton: Button, ElInput: Input,
      ElIcon: true, ElProgress: true, ElTag: Slot, ElLink: Slot,
      ElPagination: true, ElDatePicker: true, ElAlert: Slot, ElForm: Slot, ElFormItem: Slot,
      ElSelect: true, ElOption: true, ElDescriptions: Slot, ElDescriptionsItem: Slot,
      AppDialog: {
        props: ['modelValue'],
        template: '<section v-if="modelValue"><slot/><slot name="footer"/></section>',
      },
    },
    directives: { loading: () => {} },
  } })
  await flushPromises()
}
const click = async (label) => {
  const button = wrapper.findAll('button').find(button => button.text() === label)
  expect(button).toBeDefined()
  await button.trigger('click')
  await flushPromises()
}
const openBatch = async () => {
  wrapper.findComponent(Table).vm.$emit('selection-change', rows)
  await flushPromises()
  await click('批量发货')
}

describe('delivery statistics shipping', () => {
  test('partial delivery status is shown in Chinese', async () => {
    mocks.get.mockResolvedValue({ data: { list: [{ ...rows[0], deliveryStatus: 'partial', orderedQuantity: 12, shippedQuantity: 7 }], total: 1 } })
    await openPage()
    expect(wrapper.get('[data-column="发货状态"]').text()).toBe('部分发货')
  })
  test('single shipping initializes quantity and preserves the order and date in the HTTP payload', async () => {
    await openPage()
    await click('发货')
    expect(wrapper.get('input[type="number"]').element.value).toBe('2000')
    await click('确认生成出库单')

    expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/sales/outbound', {
      orderId: 14517, relatedOrders: [14517], isMultiOrder: false,
      deliveryDate: '2026-09-14', status: 'draft', remarks: '',
      items: [{ productId: 9461, quantity: 2000, sourceOrderId: 14517, sourceOrderNo: 'SO202609100001' }],
    })
  })

  test('batch shipping includes every order and retains separate sources for the same product', async () => {
    await openPage()
    await openBatch()
    expect(wrapper.findAll('input[type="number"]').map(input => input.element.value)).toEqual(['2000', '300'])
    await click('确认生成出库单')

    expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/sales/outbound', {
      orderId: null, relatedOrders: [14517, 14518], isMultiOrder: true,
      deliveryDate: '2026-09-14', status: 'draft', remarks: '',
      items: [
        { productId: 9461, quantity: 2000, sourceOrderId: 14517, sourceOrderNo: 'SO202609100001' },
        { productId: 9461, quantity: 300, sourceOrderId: 14518, sourceOrderNo: 'SO202609100002' },
      ],
    })
  })

  test('zero quantities are excluded from both the details and related orders', async () => {
    await openPage()
    await openBatch()
    await wrapper.findAll('input[type="number"]')[1].setValue('0')
    await click('确认生成出库单')

    expect(mocks.post.mock.calls[0][1]).toMatchObject({
      orderId: 14517, relatedOrders: [14517], isMultiOrder: false,
      items: [{ productId: 9461, quantity: 2000, sourceOrderId: 14517 }],
    })
  })

  test('validation failures display the backend message and allow a retry', async () => {
    mocks.post.mockRejectedValueOnce({ response: { status: 400, data: {
      message: '销售出库单缺少有效的关联订单', error: { message: '销售出库单缺少有效的关联订单' },
    } } })
    await openPage()
    await click('发货')
    await click('确认生成出库单')
    expect(mocks.error).toHaveBeenCalledWith('创建出库单失败: 销售出库单缺少有效的关联订单')
    expect(wrapper.get('input[type="number"]').element.value).toBe('2000')
    await click('确认生成出库单')
    expect(mocks.post).toHaveBeenCalledTimes(2)
    expect(mocks.success).toHaveBeenCalledWith('出库单创建成功')
  })
})
