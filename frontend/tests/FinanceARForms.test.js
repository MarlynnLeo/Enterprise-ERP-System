import { defineComponent, h, inject, provide, toRef } from 'vue'
import { createPinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import AsyncValidatorModule from 'async-validator'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import Invoices from '@/views/finance/ar/Invoices.vue'

const mocks = vi.hoisted(() => ({
  api: Object.fromEntries(['getARInvoices', 'generateARInvoiceNumber', 'createARInvoice', 'createReceipt', 'getBankAccounts'].map(name => [name, vi.fn()])),
  customers: vi.fn(), products: vi.fn(),
  message: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api', () => ({ financeApi: { settings: { getOptions: async () => ({ data: {} }) } } }))
vi.mock('@/api/finance', () => ({ financeApi: mocks.api }))
vi.mock('@/api/sales', () => ({ salesApi: {} }))
vi.mock('@/utils/optionLoaders', () => ({ searchCustomerPageOptions: mocks.customers, searchMaterialPageOptions: mocks.products }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/services/printService', () => ({ default: {} }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: mocks.message }))
vi.mock('element-plus/es/components/message/style/css', () => ({}))
vi.mock('element-plus/es/components/message-box/index', () => ({ ElMessageBox: { confirm: vi.fn() } }))

const Slot = { template: '<div><slot name="header"/><slot name="actions"/><slot/><slot name="footer"/></div>' }
const Input = {
  props: ['modelValue', 'disabled', 'placeholder', 'size'], emits: ['update:modelValue', 'input'],
  template: '<input :disabled="disabled" :placeholder="placeholder" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value); $emit(\'input\', $event.target.value)"/>',
}
const Button = {
  props: ['loading', 'disabled'], emits: ['click'],
  template: '<button type="button" :disabled="loading || disabled" @click="$emit(\'click\')"><slot/></button>',
}
const Select = {
  props: ['modelValue', 'remoteMethod', 'placeholder'], emits: ['update:modelValue', 'change'],
  template: '<div><input v-if="remoteMethod" :placeholder="placeholder" @input="remoteMethod($event.target.value)"/><select :value="modelValue" @change="$emit(\'update:modelValue\', Number($event.target.value) || $event.target.value); $emit(\'change\', Number($event.target.value) || $event.target.value)"><slot/></select></div>',
}
const Table = defineComponent({
  props: ['data'],
  setup(props, { slots }) {
    provide('tableRows', toRef(props, 'data'))
    return () => h('div', slots.default?.())
  },
})
const Column = defineComponent({
  props: ['prop', 'label'],
  setup(props, { slots }) {
    const rows = inject('tableRows')
    return () => h('div', { 'data-column': props.label }, (rows.value || []).map((row, index) =>
      h('div', slots.default ? slots.default({ row, $index: index }) : String(row[props.prop] ?? ''))))
  },
})
const Dialog = { props: ['modelValue', 'title'], template: '<section v-if="modelValue" :data-dialog="title"><slot/><slot name="footer"/></section>' }
// Node loads async-validator's CommonJS entry; normalize its default export here.
const AsyncValidator = AsyncValidatorModule.default || AsyncValidatorModule
const Form = defineComponent({
  props: ['model', 'rules'],
  setup(props, { slots, expose }) {
    expose({
      clearValidate() {},
      async validate(callback) {
        try {
          const rules = Object.fromEntries(Object.entries(props.rules || {}).map(([key, value]) => [
            key, (Array.isArray(value) ? value : [value]).map(({ trigger: _trigger, ...rule }) => rule),
          ]))
          await new AsyncValidator(rules).validate(props.model)
        } catch (error) {
          if (!error.fields) throw error
          await callback?.(false, error.fields)
          return false
        }
        await callback?.(true)
        return true
      },
    })
    return () => h('form', { onSubmit: event => event.preventDefault() }, slots.default?.())
  },
})
const stubs = {
  PageHeader: Slot, FinanceQueryCard: true, ElCard: Slot, ElRow: Slot, ElCol: Slot,
  ElButton: Button, ElInput: Input, ElInputNumber: Input, ElDatePicker: Input,
  ElSelect: Select, ElOption: { props: ['value', 'label'], template: '<option :value="value">{{ label }}</option>' },
  ElForm: Form, ElFormItem: { props: ['label'], template: '<label><span>{{ label }}</span><slot/></label>' },
  ElTable: Table, ElTableColumn: Column, AppDialog: Dialog,
  ElTag: Slot, ElLink: Slot, ElIcon: true, ElPagination: true, ElAlert: true,
  InvoiceDetailDialog: true, RelatedOrderDialog: true, EmptyState: true,
}
const product = { id: 501, code: 'PRODUCT-501', name: '搜索到的商品', price: 100 }
let wrapper
beforeEach(() => {
  Object.values(mocks.api).forEach(mock => mock.mockReset())
  mocks.customers.mockReset().mockResolvedValue([{ id: 9, name: '测试客户' }])
  mocks.products.mockReset().mockResolvedValue([product])
  mocks.api.getARInvoices.mockResolvedValue({ data: { list: [{ id: 7, invoiceNumber: 'AR-7', customerName: '测试客户', status: '已确认', totalAmount: 200, paidAmount: 0, balanceAmount: 200 }], total: 1 } })
  mocks.api.generateARInvoiceNumber.mockResolvedValue({ data: { invoiceNumber: 'AR-AUTO-8' } })
  mocks.api.createARInvoice.mockResolvedValue({ data: { id: 8 } })
  mocks.api.createReceipt.mockResolvedValue({ data: { id: 9 } })
  mocks.api.getBankAccounts.mockResolvedValue({ data: [{ id: 3, accountName: '测试银行', accountNumber: 'TEST-3' }] })
})
afterEach(() => wrapper?.unmount())
const open = async () => {
  wrapper = mount(Invoices, { global: {
    plugins: [createPinia()], stubs,
    directives: { loading: () => {}, permission: () => {} },
  } })
  await flushPromises()
}
const click = async (label, scope = wrapper) => {
  const button = scope.findAll('button').find(button => button.text().trim() === label)
  expect(button, label).toBeDefined()
  await button.trigger('click')
  await flushPromises()
}
const fillInvoice = async ({ dueDate = true } = {}) => {
  await click('新增发票')
  const form = wrapper.get('[data-dialog="新增销售发票"]')
  await form.findAll('select')[0].setValue('9')
  await form.findAll('select')[1].setValue('501')
  await form.get('[placeholder="数量"]').setValue('2')
  if (dueDate) await form.get('[placeholder="选择到期日期"]').setValue('2026-09-30')
  return form
}

describe('应收发票与收款弹窗的页面提交', () => {
  test('经子表单校验后生成编号并提交 226 元发票', async () => {
    await open()
    const form = await fillInvoice()
    await click('确认', form)
    expect(mocks.api.generateARInvoiceNumber).toHaveBeenCalledOnce()
    expect(mocks.api.createARInvoice).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      invoiceNumber: 'AR-AUTO-8', customerId: 9, totalAmount: 226,
      items: [expect.objectContaining({ productId: 501, quantity: 2, unitPrice: 100, amount: 200 })],
    }))
    expect(wrapper.find('[data-dialog="新增销售发票"]').exists()).toBe(false)
  })

  test('缺少到期日期时保留表单且不占用编号、不创建发票', async () => {
    await open()
    const form = await fillInvoice({ dueDate: false })
    await click('确认', form)
    expect(mocks.api.generateARInvoiceNumber).not.toHaveBeenCalled()
    expect(mocks.api.createARInvoice).not.toHaveBeenCalled()
    expect(wrapper.find('[data-dialog="新增销售发票"]').exists()).toBe(true)
  })

  test('收款校验银行账户后提交并关闭弹窗', async () => {
    await open()
    await click('收款')
    const form = wrapper.get('[data-dialog="记录收款"]')
    await click('确认', form)
    expect(mocks.api.createReceipt).not.toHaveBeenCalled()
    await form.findAll('select')[1].setValue('3')
    await click('确认', form)
    expect(mocks.api.createReceipt).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ invoiceId: 7, amount: 200, bankAccountId: 3, paymentMethod: 'bank_transfer' }))
    expect(wrapper.find('[data-dialog="记录收款"]').exists()).toBe(false)
  })

  test('商品远程搜索较慢的旧响应不会覆盖新查询', async () => {
    await open()
    await click('新增发票')
    let resolveOld
    mocks.products.mockImplementation(keyword => keyword === 'old'
      ? new Promise(resolve => { resolveOld = resolve })
      : Promise.resolve([{ id: 502, code: 'NEW-502', name: '最新商品', price: 60 }]))
    const search = wrapper.get('[placeholder="输入商品编码或名称"]')
    await search.setValue('old')
    await search.setValue('new')
    await flushPromises()
    resolveOld([{ id: 503, code: 'OLD-503', name: '旧响应商品' }])
    await flushPromises()
    const form = wrapper.get('[data-dialog="新增销售发票"]')
    expect(form.text()).toContain('NEW-502')
    expect(form.text()).not.toContain('OLD-503')
    expect(mocks.products).toHaveBeenCalledWith('new', { type: 'finished' })
  })
})
