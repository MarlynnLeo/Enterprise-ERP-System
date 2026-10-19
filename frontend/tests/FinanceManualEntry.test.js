import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ElForm, ElFormItem } from 'element-plus/es/components/form/index'
import AsyncValidatorModule from 'async-validator'
import EntryFormDialog from '@/views/finance/gl/entries/EntryFormDialog.vue'
import { createManualItem, manualEntryError, manualEntryPayload, prepareAccountOptions } from '@/views/finance/gl/entries/manualEntry'
import { clickButton, fillField, financeDirectives, financeStubs } from './helpers/financeFormHarness'

const mocks = vi.hoisted(() => ({
  options: vi.fn(), create: vi.fn(), error: vi.fn(), warning: vi.fn(), success: vi.fn(),
}))
vi.mock('@/api', () => ({ financeApi: { getEntryOptions: mocks.options, createEntry: mocks.create } }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { error: mocks.error, warning: mocks.warning, success: mocks.success } }))
vi.mock('element-plus/es/components/message-box/index', () => ({ ElMessageBox: {} }))
const AsyncValidator = AsyncValidatorModule.default || AsyncValidatorModule

const options = () => ({
  accounts: [
    { id: 11, accountCode: '1002', accountName: '银行存款', isActive: true, hasDepartment: '0' },
    { id: 12, accountCode: '1122', accountName: '应收账款', isActive: true },
    { id: 90, accountCode: '9000', accountName: '停用父科目', isActive: false, children: [{ id: 91, parentId: 90, accountCode: '900001', accountName: '停用父项下子科目', isActive: true }] },
  ],
  customers: Array.from({ length: 125 }, (_, index) => ({ id: index + 1, customerName: `客户${index + 1}` })),
  suppliers: [{ id: 2, supplierName: '材料供应商' }], departments: [{ id: 9, name: '生产部' }],
  costCenters: [{ id: 7, name: '生产成本中心' }], employees: [{ id: 8, username: 'worker', realName: '张员工' }],
})
const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail }); return { promise, resolve, reject } }
let wrapper
const open = async (stubs = {}) => {
  wrapper = mount(EntryFormDialog, { props: { modelValue: true, defaultMode: 'manual' }, global: { stubs: { ...financeStubs, ...stubs }, directives: financeDirectives } })
  await flushPromises()
}
const panel = () => wrapper.get('.manual-line-details')
const selectLine = async index => {
  await wrapper.findAll('[data-column="操作"] [data-row]')[index].findAll('button')[0].trigger('click')
  await flushPromises()
}
const balancedRows = async (amount = 710) => {
  const accounts = wrapper.findAll('[data-column="会计科目"] select')
  await accounts[0].setValue('11'); await accounts[1].setValue('12')
  await wrapper.findAll('[data-column="借方"] input')[0].setValue(String(amount))
  await wrapper.findAll('[data-column="贷方"] input')[1].setValue(String(amount))
  await selectLine(0)
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.options.mockResolvedValue({ data: options() })
  mocks.create.mockResolvedValue({ data: { id: 88 } })
})
afterEach(() => { wrapper?.unmount(); wrapper = null })

test('loads complete dedicated options once, shows actual employee names, and excludes descendants of disabled accounts', async () => {
  await open()
  expect(mocks.options).toHaveBeenCalledOnce()
  expect(wrapper.findAll('[data-column="会计科目"] option').map(option => option.text()).join()).not.toContain('停用')
  expect(panel().get('[data-field="customerId"]').findAll('option')).toHaveLength(126)
  expect(panel().get('[data-field="customerId"]').text()).toContain('客户125')
  expect(panel().get('[data-field="employeeId"]').text()).toContain('张员工')
  expect(panel().get('[data-field="quantity"] input').attributes('disabled')).toBeUndefined()
  expect(panel().get('[data-field="unitPrice"] input').attributes('disabled')).toBeUndefined()
})

test('saves explicit USD and independent auxiliary fields while keeping debit/credit in CNY', async () => {
  await open(); await balancedRows()
  await fillField(wrapper, 'attachmentCount', 2)
  await fillField(wrapper, 'documentNumber', 'BILL-USD-100')
  await fillField(wrapper, 'description', '美元收款')
  for (const [field, value] of Object.entries({ departmentId: 9, costCenterId: 7, employeeId: 8, customerId: 125, supplierId: 2, projectName: '研发项目', currencyCode: 'USD', exchangeRate: 7.1, foreignAmount: 100, quantity: 10, unitName: '箱', unitPrice: 10, settlementMethod: '银行转账', invoiceNumber: 'TAX-100' })) {
    await fillField(panel(), field, value)
  }
  await clickButton(wrapper, '保存凭证')
  expect(mocks.create).toHaveBeenCalledOnce()
  expect(mocks.create.mock.calls[0][0]).toMatchObject({
    attachmentCount: 2, documentNumber: 'BILL-USD-100', description: '美元收款',
    items: [
      { accountId: 11, debitAmount: 710, creditAmount: 0, currencyCode: 'USD', exchangeRate: 7.1, foreignAmount: 100, departmentId: 9, costCenterId: 7, employeeId: 8, employeeSource: 'user', customerId: 125, supplierId: 2, projectName: '研发项目', quantity: 10, unitName: '箱', unitPrice: 10, settlementMethod: '银行转账', invoiceNumber: 'TAX-100' },
      { accountId: 12, debitAmount: 0, creditAmount: 710, currencyCode: 'CNY', exchangeRate: 1, foreignAmount: null, employeeId: null, employeeSource: null },
    ],
  })
  expect(wrapper.emitted('success')).toEqual([[{ id: 88 }]])
})

test('switching selected rows preserves their separate fields and switching back to CNY clears USD metadata', async () => {
  await open(); await balancedRows()
  await fillField(panel(), 'departmentId', 9)
  await fillField(panel(), 'currencyCode', 'USD')
  expect(panel().get('[data-field="exchangeRate"] input').element.value).toBe('')
  await fillField(panel(), 'exchangeRate', 7.1); await fillField(panel(), 'foreignAmount', 100)
  await selectLine(1)
  expect(panel().get('[data-field="departmentId"] select').element.value).toBe('')
  expect(panel().get('[data-field="currencyCode"] select').element.value).toBe('CNY')
  await selectLine(0)
  expect(panel().get('[data-field="departmentId"] select').element.value).toBe('9')
  expect(panel().get('[data-field="foreignAmount"] input').element.value).toBe('100')
  await fillField(panel(), 'currencyCode', 'CNY')
  await clickButton(wrapper, '保存凭证')
  expect(mocks.create.mock.calls[0][0].items[0]).toMatchObject({ departmentId: 9, costCenterId: null, exchangeRate: 1, foreignAmount: null })
})

test('USD accounts select and lock USD; a stale CNY line cannot save until valid USD metadata is supplied', async () => {
  const data = options(); data.accounts[0].currencyCode = 'USD'; data.accounts[1].currencyCode = 'CNY'
  mocks.options.mockResolvedValue({ data })
  await open(); await balancedRows()
  const currency = panel().get('[data-field="currencyCode"] select')
  expect(currency.element.value).toBe('USD')
  expect(currency.element.disabled).toBe(true)
  expect(panel().text()).toContain('所选科目原币为 USD')
  const selector = panel().get('[data-field="currencyCode"]').getComponent(financeStubs.ElSelect)
  selector.vm.$emit('update:modelValue', 'CNY')
  await flushPromises(); await clickButton(wrapper, '保存凭证')
  expect(mocks.create).not.toHaveBeenCalled()
  expect(mocks.warning).toHaveBeenLastCalledWith('第 1 行：该科目原币为 USD，请使用美元并填写外币金额及汇率')
  selector.vm.$emit('update:modelValue', 'USD')
  await flushPromises()
  await fillField(panel(), 'exchangeRate', 7.1); await fillField(panel(), 'foreignAmount', 100)
  await selectLine(1)
  expect(panel().get('[data-field="currencyCode"] select').element.disabled).toBe(false)
  await clickButton(wrapper, '保存凭证')
  expect(mocks.create).toHaveBeenCalledOnce()
  expect(mocks.create.mock.calls[0][0].items[0]).toMatchObject({ currencyCode: 'USD', foreignAmount: 100, exchangeRate: 7.1, debitAmount: 710 })
})

test('account currency validation rejects CNY on explicit USD accounts while CNY or unspecified accounts allow valid USD entries', () => {
  const form = { items: [
    { ...createManualItem(), accountId: 11, debitAmount: 710 },
    { ...createManualItem(), accountId: 12, creditAmount: 710 },
  ] }
  expect(manualEntryError(form, [{ id: 11, currencyCode: 'USD' }, { id: 12 }])).toContain('该科目原币为 USD')
  Object.assign(form.items[0], { currencyCode: 'USD', exchangeRate: 7.1, foreignAmount: 100 })
  for (const currencyCode of ['USD', 'CNY', undefined]) {
    expect(manualEntryError(form, [{ id: 11, currencyCode }, { id: 12 }])).toBe('')
  }
})

test('auxiliary rules use Chinese required messages and real form clears error state when changing selected lines', async () => {
  const data = options(); data.accounts[0].hasCustomer = true
  mocks.options.mockResolvedValue({ data })
  await open({ ElForm, ElFormItem })
  await balancedRows()
  const auxForm = () => wrapper.findAllComponents(ElForm).find(form => form.classes().includes('manual-aux-grid'))
  // Vue's template ref exposes the real form API even when VTU does not proxy it.
  const auxFields = () => wrapper.vm.$refs.manualAuxFormRef.fields
  expect(auxForm().props('rules').customerId[0]).toMatchObject({ required: true, message: '请选择客户' })
  expect(auxForm().props('model').customerId).toBeNull()
  expect(auxFields().map(field => field.prop)).toContain('customerId')
  const validator = () => new AsyncValidator(auxForm().props('rules'))
  const invalid = await validator().validate(auxForm().props('model')).catch(error => error)
  expect(invalid.fields.customerId[0].message).toBe('请选择客户')
  const field = auxFields().find(field => field.prop === 'customerId')
  field.validateMessage = invalid.fields.customerId[0].message
  field.validateState = 'error'
  await flushPromises()
  await expect.poll(() => panel().text()).toContain('请选择客户')
  expect(panel().text()).not.toContain('customerId is required')
  await selectLine(1)
  await expect.poll(() => panel().find('.el-form-item__error').exists()).toBe(false)
  await selectLine(0)
  const customer = panel().findAllComponents(ElFormItem).find(item => item.props('prop') === 'customerId')
  await customer.get('select').setValue('125')
  await validator().validate(auxForm().props('model'))
  await flushPromises()
  await expect.poll(() => panel().find('.el-form-item__error').exists()).toBe(false)
})

test('rejects missing required auxiliary values and mismatched USD amounts without submitting or changing entered CNY', async () => {
  const data = options(); data.accounts[0].hasDepartment = true
  mocks.options.mockResolvedValue({ data })
  await open(); await balancedRows()
  await clickButton(wrapper, '保存凭证')
  expect(mocks.warning).toHaveBeenLastCalledWith('第 1 行：该科目必须填写部门')
  await fillField(panel(), 'departmentId', 9)
  await fillField(panel(), 'currencyCode', 'USD')
  await clickButton(wrapper, '保存凭证')
  expect(mocks.warning).toHaveBeenLastCalledWith('第 1 行：请填写美元汇率（1 USD = x CNY）')
  await fillField(panel(), 'exchangeRate', 7); await fillField(panel(), 'foreignAmount', 100)
  await clickButton(wrapper, '保存凭证')
  expect(mocks.warning).toHaveBeenLastCalledWith('第 1 行：人民币金额应等于美元金额 × 汇率（保留两位小数）')
  expect(wrapper.findAll('[data-column="借方"] input')[0].element.value).toBe('710')
  expect(mocks.create).not.toHaveBeenCalled()
})

test.each(['failure', 'malformed'])('options %s is visible and retryable, and save is blocked until complete', async kind => {
  if (kind === 'failure') mocks.options.mockRejectedValueOnce(new Error('选项服务暂时不可用'))
  else mocks.options.mockResolvedValueOnce({ data: { accounts: [] } })
  await open()
  expect(wrapper.get('[role="alert"]').text()).toContain(kind === 'failure' ? '选项服务暂时不可用' : '凭证选项数据不完整')
  expect(wrapper.findAll('button').find(button => button.text() === '保存凭证').attributes('disabled')).toBeDefined()
  await clickButton(wrapper, '重新加载选项')
  expect(mocks.options).toHaveBeenCalledTimes(2)
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  expect(wrapper.findAll('button').find(button => button.text() === '保存凭证').attributes('disabled')).toBeUndefined()
})

test('reopening refreshes options and a previous window response cannot overwrite the current options', async () => {
  const old = deferred(); mocks.options.mockReturnValueOnce(old.promise)
  await open()
  await wrapper.setProps({ modelValue: false })
  const latest = options(); latest.departments = [{ id: 20, name: '最新部门' }]
  mocks.options.mockResolvedValueOnce({ data: latest })
  await wrapper.setProps({ modelValue: true }); await flushPromises()
  old.resolve({ data: options() }); await flushPromises()
  expect(mocks.options).toHaveBeenCalledTimes(2)
  expect(panel().get('[data-field="departmentId"]').text()).toContain('最新部门')
  expect(panel().get('[data-field="departmentId"]').text()).not.toContain('生产部')
})

test('a failed save leaves the complete manual voucher available for retry', async () => {
  mocks.create.mockRejectedValueOnce(new Error('服务器暂时无法保存'))
  await open(); await balancedRows()
  await fillField(wrapper, 'documentNumber', 'KEEP-100')
  await clickButton(wrapper, '保存凭证')
  expect(mocks.error).toHaveBeenCalledWith('服务器暂时无法保存')
  expect(wrapper.emitted('success')).toBeUndefined()
  expect(wrapper.get('[data-field="documentNumber"] input').element.value).toBe('KEEP-100')
  await clickButton(wrapper, '保存凭证')
  expect(mocks.create).toHaveBeenCalledTimes(2)
  expect(mocks.create.mock.calls[1][0]).toEqual(mocks.create.mock.calls[0][0])
})

test('manual save locks before asynchronous validation and releases the lock when validation rejects', async () => {
  const pending = deferred()
  const validate = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(true)
  const SlowForm = defineComponent({ setup(_props, { expose, slots }) {
    expose({ validate, clearValidate() {} })
    return () => h('form', slots.default?.())
  } })
  await open({ ElForm: SlowForm }); await balancedRows()
  const save = () => wrapper.findAllComponents(financeStubs.ElButton).find(item => item.text() === '保存凭证')
  save().vm.$emit('click'); save().vm.$emit('click'); await flushPromises()
  expect(validate).toHaveBeenCalledOnce()
  expect(mocks.create).not.toHaveBeenCalled()
  pending.reject(new Error('invalid')); await flushPromises()
  await clickButton(wrapper, '保存凭证')
  expect(mocks.create).toHaveBeenCalledOnce()
})

test('closing and reopening cannot reset an in-flight manual save lock or close the new form on completion', async () => {
  const pending = deferred(); mocks.create.mockReturnValueOnce(pending.promise)
  await open(); await balancedRows(); await clickButton(wrapper, '保存凭证')
  await wrapper.setProps({ modelValue: false })
  wrapper.findAllComponents(financeStubs.AppDialog)[0].vm.$emit('closed')
  await wrapper.setProps({ modelValue: true }); await flushPromises(); await balancedRows(99)
  const save = wrapper.findAllComponents(financeStubs.ElButton).find(item => item.text() === '保存凭证')
  save.vm.$emit('click'); await flushPromises()
  expect(mocks.create).toHaveBeenCalledOnce()
  pending.resolve({ data: { id: 88 } }); await flushPromises()
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  expect(wrapper.findAll('[data-column="借方"] input')[0].element.value).toBe('99')
  await clickButton(wrapper, '保存凭证')
  expect(mocks.create).toHaveBeenCalledTimes(2)
})

test('account requirements use real boolean flags, distinguish department and cost center, and require project text', () => {
  const account = { id: 11, isActive: true, hasDepartment: '1', hasProject: '1', hasEmployee: '0' }
  const form = { attachmentCount: 0, items: [{ ...createManualItem(), accountId: 11, debitAmount: 100, costCenterId: 9 }, { ...createManualItem(), accountId: 12, creditAmount: 100 }] }
  const accounts = [account, { id: 12 }]
  expect(manualEntryError(form, accounts)).toContain('必须填写部门')
  form.items[0].departmentId = 5
  expect(manualEntryError(form, accounts)).toContain('必须填写项目名称')
  form.items[0].projectName = '项目甲'
  expect(manualEntryError(form, accounts)).toBe('')
  expect(manualEntryPayload(form).items[0]).toMatchObject({ departmentId: 5, costCenterId: 9, projectName: '项目甲', employeeId: null, employeeSource: null })
})

test('a voucher with no optional employee sends no employee source on either line', async () => {
  await open(); await balancedRows()
  await clickButton(wrapper, '保存凭证')
  expect(mocks.create).toHaveBeenCalledOnce()
  expect(mocks.create.mock.calls[0][0].items.map(item => [item.employeeId, item.employeeSource])).toEqual([[null, null], [null, null]])
})

test.each([
  [1, 1.005, 1.01],
  [1, 1.00499999, 1],
  [99999999.01, 1.5, 149999998.52],
  [9999999999, 1.005, 10049999999],
  [1000000, 1e-8, 0.01],
])('USD %s × rate %s validates the exact half-up CNY amount %s', (foreignAmount, exchangeRate, cny) => {
  const form = { items: [
    { ...createManualItem(), accountId: 11, currencyCode: 'USD', foreignAmount, exchangeRate, debitAmount: cny },
    { ...createManualItem(), accountId: 12, creditAmount: cny },
  ] }
  expect(manualEntryError(form, [{ id: 11 }, { id: 12 }])).toBe('')
  form.items[0].debitAmount = cny + 0.01
  form.items[1].creditAmount = cny + 0.01
  expect(manualEntryError(form, [{ id: 11 }, { id: 12 }])).toContain('人民币金额应等于美元金额 × 汇率')
})

test('flat accounts become a selectable hierarchy without enabling inactive ancestor branches', () => {
  const result = prepareAccountOptions([
    { id: 1, accountCode: '1001', accountName: '现金', isActive: '1' },
    { id: 2, parentId: 1, accountCode: '100101', accountName: '人民币现金', isActive: 1 },
    { id: 3, accountCode: '2000', accountName: '禁用', isActive: '0' },
    { id: 4, parentId: 3, accountCode: '200001', accountName: '不能选', isActive: true },
  ])
  expect(result.flat.map(account => account.id)).toEqual([1, 2])
  expect(result.tree).toHaveLength(1)
  expect(result.tree[0].children[0]).toMatchObject({ id: 2, fullName: '100101 - 人民币现金' })
})
