import { createPinia } from 'pinia'
import { defineComponent, h, KeepAlive, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import APInvoices from '@/views/finance/ap/Invoices.vue'
import CreditNoteActions from '@/views/finance/components/CreditNoteActions.vue'
import Expenses from '@/views/finance/expenses/Expenses.vue'
import EntryFormDialog from '@/views/finance/gl/entries/EntryFormDialog.vue'
import BankTransactions from '@/views/finance/cash/Transactions.vue'
import Reconciliation from '@/views/finance/cash/Reconciliation.vue'
import CashTransactions from '@/views/finance/cash/CashTransactions.vue'
import TaxInvoices from '@/views/finance/tax/TaxInvoices.vue'
import TaxReturns from '@/views/finance/tax/TaxReturns.vue'
import BudgetList from '@/views/finance/budget/BudgetList.vue'
import PeriodClosing from '@/views/finance/gl/PeriodClosing.vue'
import { clickButton, fillField, financeDirectives, financeStubs } from './helpers/financeFormHarness'

const mocks = vi.hoisted(() => {
  const methods = names => Object.fromEntries(names.map(name => [name, vi.fn()]))
  return {
    api: {
      ...methods(['getAPInvoices', 'getAPInvoice', 'getAPInvoicePayments', 'generateAPInvoiceNumber', 'createAPInvoice', 'updateAPInvoice', 'getBankAccounts', 'createPayment', 'createCreditNoteRefund', 'getExpenses', 'getExpense', 'getExpenseCategories', 'getExpenseStats', 'generateExpenseNumber', 'createExpense', 'updateExpense', 'submitExpense', 'payExpense', 'createEntry', 'getCashFlowStatistics']),
      settings: methods(['getOptions']), cost: methods(['getCostCenterOptions']),
      tax: methods(['getRedLetterOriginals', 'createRedLetter', 'getInvoices', 'getReturns', 'payReturn']), accounts: methods(['getOptions']),
      budgets: methods(['getList']),
      integration: methods(['getEligiblePurchaseReceipts', 'getEligibleSalesOutbounds', 'batchPreviewFromOrders', 'batchGenerateFromOrders']),
      bankTransactions: methods(['getList', 'getDetail', 'getTransferRequests', 'update', 'create', 'createTransfer']),
      reconciliation: methods(['getStatementItems', 'getPossibleMatches', 'getMatchedTransaction', 'confirmMatch']),
      periods: methods(['getList']),
      glClosing: methods(['preview', 'execute', 'history', 'getUnpostedEntries', 'updateUnpostedEntryDates']),
      postEntry: vi.fn(), getEntryItems: vi.fn(),
      getBankReconciliationBalanceSheet: vi.fn(),
      cashTransactions: methods(['getList', 'getStats', 'update', 'create', 'void']),
    },
    suppliers: vi.fn(), materials: vi.fn(), customers: vi.fn(),
    message: methods(['success', 'error', 'warning', 'info']), box: methods(['confirm', 'prompt']),
    print: methods(['generateByDefaultTemplate', 'previewDocument']), push: vi.fn(),
  }
})
vi.mock('@/api', () => ({ financeApi: mocks.api, salesApi: { getCustomers: mocks.customers }, purchaseApi: { getSuppliers: mocks.suppliers } }))
vi.mock('@/api/finance', () => ({ financeApi: mocks.api }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ hasPermission: () => true, user: { id: 8 } }) }))
vi.mock('@/stores/dictionary', () => ({ useDictionaryStore: () => ({ getOptions: () => [] }) }))
vi.mock('@/utils/optionLoaders', () => ({ searchSupplierOptions: mocks.suppliers, searchMaterialOptions: mocks.materials, loadDepartmentOptions: async () => [], loadUserListOptions: async () => [] }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }), useRoute: () => ({ query: {} }) }))
vi.mock('@/services/printService', () => ({ default: mocks.print }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: mocks.message }))
vi.mock('element-plus/es/components/message/style/css', () => ({}))
vi.mock('element-plus/es/components/message-box/index', () => ({ ElMessageBox: mocks.box }))

let wrapper
const open = async (component, props = {}) => {
  wrapper = mount(component, { props, global: { plugins: [createPinia()], stubs: financeStubs, directives: financeDirectives } })
  await flushPromises()
  return wrapper
}
const bankConfig = {
  transactionTypes: [{ label: '收入', value: 'income' }, { label: '支出', value: 'expense' }, { label: '转账', value: 'transfer' }],
  paymentMethods: [{ label: '银行转账', value: 'bank_transfer' }, { label: '电子支付', value: 'electronic_payment' }],
  transactionCategories: { income: [{ label: '其他收入', value: 'other_income' }], expense: [{ label: '办公费用', value: 'office_expense' }], transfer: [{ label: '资金调拨', value: 'fund_allocation' }] },
}
const apInvoice = () => ({ id: 7, invoiceNumber: 'AP-7', supplierId: 9, supplierName: '测试供应商', invoiceDate: '2026-09-16', dueDate: '2026-09-30', status: '草稿', taxRate: 0.13, taxAmount: 39, totalAmount: 339, paidAmount: 0, balanceAmount: 339, items: [{ id: 71, materialId: 501, materialName: '办公产品', quantity: 3, unitPrice: 100, amount: 300 }] })
const expense = () => ({ id: 12, expenseNumber: 'EXP-12', categoryId: 4, title: '办公报销', amount: 88, expenseDate: '2026-09-16', invoiceNumber: 'TAX-88', status: 'draft', payee: '测试收款方' })
const resetMocks = object => Object.values(object).forEach(value => {
  if (vi.isMockFunction(value)) value.mockReset().mockResolvedValue({ data: {} })
  else if (value && typeof value === 'object') resetMocks(value)
})
beforeEach(() => {
  resetMocks(mocks)
  mocks.api.settings.getOptions.mockResolvedValue({ data: { bank: bankConfig } })
  mocks.box.confirm.mockResolvedValue('confirm')
  mocks.api.getAPInvoices.mockResolvedValue({ data: { list: [apInvoice()], total: 1 } })
  mocks.api.getAPInvoice.mockImplementation(async () => ({ data: apInvoice() }))
  mocks.api.getAPInvoicePayments.mockResolvedValue({ data: [] })
  mocks.api.generateAPInvoiceNumber.mockResolvedValue({ data: { invoiceNumber: 'AP-8' } })
  mocks.api.createAPInvoice.mockResolvedValue({ data: { id: 8 } })
  mocks.suppliers.mockResolvedValue([{ id: 9, name: '测试供应商', code: 'SUP-9' }])
  mocks.materials.mockResolvedValue([{ id: 501, name: '办公产品', code: 'M501', price: 100 }])
  mocks.customers.mockResolvedValue({ data: [] })
  mocks.api.getBankAccounts.mockResolvedValue({ data: [{ id: 3, accountName: '银行A', bankName: '测试银行', balance: 1000 }, { id: 4, accountName: '银行B', balance: 10 }] })
  mocks.api.getExpenses.mockResolvedValue({ data: { list: [expense()], total: 1 } })
  mocks.api.getExpense.mockImplementation(async () => ({ data: expense() }))
  mocks.api.getExpenseCategories.mockResolvedValue({ data: [{ id: 4, name: '办公费用' }] })
  mocks.api.getExpenseStats.mockResolvedValue({ data: { overview: { totalCount: 1, pendingCount: 0, approvedCount: 0, paidAmount: 0 } } })
  mocks.api.cost.getCostCenterOptions.mockResolvedValue({ data: [{ id: 7, name: '总经办' }] })
  mocks.api.createExpense.mockResolvedValue({ data: { id: 13, expenseNumber: 'EXP-13' } })
  mocks.api.accounts.getOptions.mockResolvedValue({ data: [
    { id: 11, accountCode: '560202', accountName: '办公费', isActive: true },
    { id: 12, accountCode: '2241', accountName: '其他应付款', isActive: true },
    { id: 99, accountCode: '6602', accountName: '停用科目', isActive: false },
  ] })
  mocks.api.bankTransactions.getList.mockResolvedValue({ data: { list: [], total: 0 } })
  mocks.api.bankTransactions.getTransferRequests.mockResolvedValue({ data: { list: [], total: 0 } })
  mocks.api.getCashFlowStatistics.mockResolvedValue({ data: { summary: { totalCount: 0 } } })
  mocks.api.cashTransactions.getList.mockResolvedValue({ data: { transactions: [], total: 0 } })
  mocks.api.cashTransactions.getStats.mockResolvedValue({ data: {} })
})
afterEach(() => wrapper?.unmount())

describe('采购发票父子表单', () => {
  test('缺物料阻止保存，选择物料后按明细计算339元并提交', async () => {
    await open(APInvoices)
    await clickButton(wrapper, '期初/例外录入')
    const form = wrapper.get('[data-dialog="期初/例外录入采购发票"]')
    await fillField(form, 'supplierId', 9)
    await fillField(form, 'dueDate', '2026-09-30')
    await form.get('[data-column="数量"] input').setValue('3')
    await form.get('[data-column="单价"] input').setValue('100')
    await clickButton(form, '保存')
    expect(mocks.api.createAPInvoice).not.toHaveBeenCalled()
    expect(mocks.api.generateAPInvoiceNumber).not.toHaveBeenCalled()
    await form.get('[data-column="物料/服务"] select').setValue('501')
    await clickButton(form, '保存')
    expect(mocks.api.createAPInvoice).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      totalAmount: 339, items: [expect.objectContaining({ materialId: 501, quantity: 3, unitPrice: 100, amount: 300 })],
    }))
    expect(wrapper.find('[data-dialog]').exists()).toBe(false)
  })
  test('编辑保留物料并把3件改为2件，提交226元', async () => {
    await open(APInvoices); await clickButton(wrapper, '编辑')
    const form = wrapper.get('[data-dialog="编辑采购发票"]')
    expect(form.get('[data-column="物料/服务"] select').element.value).toBe('501')
    await form.get('[data-column="数量"] input').setValue('2')
    await clickButton(form, '保存')
    expect(mocks.api.updateAPInvoice).toHaveBeenCalledExactlyOnceWith(7, expect.objectContaining({ totalAmount: 226, taxRate: 0.13, items: [expect.objectContaining({ id: 71, materialId: 501, quantity: 2, amount: 200 })] }))
  })
  test('付款需要账户，填写后提交剩余339元', async () => {
    mocks.api.getAPInvoices.mockResolvedValue({ data: { list: [{ ...apInvoice(), status: '已确认' }], total: 1 } })
    await open(APInvoices); await clickButton(wrapper, '付款')
    const form = wrapper.findAll('[data-dialog]')[0]
    await clickButton(form, '确认')
    expect(mocks.api.createPayment).not.toHaveBeenCalled()
    await fillField(form, 'bankAccountId', 3)
    await clickButton(form, '确认')
    expect(mocks.api.createPayment).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ invoiceId: 7, amount: 339, bankAccountId: 3 }))
  })
  test('详情打印使用百分数税率和分摊后行税额', async () => {
    await open(APInvoices); await clickButton(wrapper, '查看'); await clickButton(wrapper, '打印')
    expect(mocks.print.generateByDefaultTemplate).toHaveBeenCalledExactlyOnceWith('finance', 'ap_invoice', expect.objectContaining({
      tax_rate: '13%', tax_amount: '¥39.00', total_amount: '¥339.00',
      items: [expect.objectContaining({ material_name: '办公产品', quantity: '3', unit_price: '¥100.00', tax_amount: '¥39.00', amount: '¥300.00' })],
    }))
    expect(mocks.print.previewDocument).toHaveBeenCalledOnce()
  })
})

describe('红字退款和税票按钮', () => {
  const props = { kind: 'ar', invoice: { id: 21, invoiceNumber: 'AR-RED-21', status: '已确认', totalAmount: -226, taxAmount: -26, balanceAmount: -226 } }
  test('退款失败保留输入，重试使用相同幂等号', async () => {
    mocks.api.createCreditNoteRefund.mockRejectedValueOnce({ response: { data: { message: '账户余额不足' } } }).mockResolvedValue({ data: {} })
    await open(CreditNoteActions, props); await clickButton(wrapper, '客户退款')
    const form = wrapper.get('[data-dialog="登记客户退款"]')
    await clickButton(form, '确认退款')
    expect(mocks.api.createCreditNoteRefund).not.toHaveBeenCalled()
    await fillField(form, 'bankAccountId', 3); await fillField(form, 'amount', 100)
    await clickButton(form, '确认退款')
    expect(form.exists()).toBe(true)
    expect(mocks.message.error).toHaveBeenCalledWith('账户余额不足')
    const requestId = mocks.api.createCreditNoteRefund.mock.calls[0][1].requestId
    await clickButton(form, '确认退款')
    expect(mocks.api.createCreditNoteRefund.mock.calls[1]).toEqual(['ar', expect.objectContaining({ invoiceId: 21, amount: 100, bankAccountId: 3, requestId })])
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })
  test('红票自动关联唯一原票，但空税票号码不能保存', async () => {
    mocks.api.tax.getRedLetterOriginals.mockResolvedValue({ data: [{ id: 90, invoiceNumber: 'ORIGINAL', totalAmount: 339 }] })
    await open(CreditNoteActions, props); await clickButton(wrapper, '红字税票')
    const form = wrapper.get('[data-dialog="开具红字税票"]')
    await clickButton(form, '保存红字税票'); expect(mocks.api.tax.createRedLetter).not.toHaveBeenCalled()
    await fillField(form, 'invoiceNumber', 'RED-NEW')
    await clickButton(form, '保存红字税票')
    expect(mocks.api.tax.createRedLetter).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'ar', invoiceId: 21, originalTaxInvoiceId: 90, invoiceNumber: 'RED-NEW' }))
  })
})

describe('费用表单与付款', () => {
  test('编辑显示日期和票号并提交camelCase字段', async () => {
    await open(Expenses); await clickButton(wrapper, '编辑')
    const form = wrapper.get('[data-dialog="编辑费用"]')
    expect(form.get('[data-field="expenseDate"] input').element.value).toBe('2026-09-16')
    expect(form.get('[data-field="发票号码"] input').element.value).toBe('TAX-88')
    await fillField(form, '发票号码', 'TAX-NEW'); await clickButton(form, '保存')
    expect(mocks.api.updateExpense).toHaveBeenCalledExactlyOnceWith(12, expect.objectContaining({ expenseDate: '2026-09-16', invoiceNumber: 'TAX-NEW', amount: 88 }))
  })
  test('保存并提交的审批请求失败后重试不会重复新建费用', async () => {
    mocks.api.submitExpense.mockRejectedValueOnce(new Error('临时失败')).mockResolvedValue({ data: {} })
    await open(Expenses); await clickButton(wrapper, '新增费用')
    let form = wrapper.get('[data-dialog="新增费用"]')
    await fillField(form, 'categoryId', 4); await fillField(form, 'title', '重试费用'); await fillField(form, 'amount', 88)
    await clickButton(form, '保存并提交')
    expect(mocks.api.createExpense).toHaveBeenCalledOnce()
    expect(mocks.api.generateExpenseNumber).not.toHaveBeenCalled()
    form = wrapper.get('[data-dialog="编辑费用"]')
    await clickButton(form, '保存并提交')
    expect(mocks.api.createExpense).toHaveBeenCalledOnce()
    expect(mocks.api.updateExpense).toHaveBeenCalledWith(13, expect.objectContaining({ amount: 88 }))
    expect(mocks.api.submitExpense.mock.calls).toEqual([[13], [13]])
  })
  test('付款携带所选成本中心，超预算错误保留付款表单', async () => {
    mocks.api.getExpenses.mockResolvedValue({ data: { list: [{ ...expense(), status: 'approved' }], total: 1 } })
    mocks.api.payExpense.mockRejectedValue({ response: { data: { message: '预算余额不足' } } })
    await open(Expenses); await clickButton(wrapper, '付款')
    const form = wrapper.get('[data-dialog="费用付款"]')
    await clickButton(form, '确认付款'); expect(mocks.api.payExpense).not.toHaveBeenCalled()
    await fillField(form, 'bankAccountId', 3); await fillField(form, 'costCenterId', 7)
    await clickButton(form, '确认付款')
    expect(mocks.api.payExpense).toHaveBeenCalledExactlyOnceWith(12, expect.objectContaining({ bankAccountId: 3, costCenterId: 7 }))
    expect(wrapper.find('[data-dialog="费用付款"]').exists()).toBe(true)
    expect(mocks.message.error).toHaveBeenCalledWith('付款失败: 预算余额不足')
  })
})

describe('凭证表单实际字段交互', () => {
  test('手工借贷不平不提交，平衡后正确传递科目与借贷金额', async () => {
    await open(EntryFormDialog, { modelValue: false, defaultMode: 'manual' })
    await wrapper.setProps({ modelValue: true }); await flushPromises()
    const form = wrapper.get('[data-dialog="手工录入凭证"]')
    expect(form.text()).not.toContain('停用科目')
    const accounts = form.findAll('[data-column="会计科目"] select')
    await accounts[0].setValue('11'); await accounts[1].setValue('12')
    await form.findAll('[data-column="借方"] input')[0].setValue('55')
    await clickButton(form, '保存凭证'); expect(mocks.api.createEntry).not.toHaveBeenCalled()
    await form.findAll('[data-column="贷方"] input')[1].setValue('55')
    await clickButton(form, '保存凭证')
    expect(mocks.api.createEntry).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ items: [
      expect.objectContaining({ accountId: 11, debitAmount: 55, creditAmount: 0 }),
      expect.objectContaining({ accountId: 12, debitAmount: 0, creditAmount: 55 }),
    ] }))
  })
  test('业务预览修改数量后重算税额并保留后端覆盖字段', async () => {
    mocks.api.integration.getEligiblePurchaseReceipts.mockResolvedValue({ data: { list: [{ id: 30, docNo: 'GR-30', totalAmount: 113, status: 'completed' }], total: 1 } })
    mocks.api.integration.batchPreviewFromOrders.mockResolvedValue({ data: { vouchers: [{
      id: 30, sourceIds: [30], taxRate: 0.13, taxAmount: 13, subtotal: 100, totalAmount: 113, entryDate: '2026-09-16',
      items: [{ sourceId: 30, sourceDocNo: 'GR-30', materialId: 501, materialName: '办公产品', quantity: 1, unitPrice: 100, amount: 100 }],
      entryLines: [{ role: 'cost', accountId: 11, debitAmount: 100, creditAmount: 0 }, { role: 'tax', accountId: 11, debitAmount: 13, creditAmount: 0 }, { role: 'payable', accountId: 12, debitAmount: 0, creditAmount: 113 }],
    }] } })
    mocks.api.integration.batchGenerateFromOrders.mockResolvedValue({ data: { successCount: 1 } })
    await open(EntryFormDialog, { modelValue: false }); await wrapper.setProps({ modelValue: true }); await flushPromises()
    await wrapper.get('[data-column="selection"] input').setValue(true)
    await clickButton(wrapper, '预览凭证（1）')
    const preview = wrapper.get('[data-dialog="凭证预览（1 张）"]')
    await preview.get('[data-column="数量"] input').setValue('2'); await flushPromises()
    expect(preview.text()).toContain('226.00')
    await clickButton(preview, '确认生成合并凭证')
    const data = mocks.api.integration.batchGenerateFromOrders.mock.calls[0][0]
    expect(data.overrides[0]).toMatchObject({ subtotal: 200, taxAmount: 26, totalAmount: 226,
      items: [expect.objectContaining({ material_id: 501, source_id: 30, unit_price: 100, quantity: 2, amount: 200 })],
      entryLines: [expect.objectContaining({ account_id: 11, debit_amount: 200 }), expect.objectContaining({ debit_amount: 26 }), expect.objectContaining({ account_id: 12, credit_amount: 226 })],
    })
  })
})

describe('银行和现金交易编辑', () => {
  test('银行编辑从详情保留真实分类/支付方式，并显示中文类型', async () => {
    const tx = { id: 1, transactionNumber: 'TX-1', transactionDate: '2026-09-16', bankAccountId: 3, accountName: '银行A', transactionType: '取款', amount: 19, transactionCategory: 'office_expense', paymentMethod: 'electronic_payment', relatedParty: '办公采购', description: '纸张', status: 'draft' }
    mocks.api.bankTransactions.getList.mockResolvedValue({ data: { list: [tx], total: 1 } })
    mocks.api.bankTransactions.getDetail.mockResolvedValue({ data: tx })
    await open(BankTransactions)
    expect(wrapper.text()).toContain('办公费用'); expect(wrapper.text()).toContain('电子支付'); expect(wrapper.text()).not.toContain('Expense')
    await clickButton(wrapper, '编辑')
    const form = wrapper.get('[data-dialog="编辑交易"]')
    expect(form.get('input[value="transfer"]').element.disabled).toBe(true)
    expect(form.get('[data-field="category"] select').element.value).toBe('office_expense')
    await fillField(form, 'amount', 20); await clickButton(form, '确认')
    expect(mocks.api.bankTransactions.update).toHaveBeenCalledExactlyOnceWith(1, expect.objectContaining({ amount: 20, category: 'office_expense', paymentMethod: 'electronic_payment', transactionNumber: 'TX-1' }))
  })
  test('现金支出编辑不清空分类且输入0时不发送更新', async () => {
    mocks.api.cashTransactions.getList.mockResolvedValue({ data: { transactions: [{ id: 1, transactionNumber: 'CASH1', transactionDate: '2026-09-16', type: 'expense', category: 'office', amount: 19, description: '纸张', status: 'draft' }], total: 1 } })
    await open(CashTransactions); await clickButton(wrapper, '编辑')
    const form = wrapper.get('[data-dialog="编辑现金交易"]')
    expect(form.get('[data-field="category"] select').element.value).toBe('office')
    await fillField(form, 'amount', 0); await clickButton(form, '确定'); expect(mocks.api.cashTransactions.update).not.toHaveBeenCalled()
    await fillField(form, 'amount', 20); await clickButton(form, '确定')
    expect(mocks.api.cashTransactions.update).toHaveBeenCalledExactlyOnceWith(1, expect.objectContaining({ category: 'office', type: 'expense', amount: 20 }))
  })
  test('现金作废填写原因后刷新状态并移除作废按钮', async () => {
    const tx = { id: 1, transactionNumber: 'CASH1', transactionDate: '2026-09-16', type: 'income', category: 'other', amount: 42, description: '现金收入', status: 'approved' }
    mocks.api.cashTransactions.getList.mockResolvedValueOnce({ data: { transactions: [tx], total: 1 } }).mockResolvedValue({ data: { transactions: [{ ...tx, status: 'void' }], total: 1 } })
    mocks.box.prompt.mockResolvedValue({ value: '  退回现金  ' })
    await open(CashTransactions); await clickButton(wrapper, '作废冲销')
    expect(mocks.box.prompt.mock.calls[0][2].inputValidator('')).toBe('请填写作废原因')
    expect(mocks.api.cashTransactions.void).toHaveBeenCalledExactlyOnceWith(1, { reason: '退回现金' })
    expect(wrapper.text()).toContain('已作废')
    expect(wrapper.text()).not.toContain('作废冲销')
  })
})

describe('银行对账匹配操作', () => {
  test('按交易单号区分同金额流水，确认后查看匹配不再允许重复提交', async () => {
    const statement = { id: 40, referenceNumber: 'BANK-25', transactionDate: '2026-09-16', type: 'income', amount: 25, status: 'unmatched' }
    const transactions = [
      { id: 10, transactionNumber: 'PAY-25', transactionDate: '2026-09-16', type: '转入', amount: 25 },
      { id: 11, transactionNumber: 'RC-25-VOID', transactionDate: '2026-09-16', type: '转入', amount: 25 },
    ]
    mocks.api.getBankAccounts.mockResolvedValue({ data: { list: [{ id: 3, accountName: '银行A' }] } })
    mocks.api.getBankReconciliationBalanceSheet.mockResolvedValue({ data: { bookBalance: 1000, statementBalance: 1000, difference: 0 } })
    mocks.api.reconciliation.getStatementItems.mockResolvedValueOnce({ data: { list: [statement], total: 1 } })
      .mockResolvedValue({ data: { list: [{ ...statement, status: 'matched' }], total: 1 } })
    mocks.api.reconciliation.getPossibleMatches.mockResolvedValue({ data: transactions })
    mocks.api.reconciliation.getMatchedTransaction.mockResolvedValue({ data: [transactions[1]] })
    await open(Reconciliation)
    await fillField(wrapper, '选择账户', 3)
    await clickButton(wrapper, '开始对账'); await clickButton(wrapper, '导入对账单')
    await clickButton(wrapper, '手动匹配')
    const dialog = wrapper.get('[data-dialog="匹配交易记录"]')
    expect(dialog.text()).toContain('BANK-25')
    expect(dialog.get('[data-column="交易单号"]').text()).toContain('PAY-25')
    expect(dialog.get('[data-column="交易单号"]').text()).toContain('RC-25-VOID')
    expect(dialog.findAll('button').find(button => button.text() === '确认匹配').element.disabled).toBe(true)
    await dialog.findAll('[data-column="selection"] input')[1].setValue(true)
    await clickButton(dialog, '确认匹配')
    expect(mocks.api.reconciliation.confirmMatch).toHaveBeenCalledExactlyOnceWith({ statementItemId: 40, transactionIds: [11], accountId: 3 })
    await clickButton(wrapper, '查看匹配')
    const matched = wrapper.get('[data-dialog="匹配交易记录"]')
    expect(matched.text()).toContain('已匹配的账面交易')
    expect(matched.text()).toContain('RC-25-VOID')
    expect(matched.text()).not.toContain('确认匹配')
    expect(matched.find('[data-column="selection"]').exists()).toBe(false)
    await clickButton(matched, '关闭')
    expect(wrapper.find('[data-dialog="匹配交易记录"]').exists()).toBe(false)
  })
})

describe('结转向导返回与凭证处理', () => {
  const openPeriod = { id: 9, periodName: '2026-09', startDate: '2026-09-01', endDate: '2026-09-30', isClosed: false }
  const preview = { canClose: true, period: openPeriod, summary: { totalIncome: 1458, totalExpense: 1040.33, netProfit: 417.67 }, closingItems: [] }
  test('关闭期间不出现在待选项，反关账后返回缓存页面刷新向导和历史', async () => {
    mocks.api.periods.getList.mockResolvedValueOnce({ data: { list: [{ id: 8, periodName: '2026-08', isClosed: true }, openPeriod] } })
      .mockResolvedValueOnce({ data: { list: [{ ...openPeriod, isClosed: true }] } })
      .mockResolvedValue({ data: { list: [openPeriod] } })
    mocks.api.glClosing.preview.mockResolvedValue({ data: preview })
    mocks.api.glClosing.history.mockResolvedValueOnce({ data: { list: [] } }).mockResolvedValue({ data: { list: [{ id: 1, entryNumber: 'PL-REOPEN', description: '期间重新开启冲销' }] } })
    const Host = defineComponent({ setup() { const visible = ref(true); return () => h('main', [h('button', { onClick: () => { visible.value = !visible.value } }, '切换页面'), h(KeepAlive, null, { default: () => visible.value ? h(PeriodClosing) : null })]) } })
    await open(Host)
    expect(wrapper.get('[data-field="待结转期间"] select').text()).not.toContain('2026-08')
    await clickButton(wrapper, '下一步'); await clickButton(wrapper, '确认并执行结转')
    expect(wrapper.text()).toContain('期末结转完成')
    expect(mocks.api.glClosing.execute).toHaveBeenCalledExactlyOnceWith(9)
    await clickButton(wrapper, '切换页面'); await clickButton(wrapper, '切换页面')
    expect(mocks.api.periods.getList).toHaveBeenCalledTimes(3)
    expect(wrapper.text()).not.toContain('期末结转完成')
    expect(wrapper.text()).toContain('PL-REOPEN')
    await clickButton(wrapper, '下一步')
    expect(wrapper.text()).toContain('417.67')
  })
  test('批量过账先修正异常日期，期间末日按钮回填两日期后继续过账所有正常凭证', async () => {
    const entry = { id: 101, entryNumber: 'JE-101', entryDate: '2026-08-31', postingDate: '2026-08-31', periodId: 9, periodName: '2026-09', periodStartDate: '2026-09-01', periodEndDate: '2026-09-30', dateValid: false, postingReady: false, totalDebit: 7, totalCredit: 7 }
    const valid = { ...entry, id: 102, entryNumber: 'JE-102', entryDate: '2026-09-17', postingDate: '2026-09-17', dateValid: true, postingReady: true }
    mocks.api.periods.getList.mockResolvedValue({ data: { list: [openPeriod] } })
    mocks.api.glClosing.history.mockResolvedValue({ data: { list: [] } })
    mocks.api.glClosing.preview.mockResolvedValue({ data: { ...preview, canClose: false, checks: [{ key: 'unposted_entries', name: '无未过账凭证', passed: false }] } })
    mocks.api.glClosing.getUnpostedEntries.mockResolvedValueOnce({ data: { entries: [entry, valid] } })
      .mockResolvedValueOnce({ data: { entries: [{ ...entry, dateValid: true, postingReady: true }, valid] } })
      .mockResolvedValue({ data: { entries: [] } })
    await open(PeriodClosing)
    await clickButton(wrapper, '下一步'); await clickButton(wrapper, '查看并过账'); await clickButton(wrapper, '一键过账')
    const dates = wrapper.get('[data-dialog="修正日期：JE-101"]')
    expect(dates.text()).toContain('2026-09-01')
    expect(dates.text()).toContain('2026-09-30')
    await clickButton(dates, '使用期间末日')
    expect(dates.get('[data-field="凭证日期"] input').element.value).toBe('2026-09-30')
    expect(dates.get('[data-field="过账日期"] input').element.value).toBe('2026-09-30')
    await clickButton(dates, '修正并继续一键过账')
    expect(mocks.api.glClosing.updateUnpostedEntryDates).toHaveBeenCalledExactlyOnceWith(101, { entry_date: '2026-09-30', posting_date: '2026-09-30', period_id: 9 })
    expect(mocks.api.postEntry.mock.calls.map(([id]) => id)).toEqual([101, 102])
    expect(wrapper.find('[data-dialog="修正日期：JE-101"]').exists()).toBe(false)
  })
})

describe('税务列表分页与返回刷新', () => {
  const taxPage = { list: [{ id: 1, invoiceNumber: 'TAX-PAGE-1', invoiceType: '进项', taxAmount: 13, totalAmount: 113, status: '未认证' }], total: 23, stats: { total: 23, pending: 4, inputTax: 117, outputTax: 130 } }
  test('分页采用后端总数，汇总金额不随当前页缩小，查询重置页码', async () => {
    mocks.api.tax.getInvoices.mockResolvedValue({ data: taxPage })
    await open(TaxInvoices)
    expect(wrapper.get('[data-pagination]').text()).toContain('23')
    expect(wrapper.text()).toContain('¥117.00'); expect(wrapper.text()).toContain('¥130.00')
    await clickButton(wrapper, '下一页')
    expect(mocks.api.tax.getInvoices).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 10, limit: 10 }))
    await clickButton(wrapper, '查询')
    expect(mocks.api.tax.getInvoices).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0, limit: 10 }))
  })
  test.each([['tax', TaxInvoices], ['budget', BudgetList]])('返回缓存列表会取回最新业务状态：%s', async (kind, component) => {
    const fetch = kind === 'tax' ? mocks.api.tax.getInvoices : mocks.api.budgets.getList
    fetch.mockResolvedValueOnce({ data: kind === 'tax' ? taxPage : { list: [{ id: 1, budgetNo: 'BG-1', budgetName: '预算', status: 'draft' }], total: 1 } })
      .mockResolvedValue({ data: kind === 'tax' ? { ...taxPage, list: [{ ...taxPage.list[0], invoiceNumber: 'RED-REISSUED' }] } : { list: [{ id: 1, budgetNo: 'BG-1', budgetName: '预算', status: 'executing' }], total: 1 } })
    const Host = defineComponent({ setup() { const visible = ref(true); return () => h('main', [h('button', { onClick: () => { visible.value = !visible.value } }, '切换页面'), h(KeepAlive, null, { default: () => visible.value ? h(component) : null })]) } })
    await open(Host)
    expect(fetch).toHaveBeenCalledOnce()
    await clickButton(wrapper, '切换页面'); await clickButton(wrapper, '切换页面')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain(kind === 'tax' ? 'RED-REISSUED' : '关闭')
  })
  test('纳税申报保留分页总数且缴税账户显示实际余额', async () => {
    mocks.api.tax.getReturns.mockResolvedValue({ data: { list: [{ id: 1, returnPeriod: '2026-09', returnType: '增值税', status: '已申报', taxPayable: 13 }], total: 12 } })
    await open(TaxReturns)
    expect(wrapper.get('[data-pagination]').text()).toContain('12')
    await clickButton(wrapper, '缴纳税款')
    const dialog = wrapper.get('[data-dialog="缴纳税款"]')
    expect(dialog.text()).toContain('银行A（余额 1,000.00）')
    expect(dialog.get('[data-field="付款账户"] select').element.value).toBe('3')
    await clickButton(dialog, '确认缴纳')
    expect(mocks.api.tax.payReturn).toHaveBeenCalledExactlyOnceWith(1, expect.objectContaining({ bank_account_id: 3 }))
  })
})
