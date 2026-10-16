import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import SalesReturns from '@/views/sales/SalesReturns.vue'
import SalesOutbound from '@/views/sales/SalesOutbound.vue'
import SalesExchanges from '@/views/sales/SalesExchanges.vue'

const mocks = vi.hoisted(() => ({
  sales: Object.fromEntries([
    'getReturns', 'getReturnDetails', 'updateReturn', 'createReturn',
    'getOutbounds', 'getOutbound', 'getOutboundStats', 'getOrders', 'updateOutbound',
    'getExchanges', 'getExchange', 'updateExchangeStatus', 'updateExchange',
  ].map(name => [name, vi.fn()])),
  permission: vi.fn(), confirm: vi.fn(),
  message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))
vi.mock('@/api', () => ({ salesApi: mocks.sales, inventoryApi: {}, baseDataApi: {} }))
vi.mock('@/api/finance', () => ({ financeApi: { integration: {} } }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ hasPermission: mocks.permission }) }))
vi.mock('@/stores/dictionary', () => ({ useDictionaryStore: () => ({ getOptions: () => [], getLabel: () => '', getColor: () => '' }) }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: mocks.message }))
vi.mock('element-plus/es/components/message/style/css', () => ({}))
vi.mock('element-plus/es/components/message-box/index', () => ({ ElMessageBox: { confirm: mocks.confirm, prompt: mocks.confirm } }))
vi.mock('@/services/printService', () => ({ default: {} }))
vi.mock('@/components/inventory/InventoryApprovalPanel.vue', () => ({ default: {
  name: 'InventoryApprovalPanel', props: ['sourceId', 'active'], emits: ['changed'],
  template: '<div :data-approval-source="sourceId" :data-active="active" />',
} }))

const pages = [
  { file: 'SalesReturns', component: SalesReturns, list: 'getReturns', detail: 'getReturnDetails', records: 'returnRecords', current: 'currentReturn', visible: 'detailsVisible', loading: 'detailsLoading', view: 'handleView', update: 'updateReturn', canRetry: 'canResubmitReturn', label: '重新提交入库审核', permission: 'sales:returns:update', complete: vm => vm.handleComplete(vm.currentReturn) },
  { file: 'SalesOutbound', component: SalesOutbound, list: 'getOutbounds', detail: 'getOutbound', records: 'outbounds', current: 'currentOutbound', visible: 'detailsVisible', loading: 'detailsLoading', view: 'showDetails', update: 'updateOutbound', canRetry: 'canResubmitOutbound', label: '重新提交出库审核', permission: 'sales:outbound:update', complete: vm => vm.handleStatusChange(vm.currentOutbound, 'completed') },
  { file: 'SalesExchanges', component: SalesExchanges, list: 'getExchanges', detail: 'getExchange', records: 'exchangeRecords', current: 'currentExchange', visible: 'detailDialogVisible', loading: 'detailDialogLoading', view: 'handleView', update: 'updateExchangeStatus', canRetry: 'canResubmitExchange', label: '重新提交审批', permission: 'sales:exchanges:update', complete: vm => vm.handleComplete(vm.currentExchange) },
]
const record = (id = 1, extra = {}) => ({
  id, returnNo: `RET-${id}`, outboundNo: `OUT-${id}`, exchangeNo: `EX-${id}`,
  customerName: `客户 ${id}`, status: 'completed', financeStatus: 'rejected', canResubmitInventory: true, items: [], ...extra,
})
const listResponse = rows => ({ data: { items: rows, total: rows.length } })
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
let wrapper
const mountPage = async page => {
  const source = readFileSync(resolve(process.cwd(), `src/views/sales/${page.file}.vue`), 'utf8')
  const tags = [...source.matchAll(/<((?:el-|[A-Z])[\w-]+)/g)].map(match => match[1])
  wrapper = shallowMount(page.component, { global: {
    stubs: {
      ...Object.fromEntries(tags.map(tag => [tag, true])),
      AppDialog: { props: ['modelValue'], template: '<section v-if="modelValue"><slot/><slot name="footer"/></section>' },
      InventoryApprovalPanel: false,
      'el-button': { props: ['loading', 'disabled'], emits: ['click'], template: '<button :disabled="loading || disabled" @click="$emit(\'click\')"><slot/></button>' },
    },
    directives: { permission() {}, loading() {} },
  } })
  await flushPromises()
  return wrapper.vm
}

beforeEach(() => {
  Object.values(mocks.sales).forEach(mock => mock.mockReset().mockResolvedValue({ data: {} }))
  Object.values(mocks.message).forEach(mock => mock.mockReset())
  mocks.permission.mockReset().mockReturnValue(true)
  mocks.confirm.mockReset().mockResolvedValue('confirm')
  for (const page of pages) {
    mocks.sales[page.list].mockResolvedValue(listResponse([record()]))
    mocks.sales[page.detail].mockImplementation(async id => ({ data: record(id) }))
  }
  mocks.sales.getOrders.mockResolvedValue(listResponse([]))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { wrapper?.unmount(); wrapper = null })

describe.each(pages)('$file 库存审核回归', page => {
  test.each(['success', 'failure'])('关闭后重开新单，旧详情 %s 不覆盖或关闭新单', async outcome => {
    const vm = await mountPage(page)
    const slow = deferred()
    mocks.sales[page.detail].mockReturnValueOnce(slow.promise)
    const first = vm[page.view](record(1))
    vm[page.visible] = false
    await vm[page.view](record(2))
    expect(vm[page.current].id).toBe(2)
    if (outcome === 'success') slow.resolve({ data: record(1) })
    else slow.reject(new Error('stale failure'))
    await first
    await flushPromises()
    expect(vm[page.visible]).toBe(true)
    expect(vm[page.loading]).toBe(false)
    expect(vm[page.current].id).toBe(2)
    expect(mocks.message.error).not.toHaveBeenCalled()
    expect(wrapper.get('[data-approval-source]').attributes('data-approval-source')).toBe('2')
  })

  test('连续查看的最新请求负责 loading，旧请求提前结束不会显示旧审批来源', async () => {
    const vm = await mountPage(page)
    const first = deferred(), second = deferred()
    mocks.sales[page.detail].mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const old = vm[page.view](record(1))
    const latest = vm[page.view](record(2))
    first.resolve({ data: record(1) })
    await old; await flushPromises()
    expect(vm[page.loading]).toBe(true)
    expect(vm[page.current]).toBeNull()
    expect(wrapper.find('[data-approval-source]').exists()).toBe(false)
    second.resolve({ data: record(2) })
    await latest
    expect(vm[page.current].id).toBe(2)
  })

  test('新单读取失败会清空旧详情和审批来源', async () => {
    const vm = await mountPage(page)
    await vm[page.view](record(1))
    mocks.sales[page.detail].mockRejectedValueOnce(new Error('detail unavailable'))
    await vm[page.view](record(2)); await flushPromises()
    expect(vm[page.current]).toBeNull()
    expect(vm[page.visible]).toBe(false)
    expect(wrapper.find('[data-approval-source]').exists()).toBe(false)
  })

  test('真实 changed 事件同步当前详情、正确业务列表与出库统计', async () => {
    const vm = await mountPage(page)
    await vm[page.view](record(1)); await flushPromises()
    const changed = record(1, { status: 'reversed', financeStatus: 'reversed', canResubmitInventory: false })
    mocks.sales[page.list].mockResolvedValue(listResponse([changed]))
    mocks.sales[page.detail].mockResolvedValue({ data: changed })
    mocks.sales[page.list].mockClear()
    mocks.sales.getOrders.mockClear()
    mocks.sales.getOutboundStats.mockClear()
    wrapper.findComponent({ name: 'InventoryApprovalPanel' }).vm.$emit('changed')
    await flushPromises()
    expect(mocks.sales[page.list]).toHaveBeenCalledTimes(1)
    expect(mocks.sales.getOrders).not.toHaveBeenCalled()
    if (page.file === 'SalesOutbound') expect(mocks.sales.getOutboundStats).toHaveBeenCalledTimes(1)
    expect(vm[page.records][0].status).toBe('reversed')
    expect(vm[page.current].status).toBe('reversed')
    expect(vm[page.canRetry](vm[page.current])).toBe(false)
    expect(wrapper.text()).not.toContain(page.label)
  })

  test('旧审核刷新完成后不会切回已关闭或新打开的单据', async () => {
    const vm = await mountPage(page)
    await vm[page.view](record(1))
    const pending = deferred()
    mocks.sales[page.list].mockReturnValueOnce(pending.promise)
    const refreshing = vm.handleApprovalChanged()
    vm[page.visible] = false
    await vm[page.view](record(2))
    const count = mocks.sales[page.detail].mock.calls.length
    pending.resolve(listResponse([record(1)]))
    await refreshing
    expect(mocks.sales[page.detail]).toHaveBeenCalledTimes(count)
    expect(vm[page.current].id).toBe(2)
  })

  test('重提锁覆盖确认框和写请求，只提交 status 并刷新当前单', async () => {
    const vm = await mountPage(page)
    await vm[page.view](record(1)); await flushPromises()
    expect(wrapper.text()).toContain(page.label)
    expect(vm[page.canRetry](vm[page.records][0])).toBe(true)
    const confirmation = deferred(), write = deferred()
    mocks.confirm.mockReturnValueOnce(confirmation.promise)
    mocks.sales[page.update].mockReturnValueOnce(write.promise)
    const first = page.complete(vm)
    await page.complete(vm)
    expect(mocks.confirm).toHaveBeenCalledTimes(1)
    confirmation.resolve('confirm'); await flushPromises()
    await page.complete(vm)
    expect(mocks.sales[page.update]).toHaveBeenCalledTimes(1)
    expect(mocks.sales[page.update]).toHaveBeenCalledWith(1, page.file === 'SalesExchanges' ? 'completed' : { status: 'completed' })
    const accepted = record(1, { financeStatus: 'pending', canResubmitInventory: false })
    mocks.sales[page.list].mockResolvedValue(listResponse([accepted]))
    mocks.sales[page.detail].mockResolvedValue({ data: accepted })
    write.resolve({ data: accepted }); await first; await flushPromises()
    expect(vm.statusUpdating).toBe(false)
    expect(vm[page.visible]).toBe(true)
    expect(vm[page.current].financeStatus).toBe('pending')
    expect(wrapper.text()).not.toContain(page.label)
    await page.complete(vm)
    expect(mocks.sales[page.update]).toHaveBeenCalledTimes(1)
  })

  test('取消和业务失败释放重提锁，显示后端错误后可以重试', async () => {
    const vm = await mountPage(page)
    await vm[page.view](record(1))
    mocks.confirm.mockRejectedValueOnce('cancel')
    await page.complete(vm)
    expect(vm.statusUpdating).toBe(false)
    expect(mocks.sales[page.update]).not.toHaveBeenCalled()
    mocks.sales[page.update].mockRejectedValueOnce({ response: { data: { message: '会计期间已关闭' } } })
    await page.complete(vm)
    expect(mocks.message.error).toHaveBeenCalledWith('会计期间已关闭')
    expect(vm.statusUpdating).toBe(false)
    await page.complete(vm)
    expect(mocks.sales[page.update]).toHaveBeenCalledTimes(2)
  })

  test('没有业务更新权限时隐藏重提并阻止直接调用', async () => {
    mocks.permission.mockImplementation(permission => permission !== page.permission)
    const vm = await mountPage(page)
    await vm[page.view](record(1)); await flushPromises()
    expect(vm[page.canRetry](vm[page.current])).toBe(false)
    expect(wrapper.text()).not.toContain(page.label)
    await page.complete(vm)
    expect(mocks.confirm).not.toHaveBeenCalled()
    expect(mocks.sales[page.update]).not.toHaveBeenCalled()
  })

  test('确认期间权限被收回会阻止写请求', async () => {
    const vm = await mountPage(page)
    await vm[page.view](record(1))
    const confirmation = deferred()
    mocks.confirm.mockReturnValueOnce(confirmation.promise)
    const submitting = page.complete(vm)
    mocks.permission.mockReturnValue(false)
    confirmation.resolve('confirm')
    await submitting
    expect(mocks.sales[page.update]).not.toHaveBeenCalled()
    expect(vm.statusUpdating).toBe(false)
  })

  test.each(['success', 'failure'])('早于审核刷新的旧列表 %s 不回滚页面', async outcome => {
    const vm = await mountPage(page)
    const old = deferred()
    mocks.sales[page.list].mockReturnValueOnce(old.promise)
    const fetchList = page.file === 'SalesOutbound' ? () => vm.fetchOutbounds() : () => vm.fetchData()
    const pending = fetchList()
    const latest = record(2, { financeStatus: 'pending', canResubmitInventory: false })
    mocks.sales[page.list].mockResolvedValue(listResponse([latest]))
    await fetchList()
    if (outcome === 'success') old.resolve(listResponse([record(1)]))
    else old.reject(new Error('old list failure'))
    await pending
    expect(vm[page.records].map(row => row.id)).toEqual([2])
    expect(mocks.message.error).not.toHaveBeenCalled()
  })

  test.each([
    { status: 'reversed' }, { status: 'cancelled' }, { financeStatus: 'approved' },
    { financeStatus: 'pending' }, { financeStatus: 'reversed' }, { canResubmitInventory: false },
  ])('非有效驳回状态不允许重提: %j', async invalid => {
    const vm = await mountPage(page)
    mocks.sales[page.detail].mockResolvedValueOnce({ data: record(1, invalid) })
    await vm[page.view](record(1))
    expect(vm[page.canRetry](vm[page.current])).toBe(false)
    await page.complete(vm)
    expect(mocks.sales[page.update]).not.toHaveBeenCalled()
  })

  test('卸载后详情返回不会重新激活审批', async () => {
    const vm = await mountPage(page)
    const pending = deferred()
    mocks.sales[page.detail].mockReturnValueOnce(pending.promise)
    const viewing = vm[page.view](record(1))
    wrapper.unmount(); wrapper = null
    pending.resolve({ data: record(1) }); await viewing
    expect(vm[page.current]).toBeNull()
    expect(mocks.message.error).not.toHaveBeenCalled()
  })
})
