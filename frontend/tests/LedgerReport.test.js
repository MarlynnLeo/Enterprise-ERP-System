import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LedgerReport from '@/views/finance/reports/LedgerReport.vue'
import { buildLedgerPrintHtml, formatLedgerCell, ledgerHeaderRows, populateLedgerWorksheet } from '@/views/finance/reports/ledgerPresentation'
import ExcelJS from 'exceljs'

const mocks = vi.hoisted(() => ({ getLedger: vi.fn(), getLedgerOptions: vi.fn(), print: vi.fn(), warning: vi.fn(), error: vi.fn() }))
vi.mock('@/api/finance', () => ({ financeApi: { reports: { getLedger: mocks.getLedger, getLedgerOptions: mocks.getLedgerOptions } } }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ hasPermission: () => true }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/services/printService', () => ({ default: { printDocument: mocks.print } }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { warning: mocks.warning, error: mocks.error, success: vi.fn() } }))

const columns = [
  { key: 'description', label: '摘要', width: 200 },
  { label: '借方', children: [{ key: 'debitQuantity', label: '数量', decimals: 4 }, { key: 'debit', label: '金额', decimals: 2 }] },
  { label: '余额', children: [{ key: 'direction', label: '方向' }, { key: 'balance', label: '金额', decimals: 2 }] }
]
const result = (overrides = {}) => ({
  title: '数量金额明细账', columns,
  rows: [{ description: '购入商品', debit: '1234.56', debitQuantity: null, direction: '借', balance: '1234.56', rowType: 'entry' }],
  filters: { startMonth: '2026-01', endMonth: '2026-09' }, warnings: [], pagination: { total: 1, page: 1, pageSize: 50 }, ...overrides
})
const passthrough = defineComponent({ setup(_, { slots }) { return () => h('div', slots.default?.()) } })
const ElButton = defineComponent({ props: ['disabled'], emits: ['click'], setup(props, { slots, emit }) { return () => h('button', { disabled: props.disabled, onClick: () => emit('click') }, slots.default?.()) } })
const ElDatePicker = defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], setup(props, { emit }) { return () => h('input', { value: props.modelValue, onInput: event => emit('update:modelValue', event.target.value) }) } })
function mountReport(type = 'cash') {
  return mount(LedgerReport, { props: { type }, global: {
    directives: { loading: () => {} },
    stubs: {
      PageHeader: { props: ['title'], template: '<header>{{ title }}<slot name="actions" /></header>' },
      FinanceQueryCard: { emits: ['search', 'reset'], template: '<form @submit.prevent="$emit(\'search\')"><slot name="basic" /><button type="submit">生成报表</button><button type="button" @click="$emit(\'reset\')">重置</button></form>' },
      ElCard: passthrough, ElFormItem: passthrough, ElButton, ElDatePicker,
      ElAlert: { props: ['title'], template: '<aside>{{ title }}<slot /></aside>' },
      ElSelect: true, ElOption: true, ElEmpty: true, ElPagination: true,
      ElTable: { props: ['data'], template: '<section class="table-data">{{ JSON.stringify(data) }}</section>' }, ElTableColumn: true
    }
  } })
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.getLedgerOptions.mockResolvedValue({ data: { accountOptions: [], supplierOptions: [], materialOptions: [] } })
  mocks.getLedger.mockResolvedValue({ data: result() })
  mocks.print.mockResolvedValue(undefined)
})

describe('ledger report query and output', () => {
  it('lets users narrow inventory before the first query and clears it on reset', async () => {
    const wrapper = mountReport('quantity')
    await flushPromises()
    expect(mocks.getLedger).not.toHaveBeenCalled()
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(mocks.getLedger).toHaveBeenCalledTimes(1)
    await wrapper.findAll('button').find(button => button.text() === '重置').trigger('click')
    await flushPromises()
    expect(mocks.getLedger).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.table-data').exists()).toBe(false)
    wrapper.unmount()
  })
  it('keeps the applied period when printing all results after unsaved filter edits', async () => {
    const wrapper = mountReport()
    await flushPromises()
    const applied = mocks.getLedger.mock.calls[0][1]
    await wrapper.findAll('input')[0].setValue('2020-01')
    mocks.getLedger.mockResolvedValueOnce({ data: result({ rows: [result().rows[0], { description: '第二页数据', rowType: 'entry' }], pagination: { total: 2 } }) })
    await wrapper.findAll('button').find(button => button.text() === '打印报表').trigger('click')
    await flushPromises()
    expect(mocks.getLedger).toHaveBeenLastCalledWith('cash', expect.objectContaining({ startMonth: applied.startMonth, export: true }))
    expect(mocks.print.mock.calls[0][0]).toContain('第二页数据')
    wrapper.unmount()
  })
  it('prevents invalid date queries and leaves a useful validation message', async () => {
    const wrapper = mountReport()
    await flushPromises()
    await wrapper.findAll('input')[0].setValue('2099-01')
    await wrapper.find('form').trigger('submit')
    expect(mocks.getLedger).toHaveBeenCalledTimes(1)
    expect(mocks.warning).toHaveBeenCalledWith(expect.stringContaining('起始期间不能晚于结束期间'))
    wrapper.unmount()
  })
  it('discards a late response from the previous report type', async () => {
    let resolveOld
    mocks.getLedger.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
    const wrapper = mountReport('general')
    await wrapper.setProps({ type: 'cash' })
    await flushPromises()
    resolveOld({ data: result({ rows: [{ description: '过期报表内容' }] }) })
    await flushPromises()
    expect(wrapper.find('.table-data').text()).not.toContain('过期报表内容')
    wrapper.unmount()
  })
  it('removes old results on failure and prevents printing an incomplete export', async () => {
    const wrapper = mountReport()
    await flushPromises()
    mocks.getLedger.mockResolvedValueOnce({ data: result({ pagination: { total: 100 } }) })
    await wrapper.findAll('button').find(button => button.text() === '打印报表').trigger('click')
    await flushPromises()
    expect(mocks.print).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalled()
    mocks.getLedger.mockRejectedValueOnce(new Error('会计期间不可用'))
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('.table-data').exists()).toBe(false)
    expect(wrapper.findAll('button').find(button => button.text() === '打印报表').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
})

describe('ledger print and Excel financial values', () => {
  it('preserves unknown quantities and signs, and uses grouped printable headers', () => {
    expect(formatLedgerCell({ amount: null }, { key: 'amount', decimals: 2 })).toBe('—')
    expect(formatLedgerCell({ amount: -1.23 }, { key: 'amount', decimals: 2 })).toBe('-1.23')
    expect(ledgerHeaderRows(columns)[0][0].rowspan).toBe(2)
    const html = buildLedgerPrintHtml(result({ rows: [{ description: '<script>untrusted()</script>' }] }))
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('display:table-header-group')
  })
  it('exports numeric cells as numbers, unknown values as blanks and unsafe text as plain text', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('账簿')
    populateLedgerWorksheet(sheet, result({ rows: [{ ...result().rows[0], description: '=1+1', debit: '-1234.56' }] }))
    const roundTrip = new ExcelJS.Workbook()
    await roundTrip.xlsx.load(await workbook.xlsx.writeBuffer())
    const exported = roundTrip.worksheets[0]
    expect(exported.getCell('A5').value).toBe('=1+1')
    expect(exported.getCell('B5').value).toBeNull()
    expect(exported.getCell('C5').value).toBe(-1234.56)
    expect(exported.getCell('C5').numFmt).toBe('#,##0.00')
    expect(exported.getCell('B3').isMerged).toBe(true)
  })
})
