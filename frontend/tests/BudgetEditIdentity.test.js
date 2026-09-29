import { defineComponent, h, nextTick } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import BudgetEdit from '@/views/finance/budget/BudgetEdit.vue'
import { financeApi } from '@/api/finance'

vi.mock('@/stores/dictionary', () => ({ useDictionaryStore: () => ({ getOptions: () => [] }) }))
vi.mock('@/utils/optionLoaders', () => ({ loadDepartmentOptions: async () => [] }))
vi.mock('@/api/finance', () => ({ financeApi: { accounts: { getList: vi.fn(async () => ({ data: [] })) }, budgets: {
  getDetail: vi.fn(), create: vi.fn(), update: vi.fn(),
} } }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
const validate = vi.fn()
const Form = defineComponent({ setup(_, { expose, slots }) {
  expose({ validate, clearValidate() {} }); return () => h('div', slots.default?.())
} })
const Passthrough = defineComponent({ template: '<div><slot/><slot name="actions"/></div>' })
const budget = id => ({ id: Number(id), budgetName: `Budget ${id}`, budgetYear: 2026, budgetType: '年度预算',
  startDate: '2026-01-01', endDate: '2026-12-31', status: '草稿', details: [{ accountId: 1, budgetAmount: Number(id) }] })
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
let wrapper, router
beforeEach(() => {
  validate.mockReset().mockResolvedValue(true)
  financeApi.budgets.getDetail.mockReset().mockImplementation(async id => ({ data: budget(id) }))
  financeApi.budgets.update.mockReset().mockResolvedValue({ data: {} })
  financeApi.budgets.create.mockReset().mockResolvedValue({ data: {} })
})
afterEach(() => wrapper?.unmount())
async function open(id = '12') {
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/finance', component: {
    template: '<router-view v-slot="{ Component }"><keep-alive><component :is="Component"/></keep-alive></router-view>',
  }, children: [
    { path: 'budget/edit/:id', name: 'budget-edit', component: BudgetEdit },
    { path: 'budget/edit', name: 'budget-create', component: BudgetEdit },
    { path: 'budget/list', name: 'budget-list', component: { template: '<div />' } },
  ] }] })
  await router.push(`/finance/budget/edit/${id}`); await router.isReady()
  const stubs = Object.fromEntries(['PageHeader','ElCard','ElRow','ElCol','ElFormItem','ElDivider'].map(name => [name, Passthrough]))
  for (const name of ['ElInput','ElDatePicker','ElSelect','ElOption','ElTable','ElTableColumn','ElInputNumber','ElButton','ElAlert']) stubs[name] = true
  wrapper = mount({ template: '<router-view />' }, { global: { plugins: [router], stubs: { ...stubs, ElForm: Form }, directives: { permission() {} } } })
  await flushPromises()
  return wrapper.findComponent(BudgetEdit)
}

test('reuses the editor but loads and saves the selected budget identity', async () => {
  const editor = await open()
  await router.push('/finance/budget/edit/13'); await flushPromises()
  expect(wrapper.findComponent(BudgetEdit).vm.$.uid).toBe(editor.vm.$.uid)
  await editor.vm.handleSave()
  expect(financeApi.budgets.update).toHaveBeenCalledWith('13', expect.objectContaining({
    budget: expect.objectContaining({ budgetName: 'Budget 13' }), details: [{ accountId: 1, budgetAmount: 13 }],
  }))
})

test('a delayed previous detail cannot replace the selected budget', async () => {
  const delayed = deferred()
  financeApi.budgets.getDetail.mockImplementation(id => id === '12' ? delayed.promise : Promise.resolve({ data: budget(id) }))
  const editor = await open()
  await router.push('/finance/budget/edit/13'); await flushPromises()
  delayed.resolve({ data: budget('12') }); await flushPromises()
  expect(editor.vm.formData.budgetName).toBe('Budget 13')
  await editor.vm.handleSave()
  expect(financeApi.budgets.update.mock.calls[0][0]).toBe('13')
})

test('a failed or mismatched detail cannot save the prior form', async () => {
  const editor = await open()
  financeApi.budgets.getDetail.mockResolvedValue({ data: budget('99') })
  await router.push('/finance/budget/edit/13'); await flushPromises()
  await editor.vm.handleSave()
  expect(editor.vm.formReady).toBe(false)
  expect(financeApi.budgets.update).not.toHaveBeenCalled()
  await router.push('/finance/budget/edit'); await flushPromises()
  expect(editor.vm.formReady).toBe(true)
  expect(editor.vm.formData.budgetName).toBe('')
})

test('navigation while validation is pending cancels the old save', async () => {
  const editor = await open()
  const pending = deferred(); validate.mockReturnValue(pending.promise)
  const save = editor.vm.handleSave()
  await nextTick(); await router.push('/finance/budget/edit/13'); await flushPromises()
  pending.resolve(true); await save
  expect(financeApi.budgets.update).not.toHaveBeenCalled()
})

test('completion of a previous save does not navigate away from the next budget', async () => {
  const editor = await open()
  const pending = deferred(); financeApi.budgets.update.mockReturnValue(pending.promise)
  const save = editor.vm.handleSave(); await flushPromises()
  await router.push('/finance/budget/edit/13'); await flushPromises()
  pending.resolve({ data: {} }); await save
  expect(router.currentRoute.value.params.id).toBe('13')
  expect(financeApi.budgets.update.mock.calls[0][1].budget.budgetName).toBe('Budget 12')
})
