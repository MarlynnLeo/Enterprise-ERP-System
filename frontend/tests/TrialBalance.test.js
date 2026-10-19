import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, inject, provide, toRef } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ExcelJS from 'exceljs'
import TrialBalance from '@/views/finance/gl/TrialBalance.vue'
import { formatCurrency } from '@/utils/format'

const mocks = vi.hoisted(() => ({
  getPeriods: vi.fn(), getTrialBalance: vi.fn(), loadExcelJS: vi.fn(),
  success: vi.fn(), warning: vi.fn(), error: vi.fn(),
  createObjectURL: vi.fn(), revokeObjectURL: vi.fn(),
}))
vi.mock('@/api', () => ({ financeApi: {
  periods: { getList: mocks.getPeriods }, reports: { getTrialBalance: mocks.getTrialBalance },
} }))
vi.mock('@/utils/lazyVendors', () => ({ loadExcelJS: mocks.loadExcelJS }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: {
  success: mocks.success, warning: mocks.warning, error: mocks.error,
} }))

const Table = defineComponent({
  props: ['data', 'summaryMethod'],
  setup(props, { slots }) {
    provide('trialBalanceRows', toRef(props, 'data'))
    return () => h('section', { 'data-trial-table': '' }, slots.default?.())
  },
})
const Column = defineComponent({
  props: ['prop', 'label'],
  setup(props, { slots }) {
    const rows = inject('trialBalanceRows')
    return () => h('div', { 'data-column': props.prop || props.label }, [
      h('strong', props.label),
      ...(props.prop
        ? rows.value.map((row, index) => h('span', { 'data-row': index },
          slots.default ? slots.default({ row }) : String(row[props.prop] ?? '')))
        : slots.default?.() || []),
    ])
  },
})
const Slot = { template: '<div><slot /></div>' }
const stubs = {
  PageHeader: { template: '<header><slot name="actions" /></header>' },
  FinanceQueryCard: {
    emits: ['search', 'reset'],
    template: '<form @submit.prevent="$emit(\'search\')"><slot name="basic" /><button type="submit">查询</button><button type="button" @click="$emit(\'reset\')">重置</button></form>',
  },
  ElSelect: {
    props: ['modelValue'], emits: ['update:modelValue'],
    template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', Number($event.target.value))"><slot /></select>',
  },
  ElOption: { props: ['value', 'label'], template: '<option :value="value">{{ label }}</option>' },
  ElButton: { props: ['disabled'], emits: ['click'], template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>' },
  ElAlert: { props: ['title', 'type'], template: '<aside :data-type="type">{{ title }}</aside>' },
  ElCard: Slot, ElFormItem: Slot, ElTag: Slot, ElIcon: true, EmptyState: true,
  ElTable: Table, ElTableColumn: Column,
}
const baseRow = (overrides = {}) => ({
  id: 1, accountCode: '1001', accountName: '库存现金', accountType: '资产', isDebit: true,
  openingBalance: '100.00', totalDebit: '30.00', totalCredit: '0.00',
  debitBalance: '130.00', creditBalance: '0.00', ...overrides,
})
const ordinaryRows = () => [
  baseRow(),
  baseRow({ id: 2, accountCode: '3001', accountName: '实收资本', accountType: '所有者权益',
    isDebit: false, totalDebit: '0.00', totalCredit: '30.00', debitBalance: '0.00', creditBalance: '130.00' }),
]
const activationRows = () => [
  baseRow({ openingBalance: '0.00', openingAdjustmentDebit: '1000.00', openingAdjustmentCredit: '0.00', debitBalance: '1030.00' }),
  baseRow({ id: 2, accountCode: '3001', accountName: '实收资本', accountType: '所有者权益', isDebit: false,
    openingBalance: '0.00', openingAdjustmentDebit: '0.00', openingAdjustmentCredit: '1000.00',
    totalDebit: '0.00', totalCredit: '30.00', debitBalance: '0.00', creditBalance: '1030.00' }),
]
const apiResult = (rows, isBalanced = true) => ({ data: {
  trialBalance: rows, isBalanced,
  summary: { totalDebit: 30, totalCredit: 30 },
} })
let wrapper
let workbooks
let downloads
let excelVendor
async function open() {
  wrapper = mount(TrialBalance, { global: { stubs, directives: { loading() {}, permission() {} } } })
  await flushPromises()
  return wrapper
}
const tableRows = () => wrapper.getComponent(Table).props('data')
const summaries = () => {
  const table = wrapper.getComponent(Table)
  const columns = wrapper.findAllComponents(Column).filter(column => column.props('prop'))
    .map(column => ({ property: column.props('prop') }))
  return Object.fromEntries(columns.map((column, index) => [column.property,
    table.props('summaryMethod')({ columns, data: table.props('data') })[index]]))
}
async function exportSheet() {
  const previousErrors = mocks.error.mock.calls.length
  await wrapper.findAll('button').find(button => button.text().trim() === '导出').trigger('click')
  await flushPromises()
  expect(mocks.success).toHaveBeenCalledWith('导出成功')
  expect(mocks.error).toHaveBeenCalledTimes(previousErrors)
  return workbooks[0].worksheets[0]
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-17T04:00:00Z'))
  workbooks = []
  downloads = []
  mocks.getPeriods.mockResolvedValue({ data: { periods: [
    { id: 10, periodName: '2026年10月', startDate: '2026-10-01', endDate: '2026-10-31' },
    { id: 11, periodName: '2026年11月', startDate: '2026-11-01', endDate: '2026-11-30' },
  ] } })
  mocks.getTrialBalance.mockResolvedValue(apiResult(ordinaryRows()))
  excelVendor = { Workbook: class extends ExcelJS.Workbook {
    constructor() {
      super()
      workbooks.push(this)
      vi.spyOn(this.xlsx, 'writeBuffer').mockResolvedValue(new Uint8Array([1, 2, 3]))
    }
  } }
  mocks.loadExcelJS.mockResolvedValue(excelVendor)
  mocks.createObjectURL.mockReturnValue('blob:trial-balance-test')
  vi.stubGlobal('URL', Object.assign(class extends URL {}, {
    createObjectURL: mocks.createObjectURL, revokeObjectURL: mocks.revokeObjectURL,
  }))
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { downloads.push(this.download) })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('trial balance response and presentation', () => {
  it('reads current camelCase data, chooses the period, and normalizes both balance directions', async () => {
    mocks.getTrialBalance.mockResolvedValue(apiResult([...ordinaryRows(), baseRow({ id: 3,
      accountCode: 'EMPTY', openingBalance: 0, totalDebit: 0, debitBalance: 0 })]))
    await open()
    expect(mocks.getTrialBalance).toHaveBeenCalledWith({ period_id: 10 })
    expect(wrapper.get('option').text()).toBe('2026年10月')
    expect(tableRows()).toHaveLength(2)
    expect(tableRows()[0]).toMatchObject({ openingDebitAmount: 100, openingCreditAmount: 0, totalDebit: 30, debitBalance: 130 })
    expect(tableRows()[1]).toMatchObject({ openingDebitAmount: 0, openingCreditAmount: 100, totalCredit: 30, creditBalance: 130 })
    expect(wrapper.get('aside[data-type="success"]').text()).toContain('借贷平衡')
    expect(wrapper.find('[data-column="本期启用期初余额"]').exists()).toBe(false)
    expect(summaries()).toMatchObject({ accountCode: '合计', openingDebitAmount: '¥100.00', openingCreditAmount: '¥100.00',
      totalDebit: '¥30.00', totalCredit: '¥30.00', debitBalance: '¥130.00', creditBalance: '¥130.00' })
  })

  it('displays activation separately with a notice and totals without adding it to voucher turnover', async () => {
    mocks.getTrialBalance.mockResolvedValue(apiResult(activationRows()))
    await open()
    expect(wrapper.get('aside[data-type="info"]').text()).toContain('不计入凭证发生额')
    expect(wrapper.get('[data-column="openingAdjustmentDebit"]').text()).toContain(formatCurrency(1000, '¥'))
    expect(wrapper.get('[data-column="openingAdjustmentCredit"]').text()).toContain(formatCurrency(1000, '¥'))
    expect(tableRows()[0]).toMatchObject({ openingDebitAmount: 0, openingAdjustmentDebit: 1000, totalDebit: 30, debitBalance: 1030 })
    expect(summaries()).toMatchObject({ openingDebitAmount: '¥0.00', openingCreditAmount: '¥0.00',
      openingAdjustmentDebit: '¥1,000.00', openingAdjustmentCredit: '¥1,000.00',
      totalDebit: '¥30.00', totalCredit: '¥30.00', debitBalance: '¥1,030.00', creditBalance: '¥1,030.00' })
  })

  it('keeps accounts with activation only even if the ending amount and voucher net offset it', async () => {
    mocks.getTrialBalance.mockResolvedValue(apiResult([baseRow({ openingBalance: 0,
      openingAdjustmentDebit: '1000.00', totalDebit: 0, totalCredit: 1000, debitBalance: 0 })], false))
    await open()
    expect(tableRows()).toHaveLength(1)
    expect(wrapper.get('aside[data-type="error"]').text()).toContain('试算不平衡')
    expect(wrapper.find('[data-column="本期启用期初余额"]').exists()).toBe(true)
  })

  it('retains reverse-direction opening amounts and clears activation presentation on reset', async () => {
    mocks.getTrialBalance.mockResolvedValue(apiResult([baseRow({ openingBalance: '-12.50', openingAdjustmentDebit: 1000 })]))
    await open()
    expect(tableRows()[0]).toMatchObject({ openingDebitAmount: 0, openingCreditAmount: 12.5 })
    await wrapper.findAll('button').find(button => button.text() === '重置').trigger('click')
    expect(tableRows()).toHaveLength(0)
    expect(wrapper.find('aside').exists()).toBe(false)
    expect(wrapper.find('[data-column="本期启用期初余额"]').exists()).toBe(false)
    expect(wrapper.findAll('button').find(button => button.text().trim() === '导出').element.disabled).toBe(true)
  })
})

describe('trial balance Excel export', () => {
  it('exports the current ordinary response without adding empty activation columns', async () => {
    await open()
    const sheet = await exportSheet()
    expect(sheet.getCell('A1').value).toBe('试算平衡（2026年10月）')
    expect(sheet.model.merges).toEqual(['A1:J1'])
    expect(sheet.getRow(2).values.slice(1)).toEqual([
      '科目编码', '科目名称', '科目类型', '余额方向', '期初借方', '期初贷方', '本期借方', '本期贷方', '期末借方', '期末贷方',
    ])
    expect(sheet.getRow(3).values.slice(1)).toEqual(['1001', '库存现金', '资产', '借', 100, '', 30, '', 130, ''])
    expect(sheet.getRow(5).values.slice(1)).toEqual(['合计', '', '', '', 100, 100, 30, 30, 130, 130])
    expect(downloads[0]).toMatch(/^试算平衡_2026年10月_.*\.xlsx$/)
    expect(mocks.createObjectURL).toHaveBeenCalledTimes(1)
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:trial-balance-test')
  })

  it('exports twelve aligned columns with separate activation and unchanged turnover totals', async () => {
    mocks.getTrialBalance.mockResolvedValue(apiResult(activationRows()))
    await open()
    const sheet = await exportSheet()
    expect(sheet.model.merges).toEqual(['A1:L1'])
    expect(sheet.getRow(2).values.slice(1)).toEqual([
      '科目编码', '科目名称', '科目类型', '余额方向', '期初借方', '期初贷方',
      '本期启用借方', '本期启用贷方', '本期借方', '本期贷方', '期末借方', '期末贷方',
    ])
    expect(sheet.getRow(3).values.slice(1)).toEqual(['1001', '库存现金', '资产', '借', '', '', 1000, '', 30, '', 1030, ''])
    expect(sheet.getRow(4).values.slice(1)).toEqual(['3001', '实收资本', '所有者权益', '贷', '', '', '', 1000, '', 30, '', 1030])
    expect(sheet.getRow(5).values.slice(1)).toEqual(['合计', '', '', '', 0, 0, 1000, 1000, 30, 30, 1030, 1030])
  })

  it('uses the loaded data period when the selection changes without a query', async () => {
    await open()
    await wrapper.get('select').setValue('11')
    expect(mocks.getTrialBalance).toHaveBeenCalledTimes(1)
    const sheet = await exportSheet()
    expect(sheet.getCell('A1').value).toBe('试算平衡（2026年10月）')
    expect(sheet.getRow(3).values.slice(1)).toEqual(['1001', '库存现金', '资产', '借', 100, '', 30, '', 130, ''])
    expect(downloads[0]).toContain('试算平衡_2026年10月_')
  })

  it('keeps the last successfully loaded period and values after a new query fails', async () => {
    await open()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await wrapper.get('select').setValue('11')
    mocks.getTrialBalance.mockRejectedValueOnce(new Error('十一月不可用'))
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(mocks.getTrialBalance).toHaveBeenLastCalledWith({ period_id: 11 })
    expect(mocks.error).toHaveBeenCalledWith('十一月不可用')
    const sheet = await exportSheet()
    expect(sheet.getCell('A1').value).toBe('试算平衡（2026年10月）')
    expect(sheet.getRow(5).values.slice(1)).toEqual(['合计', '', '', '', 100, 100, 30, 30, 130, 130])
    expect(downloads[0]).toContain('试算平衡_2026年10月_')
  })

  it.each(['new query', 'reset'])('exports the clicked snapshot when %s changes the page during ExcelJS loading', async action => {
    mocks.getTrialBalance.mockResolvedValueOnce(apiResult(activationRows()))
    await open()
    let resolveExcel
    mocks.loadExcelJS.mockImplementationOnce(() => new Promise(resolve => { resolveExcel = resolve }))
    await wrapper.findAll('button').find(button => button.text().trim() === '导出').trigger('click')
    expect(workbooks).toHaveLength(0)
    await wrapper.get('select').setValue('11')
    if (action === 'new query') {
      mocks.getTrialBalance.mockResolvedValueOnce(apiResult([baseRow({ accountCode: 'NOVEMBER', openingBalance: 7,
        totalDebit: 0, totalCredit: 0, debitBalance: 7 })]))
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(tableRows()[0].accountCode).toBe('NOVEMBER')
    } else {
      await wrapper.findAll('button').find(button => button.text() === '重置').trigger('click')
      expect(tableRows()).toHaveLength(0)
    }
    expect(wrapper.find('[data-column="本期启用期初余额"]').exists()).toBe(false)
    resolveExcel(excelVendor)
    await flushPromises()
    expect(mocks.success).toHaveBeenCalledWith('导出成功')
    expect(mocks.error).not.toHaveBeenCalled()
    const sheet = workbooks[0].worksheets[0]
    expect(sheet.getCell('A1').value).toBe('试算平衡（2026年10月）')
    expect(sheet.model.merges).toEqual(['A1:L1'])
    expect(sheet.getRow(3).values.slice(1)).toEqual(['1001', '库存现金', '资产', '借', '', '', 1000, '', 30, '', 1030, ''])
    expect(sheet.getRow(5).values.slice(1)).toEqual(['合计', '', '', '', 0, 0, 1000, 1000, 30, 30, 1030, 1030])
    expect(downloads[0]).toContain('试算平衡_2026年10月_')
  })

  it('ignores an older response after a later period has loaded', async () => {
    await open()
    let resolveOctober
    mocks.getTrialBalance.mockImplementationOnce(() => new Promise(resolve => { resolveOctober = resolve }))
    await wrapper.get('form').trigger('submit')
    await wrapper.get('select').setValue('11')
    mocks.getTrialBalance.mockResolvedValueOnce(apiResult([baseRow({ accountCode: 'NOVEMBER', openingBalance: 7,
      totalDebit: 0, totalCredit: 0, debitBalance: 7 })]))
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    resolveOctober(apiResult(activationRows()))
    await flushPromises()
    expect(tableRows()[0].accountCode).toBe('NOVEMBER')
    expect(wrapper.find('[data-column="本期启用期初余额"]').exists()).toBe(false)
    const sheet = await exportSheet()
    expect(sheet.getCell('A1').value).toBe('试算平衡（2026年11月）')
    expect(sheet.getCell('A3').value).toBe('NOVEMBER')
    expect(downloads[0]).toContain('试算平衡_2026年11月_')
  })

  it('does not restore old data or enable exporting when a query finishes after reset', async () => {
    await open()
    let resolvePending
    mocks.getTrialBalance.mockImplementationOnce(() => new Promise(resolve => { resolvePending = resolve }))
    await wrapper.get('form').trigger('submit')
    await wrapper.findAll('button').find(button => button.text() === '重置').trigger('click')
    resolvePending(apiResult(activationRows()))
    await flushPromises()
    expect(tableRows()).toHaveLength(0)
    expect(wrapper.find('aside').exists()).toBe(false)
    expect(wrapper.findAll('button').find(button => button.text().trim() === '导出').element.disabled).toBe(true)
  })
})
