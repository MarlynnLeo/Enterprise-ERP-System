import { mount } from '@vue/test-utils'
import { afterEach, expect, test } from 'vitest'
import EntryVoucherSheet from '@/views/finance/gl/entries/EntryVoucherSheet.vue'

const entry = () => ({
  id: 11, voucherWord: '付', voucherNumber: '000011', entryNumber: '付-000011',
  entryDate: '2026-09-04', attachmentCount: 3, description: '材料采购付款',
  documentNumber: 'PAY-090063', isPosted: true, createdBy: '制单甲', approverName: '审核乙',
  totalDebit: 99999, totalCredit: 99999
})
const items = () => [
  {
    id: 101, lineNumber: 1, description: '原材料入库', accountCode: '220202', accountName: '应付账款-人民币',
    debitAmount: '1250.50', creditAmount: 0, departmentName: '生产部', costCenterName: '生产成本中心',
    customerName: '客户甲', supplierName: '供应商甲', unitName: '箱', currencyCode: 'USD', exchangeRate: 7.123456789
  },
  {
    id: 102, lineNumber: 2, description: '银行支付货款', accountCode: '100203', accountName: '银行存款-工行',
    debitAmount: 0, creditAmount: 1250.5, departmentName: '财务部', costCenterName: '管理成本中心',
    customerName: '客户乙', supplierName: '供应商乙', unitName: '个', currencyCode: 'CNY', exchangeRate: 1,
    quantity: 0, unitPrice: 0, foreignAmount: 0
  },
  {
    id: 103, lineNumber: 3, description: '退回手续费', accountCode: '660205', accountName: '财务费用',
    debitAmount: -20.25, creditAmount: 0, currencyCode: 'XYZ', exchangeRate: 0, foreignAmount: -3.25
  }
]

let wrapper
const open = (props = {}) => {
  wrapper = mount(EntryVoucherSheet, { attachTo: document.body, props: { entry: entry(), items: items(), ...props } })
}
const rows = () => wrapper.findAll('.voucher-lines tbody tr[data-line-index]')
const selectedRow = () => wrapper.find('.voucher-lines tbody tr[aria-selected="true"]')
const auxiliary = label => {
  const term = wrapper.findAll('.voucher-auxiliary dt').find(candidate => candidate.text() === label)
  return term.element.nextElementSibling.textContent.trim()
}
const accountBar = () => wrapper.find('.voucher-account-bar').text()
const position = () => wrapper.find('.voucher-line-position b').text()
const key = async name => {
  await selectedRow().trigger('keydown', { key: name })
  expect(document.activeElement).toBe(selectedRow().element)
}
afterEach(() => { wrapper?.unmount(); wrapper = null })

test('renders the voucher identity and real line amounts with totals computed from the items', () => {
  open()
  expect(wrapper.find('.voucher-info').text()).toContain('付款凭证')
  expect(wrapper.find('.voucher-info').text()).toContain('000011')
  expect(wrapper.find('.voucher-info').text()).toContain('2026-09-04')
  expect(wrapper.find('.voucher-status').text()).toBe('已过账')
  expect(wrapper.find('.entry-description').text()).toContain('材料采购付款')
  expect(wrapper.find('.entry-description').text()).toContain('PAY-090063')
  expect(wrapper.findAll('.voucher-lines thead th').map(cell => cell.text())).toEqual(['行号', '摘要', '科目', '借方（CNY）', '贷方（CNY）'])
  expect(rows()[0].findAll('td').map(cell => cell.text())).toEqual(['1', '原材料入库', '220202 应付账款-人民币', '1,250.50', '0.00'])
  expect(rows()[2].findAll('.amount').map(cell => cell.text())).toEqual(['-20.25', '0.00'])
  expect(wrapper.find('[aria-label="借方合计"]').text()).toBe('1,230.25')
  expect(wrapper.find('[aria-label="贷方合计"]').text()).toBe('1,250.50')
  expect(wrapper.find('.voucher-signatures').text()).toContain('制单甲')
  expect(wrapper.find('.voucher-signatures').text()).toContain('审核乙')
})

test('the first line is selected initially and clicking another row changes its auxiliary details', async () => {
  open()
  expect(position()).toBe('1/3')
  expect(rows()[0].attributes('aria-selected')).toBe('true')
  expect(accountBar()).toContain('220202 应付账款-人民币')
  expect(accountBar()).toContain('生产部')
  expect(['客户', '供应商', '成本中心', '单位', '币种'].map(auxiliary)).toEqual(['客户甲', '供应商甲', '生产成本中心', '箱', '美元'])
  await rows()[1].trigger('click')
  expect(position()).toBe('2/3')
  expect(rows().map(row => row.attributes('aria-selected'))).toEqual(['false', 'true', 'false'])
  expect(accountBar()).toContain('100203 银行存款-工行')
  expect(accountBar()).toContain('财务部')
  expect(accountBar()).not.toContain('生产部')
  expect(['客户', '供应商', '成本中心', '单位', '币种'].map(auxiliary)).toEqual(['客户乙', '供应商乙', '管理成本中心', '个', '人民币'])
})

test('arrow, Home and End keys move the selected row and focus without going beyond the table', async () => {
  open()
  await key('ArrowUp')
  expect(position()).toBe('1/3')
  await key('ArrowDown')
  expect(position()).toBe('2/3')
  expect(auxiliary('客户')).toBe('客户乙')
  await key('End')
  expect(position()).toBe('3/3')
  expect(accountBar()).toContain('660205 财务费用')
  await key('ArrowDown')
  expect(position()).toBe('3/3')
  await key('ArrowUp')
  expect(position()).toBe('2/3')
  await key('Home')
  expect(position()).toBe('1/3')
  expect(auxiliary('客户')).toBe('客户甲')
  expect(rows().map(row => row.attributes('tabindex'))).toEqual(['0', '-1', '-1'])
})

test('currency details use eight decimal places and show only explicit foreign amounts', async () => {
  open()
  expect(auxiliary('汇率')).toBe('7.12345679')
  expect(auxiliary('外币金额')).toBe('')
  expect(auxiliary('数量')).toBe('')
  expect(auxiliary('单价（原币）')).toBe('')
  await rows()[1].trigger('click')
  expect(auxiliary('汇率')).toBe('1.00000000')
  expect(auxiliary('外币金额')).toBe('0.00')
  expect(auxiliary('数量')).toBe('0')
  expect(auxiliary('单价（原币）')).toBe('0.00')
  await rows()[2].trigger('click')
  expect(auxiliary('币种')).toBe('XYZ')
  expect(auxiliary('汇率')).toBe('')
  expect(auxiliary('外币金额')).toBe('-3.25')
  expect(['客户', '供应商', '成本中心', '单位'].map(auxiliary)).toEqual(['', '', '', ''])
})

test('missing currency metadata stays blank despite the voucher and line having amounts', () => {
  open({ items: [{ id: 201, accountCode: '1001', accountName: '库存现金', debitAmount: 1400, creditAmount: 0 }] })
  expect(['币种', '汇率', '外币金额', '单位', '单价（原币）', '数量'].map(auxiliary)).toEqual(['', '', '', '', '', ''])
  expect(wrapper.find('[aria-label="借方合计"]').text()).toBe('1,400.00')
})

test('attachment counts preserve an explicit zero and mark an unknown count as unspecified', async () => {
  open()
  expect(wrapper.find('.voucher-attachments b').text()).toBe('3')
  await wrapper.setProps({ entry: { ...entry(), attachmentCount: 0 } })
  expect(wrapper.find('.voucher-attachments b').text()).toBe('0')
  await wrapper.setProps({ entry: { ...entry(), attachmentCount: undefined } })
  expect(wrapper.find('.voucher-attachments b').text()).toBe('—')
})

test('switching vouchers or replacing the items resets selection to the first available line', async () => {
  open()
  await rows()[2].trigger('click')
  expect(position()).toBe('3/3')
  await wrapper.setProps({ entry: { ...entry(), id: 12, voucherNumber: '000012' } })
  expect(position()).toBe('1/3')
  expect(auxiliary('客户')).toBe('客户甲')
  await rows()[1].trigger('click')
  const replacement = [{ ...items()[2], id: 301, accountName: '新凭证科目', departmentName: '研发部' }, { ...items()[0], id: 302 }]
  await wrapper.setProps({ items: replacement })
  expect(position()).toBe('1/2')
  expect(rows()[0].attributes('aria-selected')).toBe('true')
  expect(accountBar()).toContain('新凭证科目')
  expect(accountBar()).toContain('研发部')
  expect(auxiliary('客户')).toBe('')
})

test('an empty items replacement clears the selected panel and shows zero totals', async () => {
  open()
  await rows()[1].trigger('click')
  await wrapper.setProps({ items: [] })
  expect(rows()).toHaveLength(0)
  expect(selectedRow().exists()).toBe(false)
  expect(position()).toBe('0/0')
  expect(wrapper.find('.voucher-empty').text()).toBe('暂无分录')
  expect(wrapper.find('[aria-label="借方合计"]').text()).toBe('0.00')
  expect(wrapper.find('[aria-label="贷方合计"]').text()).toBe('0.00')
  expect(accountBar()).not.toContain('银行存款-工行')
  expect(['客户', '供应商', '成本中心', '币种', '汇率', '外币金额'].map(auxiliary)).toEqual(['', '', '', '', '', ''])
})
