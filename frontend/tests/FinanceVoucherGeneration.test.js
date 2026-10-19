import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import EntryFormDialog from '@/views/finance/gl/entries/EntryFormDialog.vue'
import { clickButton, financeDirectives, financeStubs } from './helpers/financeFormHarness'

const mocks = vi.hoisted(() => ({ receipts: vi.fn(), outbounds: vi.fn(), preview: vi.fn(), generate: vi.fn(), options: vi.fn(), confirm: vi.fn(), error: vi.fn(), warning: vi.fn(), success: vi.fn() }))
vi.mock('@/api', () => ({ financeApi: {
  getEntryOptions: mocks.options,
  integration: { getEligiblePurchaseReceipts: mocks.receipts, getEligibleSalesOutbounds: mocks.outbounds, batchPreviewFromOrders: mocks.preview, batchGenerateFromOrders: mocks.generate },
} }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { error: mocks.error, warning: mocks.warning, success: mocks.success } }))
vi.mock('element-plus/es/components/message-box/index', () => ({ ElMessageBox: { confirm: mocks.confirm } }))

const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail }); return { promise, resolve, reject } }
const source = (id = 30, currencyCode = 'CNY') => ({ id, docNo: `SOURCE-${id}`, totalAmount: 113, currencyCode, status: 'completed' })
const page = list => ({ data: { list, total: list.length } })
const draft = () => ({ id: 30, docNo: 'SOURCE-30', sourceIds: [30], totalAmount: 113, subtotal: 113, currencyCode: 'CNY', items: [], entryLines: [{ accountId: 11, debitAmount: 113, creditAmount: 0 }, { accountId: 12, debitAmount: 0, creditAmount: 113 }] })
let wrapper
const open = async (defaultMode = 'business') => {
  wrapper = mount(EntryFormDialog, { props: { modelValue: true, defaultMode }, global: { stubs: financeStubs, directives: financeDirectives } })
  await flushPromises()
}
const select = async (index = 0, checked = true) => { await wrapper.findAll('[data-column="selection"] input')[index].setValue(checked); await flushPromises() }
const button = label => wrapper.findAllComponents(financeStubs.ElButton).find(item => item.text().trim() === label)
const emitClick = async label => { button(label).vm.$emit('click'); await flushPromises() }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.receipts.mockResolvedValue(page([source()]))
  mocks.outbounds.mockResolvedValue(page([source(40)]))
  mocks.options.mockResolvedValue({ data: { accounts: [], customers: [], suppliers: [], departments: [], costCenters: [], employees: [] } })
  mocks.preview.mockResolvedValue({ data: { vouchers: [draft()] } })
  mocks.generate.mockResolvedValue({ data: { successCount: 1, results: [] } })
  mocks.confirm.mockResolvedValue('confirm')
})
afterEach(() => { wrapper?.unmount(); wrapper = null })

test('direct generation locks before confirmation and sends one captured selection', async () => {
  const confirmation = deferred(); const request = deferred()
  mocks.confirm.mockReturnValue(confirmation.promise); mocks.generate.mockReturnValue(request.promise)
  await open(); await select()
  await emitClick('直接生成凭证'); await emitClick('直接生成凭证')
  expect(mocks.confirm).toHaveBeenCalledOnce()
  expect(button('取消').attributes('disabled')).toBeDefined()
  confirmation.resolve('confirm'); await flushPromises()
  await emitClick('直接生成凭证')
  expect(mocks.generate).toHaveBeenCalledExactlyOnceWith({ businessType: 'purchase_receipt', ids: [30], merge: true })
  request.resolve({ data: { successCount: 1, results: [] } }); await flushPromises()
  expect(wrapper.emitted('success')).toHaveLength(1)
})

test('preview generation locks throughout confirmation and retains the reviewed payload', async () => {
  const confirmation = deferred(); mocks.confirm.mockReturnValue(confirmation.promise)
  await open(); await select(); await clickButton(wrapper, '预览凭证（1）')
  await emitClick('确认生成凭证'); await emitClick('确认生成凭证')
  expect(mocks.confirm).toHaveBeenCalledOnce()
  expect(button('返回修改选择').attributes('disabled')).toBeDefined()
  confirmation.resolve('confirm'); await flushPromises()
  expect(mocks.generate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ ids: [30], overrides: [expect.objectContaining({ totalAmount: 113 })] }))
})

test('closed confirmation cannot submit into a reopened dialog, and cancelling can open the preview', async () => {
  const confirmation = deferred(); mocks.confirm.mockReturnValueOnce(confirmation.promise)
  await open(); await select(); await emitClick('直接生成凭证')
  await wrapper.setProps({ modelValue: false }); await wrapper.setProps({ modelValue: true }); await flushPromises()
  await select(); await emitClick('直接生成凭证')
  expect(mocks.confirm).toHaveBeenCalledOnce()
  confirmation.resolve('confirm'); await flushPromises()
  expect(mocks.generate).not.toHaveBeenCalled()
  mocks.confirm.mockRejectedValueOnce('cancel')
  await emitClick('直接生成凭证')
  expect(mocks.preview).toHaveBeenCalledOnce()
  expect(wrapper.find('[data-dialog="应付凭证预览（1 张）"]').exists()).toBe(true)
})

test('a late receipt response cannot replace a newer sales source list', async () => {
  const old = deferred(); mocks.receipts.mockReturnValue(old.promise)
  await open()
  await wrapper.get('input[value="sales_outbound"]').setValue(true); await flushPromises()
  expect(wrapper.text()).toContain('SOURCE-40')
  old.resolve(page([source(99)])); await flushPromises()
  expect(wrapper.text()).toContain('SOURCE-40')
  expect(wrapper.text()).not.toContain('SOURCE-99')
})

test('only the newest keyword response is applied and a closed request cannot report errors', async () => {
  await open()
  const older = deferred(); const latest = deferred()
  mocks.receipts.mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise)
  const search = wrapper.get('input[placeholder="入库单号 / 采购订单号 / 供应商"]')
  await search.setValue('old'); await search.trigger('keyup.enter')
  await search.setValue('new'); await search.trigger('keyup.enter')
  latest.resolve(page([source(77)])); await flushPromises()
  older.resolve(page([source(88)])); await flushPromises()
  expect(wrapper.text()).toContain('SOURCE-77'); expect(wrapper.text()).not.toContain('SOURCE-88')
  const closed = deferred(); mocks.receipts.mockReturnValueOnce(closed.promise)
  await search.setValue('closed'); await search.trigger('keyup.enter')
  await wrapper.setProps({ modelValue: false })
  closed.reject(new Error('stale failure')); await flushPromises()
  expect(mocks.error).not.toHaveBeenCalled()
})

test('closing a loading preview invalidates its response and preserves the next preview', async () => {
  const old = deferred(); mocks.preview.mockReturnValueOnce(old.promise)
  await open(); await select(); await clickButton(wrapper, '预览凭证（1）')
  await clickButton(wrapper, '返回修改选择')
  await clickButton(wrapper, '预览凭证（1）')
  old.resolve({ data: { vouchers: [{ error: true, message: 'old failure' }] } }); await flushPromises()
  expect(wrapper.find('[data-dialog="应付凭证预览（1 张）"]').exists()).toBe(true)
  expect(wrapper.text()).not.toContain('old failure')
})

test('multiple sources including USD clearly require single-source generation and disable both actions', async () => {
  mocks.receipts.mockResolvedValue(page([source(30, 'USD'), source(31, 'USD')]))
  await open(); await select(0); await select(1)
  expect(wrapper.text()).toContain('美元来源请逐单生成凭证')
  expect(wrapper.text()).not.toContain('直接生成（合并 1 张）')
  expect(button('美元单据请逐单生成').attributes('disabled')).toBeDefined()
  expect(button('预览凭证（2）').attributes('disabled')).toBeDefined()
  await emitClick('美元单据请逐单生成')
  expect(mocks.generate).not.toHaveBeenCalled(); expect(mocks.confirm).not.toHaveBeenCalled()
  await select(1, false)
  expect(button('直接生成凭证').attributes('disabled')).toBeUndefined()
})

test('retains source-level invoice, recognition and cost links after closing and reopening entry', async () => {
  mocks.outbounds.mockResolvedValue(page([source(30), source(31), source(32)]))
  mocks.generate.mockResolvedValue({ data: {
    successCount: 1, skippedCount: 1, failedCount: 1, mergedEntry: { entryId: 900, entryNumber: 'GL-900' },
    results: [
      { id: 30, success: true, skipped: false, invoiceId: 100, invoiceNumber: 'AR-100' },
      { id: 31, success: true, skipped: true, invoiceId: 101, invoiceNumber: 'AR-101', entryId: 901, entryNumber: 'GL-901' },
      { id: 32, success: false, message: '该单据已失效' },
    ],
    costEntries: [{ sourceId: 30, entryId: 910, entryNumber: 'COST-910', existing: false }, { sourceId: 31, entryId: 911, entryNumber: 'COST-911', existing: true }],
  } })
  await open('sales_outbound'); await select(0); await select(1); await select(2)
  await clickButton(wrapper, '直接生成（合并 1 张）')
  await wrapper.setProps({ modelValue: false }); await flushPromises()
  const result = wrapper.get('[data-dialog="业务凭证生成结果"]')
  expect(result.text()).toContain('SOURCE-32'); expect(result.text()).toContain('该单据已失效')
  expect(result.findAll('a').map(link => link.attributes('href'))).toEqual([
    '/finance/ar/invoices?invoiceId=100', '/finance/ar/invoices?invoiceId=101',
    '/finance/gl/entries?entryId=900', '/finance/gl/entries?entryId=901',
    '/finance/gl/entries?entryId=910', '/finance/gl/entries?entryId=911',
  ])
  expect(result.text()).toContain('复用')
  await clickButton(result, '关闭结果')
  await wrapper.setProps({ modelValue: true }); await flushPromises()
  await clickButton(wrapper, '查看上次生成结果')
  expect(wrapper.get('[data-dialog="业务凭证生成结果"]').text()).toContain('AR-101')
})
