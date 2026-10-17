import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import PurchaseReceipts from '@/views/purchase/PurchaseReceipts.vue'
import SalesOutbound from '@/views/sales/SalesOutbound.vue'

const mocks = vi.hoisted(() => ({
  purchase: Object.fromEntries(['getReceipts', 'getReceipt', 'getOrders', 'updateReceiptStatus'].map(name => [name, vi.fn()])),
  sales: Object.fromEntries(['getOutbounds', 'getOutbound', 'getOutboundStats', 'getOrders'].map(name => [name, vi.fn()])),
  auth: null,
  error: vi.fn(),
  confirm: vi.fn(),
}))
vi.mock('@/api', () => ({
  purchaseApi: mocks.purchase, salesApi: mocks.sales, inventoryApi: {},
  baseDataApi: { getSuppliers: vi.fn(async () => ({ data: [] })) },
  qualityApi: { getIncomingInspections: vi.fn(async () => ({ data: [] })) },
}))
vi.mock('@/stores/auth', async () => {
  const { reactive } = await import('vue')
  mocks.auth = reactive({ canViewInventoryApproval: true, canApproveInventoryApproval: true, hasPermission: () => true })
  return { useAuthStore: () => mocks.auth }
})
vi.mock('@/stores/dictionary', () => ({ useDictionaryStore: () => ({ getOptions: () => [], getLabel: () => '', getColor: () => '' }) }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }))
vi.mock('@/utils/optionLoaders', () => ({ loadLocationOptions: vi.fn(async () => []) }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { error: mocks.error, warning: vi.fn(), success: vi.fn() } }))
vi.mock('element-plus/es/components/message-box/index', () => ({ ElMessageBox: { confirm: mocks.confirm } }))
vi.mock('@/services/printService', () => ({ default: {} }))
vi.mock('@/components/inventory/InventoryApprovalPanel.vue', () => ({ default: {
  name: 'InventoryApprovalPanel', props: ['sourceId', 'active'], template: '<div />',
} }))
vi.mock('@/components/inventory/InventoryBatchApproval.vue', () => ({ default: {
  name: 'InventoryBatchApproval', props: ['selectedRows', 'sourceType', 'sourceNoKey', 'disabled'], emits: ['clear', 'changed'],
  template: '<button :disabled="disabled">批量财务审批</button>',
} }))

const Table = {
  name: 'ElTable', props: ['data', 'rowKey'], emits: ['selection-change', 'row-click'],
  methods: { clearSelection() { this.$emit('selection-change', []) } },
  template: '<div><slot /></div>',
}
const Column = { name: 'ElTableColumn', props: ['type', 'selectable'], template: '<i />' }
const pages = [
  {
    path: 'purchase/PurchaseReceipts', component: PurchaseReceipts, api: mocks.purchase,
    list: 'getReceipts', detail: 'getReceipt', sourceType: 'purchase_receipt', sourceNoKey: 'receiptNo',
    fetch: vm => vm.loadReceipts(), search: vm => { vm.searchForm.receiptNo = 'RC-2' },
    page: vm => { vm.pagination.current = 2 }, size: vm => { vm.pagination.size = 20 },
    current: vm => vm.viewDialog.receipt, close: vm => { vm.viewDialog.show = false },
    view: (vm, row) => vm.viewReceipt(row),
  },
  {
    path: 'sales/SalesOutbound', component: SalesOutbound, api: mocks.sales,
    list: 'getOutbounds', detail: 'getOutbound', sourceType: 'sales_outbound', sourceNoKey: 'outboundNo',
    fetch: vm => vm.fetchOutbounds(), search: vm => { vm.searchQuery = '物料 2' },
    page: vm => vm.handleOutboundPageChange(2), size: vm => vm.handleOutboundSizeChange(20),
    current: vm => vm.currentOutbound, close: vm => { vm.detailsVisible = false },
    view: (vm, row) => vm.showDetails(row),
  },
]
const row = (id = 1, extra = {}) => ({ id, receiptNo: `RC-${id}`, outboundNo: `OUT-${id}`, status: 'completed', financeStatus: 'pending', items: [], ...extra })
const listResponse = rows => ({ data: { items: rows, total: rows.length, statistics: { total: rows.length } } })
const deferred = () => {
  let resolve
  const promise = new Promise(yes => { resolve = yes })
  return { promise, resolve }
}
let wrapper
const mountPage = async page => {
  const source = readFileSync(resolve(process.cwd(), `src/views/${page.path}.vue`), 'utf8')
  const tags = [...source.matchAll(/<((?:el-|[A-Z])[\w-]+)/g)].map(match => match[1])
  wrapper = shallowMount(page.component, { global: {
    stubs: {
      ...Object.fromEntries(tags.map(tag => [tag, true])),
      'el-card': { template: '<div><slot /></div>' }, 'el-table': Table, 'el-table-column': Column,
      InventoryBatchApproval: false,
    },
    directives: { permission() {}, loading() {} },
  } })
  await flushPromises()
  return wrapper.vm
}
const mainTable = () => wrapper.findComponent({ ref: 'approvalTableRef' })
const batch = () => wrapper.findComponent({ name: 'InventoryBatchApproval' })
const select = async rows => { mainTable().vm.$emit('selection-change', rows); await flushPromises() }

beforeEach(() => {
  mocks.auth.canViewInventoryApproval = true
  mocks.auth.canApproveInventoryApproval = true
  mocks.auth.hasPermission = () => true
  mocks.confirm.mockReset().mockResolvedValue('confirm')
  for (const api of [mocks.purchase, mocks.sales]) Object.values(api).forEach(fn => fn.mockReset().mockResolvedValue({ data: {} }))
  for (const page of pages) {
    page.api[page.list].mockResolvedValue(listResponse([row(1), row(2)]))
    page.api[page.detail].mockImplementation(async id => ({ data: row(id) }))
    page.api.getOrders.mockResolvedValue(listResponse([]))
  }
  mocks.error.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { wrapper?.unmount(); wrapper = null })

describe('采购收货财务驳回重提', () => {
  test('经办人有修改权即可重提，成功后刷新审核状态', async () => {
    mocks.auth.canViewInventoryApproval = false
    mocks.auth.canApproveInventoryApproval = false
    const vm = await mountPage(pages[0])
    mocks.purchase.getReceipt.mockResolvedValueOnce({ data: row(1, { financeStatus: 'rejected' }) })
    await vm.viewReceipt(row())
    const refresh = vi.fn()
    vm.receiptApprovalRef = { refresh }
    await vm.resubmitReceiptApproval()
    expect(mocks.purchase.updateReceiptStatus).toHaveBeenCalledExactlyOnceWith(1, { status: 'completed' })
    expect(vm.viewDialog.receipt.financeStatus).toBe('pending')
    expect(refresh).toHaveBeenCalledOnce()
  })

  test.each(['permission', 'cancel', 'switch', 'duplicate'])('%s prevents an unintended resubmission', async (mode) => {
    const vm = await mountPage(pages[0])
    mocks.purchase.getReceipt.mockResolvedValueOnce({ data: row(1, { financeStatus: 'rejected' }) })
    await vm.viewReceipt(row())
    if (mode === 'permission') mocks.auth.hasPermission = () => false
    if (mode === 'cancel') mocks.confirm.mockRejectedValueOnce('cancel')
    const waiting = deferred()
    if (['switch', 'duplicate'].includes(mode)) mocks.confirm.mockReturnValueOnce(waiting.promise)
    const pending = vm.resubmitReceiptApproval()
    if (mode === 'switch') await vm.viewReceipt(row(2))
    if (mode === 'duplicate') await vm.resubmitReceiptApproval()
    waiting.resolve('confirm')
    await pending
    expect(mocks.purchase.updateReceiptStatus).toHaveBeenCalledTimes(mode === 'duplicate' ? 1 : 0)
    expect(mocks.error).not.toHaveBeenCalled()
  })
})

describe.each(pages)('$path 批量财务审批接入', page => {
  test('把有效勾选与正确来源传入批量审批，排除草稿和已审核单', async () => {
    const vm = await mountPage(page)
    const selected = [row(1), row(2, { financeStatus: undefined })]
    await select([...selected, row(3, { status: 'draft' }), row(4, { financeStatus: 'approved' }), row(5, { financeStatus: 'rejected' })])
    expect(batch().props()).toMatchObject({ selectedRows: selected, sourceType: page.sourceType, sourceNoKey: page.sourceNoKey, disabled: false })
    expect(mainTable().props('rowKey')).toBe('id')
    expect(vm.selectedApprovalRows.map(item => item.id)).toEqual([1, 2])
  })

  test.each(['canViewInventoryApproval', 'canApproveInventoryApproval'])('缺少 %s 时不显示选择列', async permission => {
    mocks.auth[permission] = false
    await mountPage(page)
    expect(wrapper.findAllComponents(Column).filter(column => column.props('type') === 'selection')).toHaveLength(0)
    await select([row()])
    expect(batch().props('selectedRows')).toEqual([])
  })

  test('权限收回立即清空已选单据', async () => {
    await mountPage(page)
    await select([row()])
    mocks.auth.canApproveInventoryApproval = false
    await flushPromises()
    expect(batch().props('selectedRows')).toEqual([])
  })

  test('点击多选列空白处和复选框不会打开单据详情', async () => {
    await mountPage(page)
    page.api[page.detail].mockClear()
    const checkbox = document.createElement('span')
    checkbox.className = 'el-checkbox'
    mainTable().vm.$emit('row-click', row(), { type: 'selection' }, { target: document.createElement('td') })
    mainTable().vm.$emit('row-click', row(), {}, { target: checkbox })
    await flushPromises()
    expect(page.api[page.detail]).not.toHaveBeenCalled()
    mainTable().vm.$emit('row-click', row(), {}, { target: document.createElement('td') })
    await flushPromises()
    expect(page.api[page.detail]).toHaveBeenCalledWith(1)
  })

  test.each(['search', 'page', 'size'])('%s 后清空上一批选择', async action => {
    const vm = await mountPage(page)
    await select([row()])
    await page[action](vm)
    await flushPromises()
    expect(batch().props('selectedRows')).toEqual([])
  })

  test('重新查询时清空选择并禁用批量按钮和复选框', async () => {
    const vm = await mountPage(page)
    await select([row()])
    const pending = deferred()
    page.api[page.list].mockReturnValueOnce(pending.promise)
    const fetching = page.fetch(vm)
    await flushPromises()
    expect(batch().props('selectedRows')).toEqual([])
    expect(batch().props('disabled')).toBe(true)
    const column = wrapper.findAllComponents(Column).find(item => item.props('type') === 'selection')
    expect(column.props('selectable')(row())).toBe(false)
    pending.resolve(listResponse([row(2)]))
    await fetching
    await flushPromises()
    expect(batch().props('disabled')).toBe(false)
  })

  test('清空事件同步清除表格和提交给审批组件的选择', async () => {
    await mountPage(page)
    await select([row()])
    const clear = vi.spyOn(mainTable().vm, 'clearSelection')
    batch().vm.$emit('clear')
    await flushPromises()
    expect(clear).toHaveBeenCalled()
    expect(batch().props('selectedRows')).toEqual([])
  })

  test('审批完成事件刷新列表、统计和正在查看的单据', async () => {
    const vm = await mountPage(page)
    await page.view(vm, row())
    await select([row()])
    const approved = row(1, { financeStatus: 'approved' })
    page.api[page.list].mockClear().mockResolvedValue(listResponse([approved]))
    page.api[page.detail].mockClear().mockResolvedValue({ data: approved })
    mocks.sales.getOutboundStats.mockClear()
    batch().vm.$emit('changed')
    await flushPromises()
    expect(page.api[page.list]).toHaveBeenCalledTimes(1)
    expect(page.api[page.detail]).toHaveBeenCalledWith(1)
    expect(page.current(vm).financeStatus).toBe('approved')
    expect(batch().props('selectedRows')).toEqual([])
    if (page.sourceType === 'sales_outbound') expect(mocks.sales.getOutboundStats).toHaveBeenCalledTimes(1)
    else expect(vm.receiptStats.total).toBe(1)
  })

  test('刷新列表期间打开其他单据，不回到原审批单据', async () => {
    const vm = await mountPage(page)
    await page.view(vm, row())
    const pending = deferred()
    page.api[page.list].mockReturnValueOnce(pending.promise)
    batch().vm.$emit('changed')
    page.close(vm)
    await page.view(vm, row(2))
    page.api[page.detail].mockClear()
    pending.resolve(listResponse([row()]))
    await flushPromises()
    expect(page.api[page.detail]).not.toHaveBeenCalled()
    expect(page.current(vm).id).toBe(2)
  })

  test('离开页面时清空选择', async () => {
    const vm = await mountPage(page)
    await select([row()])
    wrapper.unmount()
    wrapper = null
    expect(vm.selectedApprovalRows).toEqual([])
  })
})
