import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, KeepAlive, ref } from 'vue'
import InventoryInbound from '@/views/inventory/InventoryInbound.vue'
import InventoryOutbound from '@/views/inventory/InventoryOutbound.vue'
import InventoryCheck from '@/views/inventory/InventoryCheck.vue'

const mocks = vi.hoisted(() => ({
  dictionary: vi.fn(), locations: vi.fn(), materials: vi.fn(), units: vi.fn(),
  inboundList: vi.fn(), inboundStats: vi.fn(), outboundList: vi.fn(),
  checkList: vi.fn(), checkStats: vi.fn(), warehouses: vi.fn(), searchMaterials: vi.fn(),
  productionTasks: vi.fn(), departments: vi.fn(), error: vi.fn(), warning: vi.fn(), success: vi.fn()
}))
vi.mock('@/api', () => ({
  inventoryApi: {
    getInboundList: mocks.inboundList, getInboundStatistics: mocks.inboundStats,
    getOutboundList: mocks.outboundList, getCheckList: mocks.checkList,
    getCheckStatistics: mocks.checkStats, getWarehouseLocations: mocks.warehouses
  },
  baseDataApi: { getMaterials: mocks.materials, getUnits: mocks.units },
  productionApi: { getProductionTasks: mocks.productionTasks },
  systemApi: { getDepartments: mocks.departments }
}))
vi.mock('@/services/axiosInstance', () => ({ api: {}, fastApi: {} }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ user: {}, hasPermission: () => true }) }))
vi.mock('@/stores/dictionary', () => ({
  useDictionaryStore: () => ({ groups: {}, getOptions: () => [], fetchDictionary: mocks.dictionary })
}))
vi.mock('@/utils/optionLoaders', () => ({ loadLocationOptions: mocks.locations }))
vi.mock('@/utils/searchConfig', () => ({
  SEARCH_CONFIG: { SEARCH_DEBOUNCE_DELAY: 300 }, searchMaterials: mocks.searchMaterials, mapMaterialData: value => value
}))
vi.mock('@/services/printService', () => ({ default: {} }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: mocks }))
vi.mock('element-plus/es/components/message-box/index', () => ({ ElMessageBox: { confirm: vi.fn() } }))

const global = {
  directives: { loading: () => {}, permission: () => {} },
  stubs: Object.fromEntries([
    'PageHeader', 'FinanceQueryCard', 'EmptyState', 'TableRowActions', 'InventoryApprovalPanel',
    'InventoryBatchApproval', 'AppDialog', 'ElTable', 'ElTableColumn', 'ElPagination', 'ElRow',
    'ElCol', 'ElCard', 'ElButton', 'ElIcon', 'ElTag', 'ElInput', 'ElAutocomplete', 'ElSelect',
    'ElOption', 'ElDatePicker', 'ElForm', 'ElFormItem', 'ElPopconfirm', 'ElDivider',
    'ElDescriptions', 'ElDescriptionsItem', 'ElTooltip', 'ElInputNumber', 'ElRadioGroup',
    'ElRadio', 'ElRadioButton', 'ElDropdown', 'ElDropdownMenu', 'ElDropdownItem', 'ElAlert'
  ].map(name => [name, true]))
}
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const response = (id = 1) => ({ data: { list: [{ id, status: 'draft' }], total: 1 } })
const gatewayError = () => Object.assign(new Error('服务器暂时不可用，请稍后重试'), { response: { status: 502 } })
const pages = [
  { name: 'inbound', component: InventoryInbound, list: mocks.inboundList, rows: 'tableData' },
  { name: 'outbound', component: InventoryOutbound, list: mocks.outboundList, rows: 'outboundList' },
  { name: 'check', component: InventoryCheck, list: mocks.checkList, rows: 'checkList' }
]
let wrapper
beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset())
  mocks.dictionary.mockResolvedValue()
  mocks.locations.mockResolvedValue([{ id: 1, name: '仓库' }])
  for (const key of ['materials', 'units', 'warehouses', 'productionTasks', 'departments']) {
    mocks[key].mockResolvedValue({ data: [] })
  }
  mocks.searchMaterials.mockResolvedValue([])
  for (const page of pages) page.list.mockResolvedValue(response())
  mocks.inboundStats.mockResolvedValue({ data: { total: 1 } })
  mocks.checkStats.mockResolvedValue({ data: { total: 1 } })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.useRealTimers()
})

describe.each(pages)('$name rapid navigation', config => {
  test.each(['resolve', 'reject'])('ignores initial list %s after leaving and does not start follow-up statistics', async settle => {
    const pending = deferred()
    config.list.mockReturnValueOnce(pending.promise)
    wrapper = mount(config.component, { global })
    await flushPromises()
    expect(config.list).toHaveBeenCalledOnce()
    const vm = wrapper.vm
    wrapper.unmount()
    pending[settle](settle === 'resolve' ? response(99) : gatewayError())
    await flushPromises()
    expect(vm[config.rows]).toEqual([])
    expect(mocks.inboundStats).not.toHaveBeenCalled()
    expect(mocks.checkStats).not.toHaveBeenCalled()
    expect(mocks.error).not.toHaveBeenCalled()
    expect(console.error).not.toHaveBeenCalled()
  })

  test.each(['resolve', 'reject'])('keeps the newest page when an older list request later %s', async settle => {
    wrapper = mount(config.component, { global })
    await flushPromises()
    const oldPage = deferred()
    const newPage = deferred()
    config.list.mockReturnValueOnce(oldPage.promise).mockReturnValueOnce(newPage.promise)
    wrapper.vm.handleCurrentChange(2)
    wrapper.vm.handleCurrentChange(3)
    newPage.resolve(response(3))
    await flushPromises()
    oldPage[settle](settle === 'resolve' ? response(2) : gatewayError())
    await flushPromises()
    expect(wrapper.vm[config.rows]).toEqual([{ id: 3, status: 'draft' }])
    expect(wrapper.vm.loading).toBe(false)
    expect(mocks.error).not.toHaveBeenCalled()
    expect(console.error).not.toHaveBeenCalled()
  })

  test('keeps the loading indicator until the newest list request finishes', async () => {
    wrapper = mount(config.component, { global })
    await flushPromises()
    const oldPage = deferred()
    const newPage = deferred()
    config.list.mockReturnValueOnce(oldPage.promise).mockReturnValueOnce(newPage.promise)
    wrapper.vm.handleCurrentChange(2)
    wrapper.vm.handleCurrentChange(3)
    oldPage.resolve(response(2))
    await flushPromises()
    expect(wrapper.vm.loading).toBe(true)
    expect(wrapper.vm[config.rows][0].id).toBe(1)
    newPage.resolve(response(3))
    await flushPromises()
    expect(wrapper.vm.loading).toBe(false)
    expect(wrapper.vm[config.rows][0].id).toBe(3)
  })

  test.each(['resolve', 'reject'])('restarts interrupted cached-page initialization without reviving the old %s callback', async settle => {
    const pending = deferred()
    config.list.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response(7))
    const visible = ref(true)
    const host = defineComponent({ setup: () => () => h(KeepAlive, null, { default: () => visible.value ? h(config.component) : null }) })
    wrapper = mount(host, { global })
    await flushPromises()
    const vm = wrapper.findComponent(config.component).vm
    visible.value = false
    await flushPromises()
    expect(vm.loading).toBe(false)
    visible.value = true
    await flushPromises()
    expect(config.list).toHaveBeenCalledTimes(2)
    expect(vm[config.rows][0].id).toBe(7)
    pending[settle](settle === 'resolve' ? response(99) : gatewayError())
    await flushPromises()
    expect(vm[config.rows][0].id).toBe(7)
    expect(mocks.error).not.toHaveBeenCalled()
    expect(console.error).not.toHaveBeenCalled()
  })

  test('refreshes the selected page when leaving during a later pagination request', async () => {
    const visible = ref(true)
    const host = defineComponent({ setup: () => () => h(KeepAlive, null, { default: () => visible.value ? h(config.component) : null }) })
    wrapper = mount(host, { global })
    await flushPromises()
    const vm = wrapper.findComponent(config.component).vm
    const pending = deferred()
    config.list.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response(2))
    vm.handleCurrentChange(2)
    visible.value = false
    await flushPromises()
    visible.value = true
    await flushPromises()
    expect(config.list).toHaveBeenCalledTimes(3)
    expect(config.list.mock.lastCall[0].page).toBe(2)
    expect(vm[config.rows][0].id).toBe(2)
    pending.resolve(response(99))
    await flushPromises()
    expect(vm[config.rows][0].id).toBe(2)
  })
})

describe('initialization dependencies and dialog lookups', () => {
  test.each(pages.slice(0, 2))('$name stops after a pending dictionary completes off-page', async config => {
    const pending = deferred()
    mocks.dictionary.mockReturnValueOnce(pending.promise)
    wrapper = mount(config.component, { global })
    wrapper.unmount()
    pending.resolve()
    await flushPromises()
    expect(config.list).not.toHaveBeenCalled()
    expect(mocks.locations).not.toHaveBeenCalled()
    expect(mocks.departments).not.toHaveBeenCalled()
    expect(mocks.productionTasks).not.toHaveBeenCalled()
    expect(mocks.materials).not.toHaveBeenCalled()
    expect(mocks.units).not.toHaveBeenCalled()
  })

  test('inbound stops after pending warehouses complete off-page', async () => {
    const pending = deferred()
    mocks.locations.mockReturnValueOnce(pending.promise)
    wrapper = mount(InventoryInbound, { global })
    await flushPromises()
    expect(mocks.locations).toHaveBeenCalledOnce()
    wrapper.unmount()
    pending.resolve([])
    await flushPromises()
    expect(mocks.inboundList).not.toHaveBeenCalled()
    expect(mocks.materials).not.toHaveBeenCalled()
    expect(mocks.units).not.toHaveBeenCalled()
    expect(mocks.warning).not.toHaveBeenCalled()
  })

  test('inbound ignores failed material/unit preloads after leaving', async () => {
    const material = deferred(), unit = deferred()
    mocks.materials.mockReturnValueOnce(material.promise)
    mocks.units.mockReturnValueOnce(unit.promise)
    wrapper = mount(InventoryInbound, { global })
    await flushPromises()
    wrapper.unmount()
    material.reject(gatewayError())
    unit.reject(gatewayError())
    await flushPromises()
    expect(mocks.error).not.toHaveBeenCalled()
    expect(console.error).not.toHaveBeenCalled()
  })

  test('outbound loads creation-only production tasks when the create dialog opens', async () => {
    wrapper = mount(InventoryOutbound, { global })
    await flushPromises()
    expect(mocks.productionTasks).not.toHaveBeenCalled()
    await wrapper.vm.handleAdd()
    expect(mocks.productionTasks).toHaveBeenCalledOnce()
    expect(wrapper.vm.dialogVisible).toBe(true)
  })

  test('check loads dialog-only warehouses on demand and cancels delayed material search when leaving', async () => {
    wrapper = mount(InventoryCheck, { global })
    await flushPromises()
    expect(mocks.warehouses).not.toHaveBeenCalled()
    expect(mocks.searchMaterials).not.toHaveBeenCalled()
    vi.useFakeTimers()
    await wrapper.vm.openCheckDialog()
    expect(mocks.warehouses).toHaveBeenCalledOnce()
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(350)
    expect(mocks.searchMaterials).not.toHaveBeenCalled()
  })
})
