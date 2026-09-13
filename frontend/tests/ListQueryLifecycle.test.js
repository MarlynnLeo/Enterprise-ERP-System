import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, shallowMount } from '@vue/test-utils'
import MaterialShortage from '@/views/production/MaterialShortage.vue'
import PackingLists from '@/views/sales/PackingLists.vue'

const { shortage, packing } = vi.hoisted(() => ({ shortage: vi.fn(), packing: vi.fn() }))
vi.mock('@/api', () => ({
  productionApi: { getMaterialShortageSummary: shortage },
  salesApi: { getPackingLists: packing },
  baseDataApi: { getCustomers: async () => ({ data: [] }) },
  purchaseApi: {},
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ hasPermission: () => true }) }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { error: vi.fn() } }))
vi.mock('element-plus/es/components/message/style/css', () => ({}))
vi.mock('element-plus/es/components/message-box/style/css', () => ({}))

const Table = defineComponent({ name: 'ListTable', props: ['data'], setup: () => () => h('div') })
const Pagination = defineComponent({
  name: 'ListPagination', props: ['total', 'pageSize', 'currentPage'], emits: ['size-change'],
  setup: (_, { emit }) => () => h('button', { onClick: () => emit('size-change', 50) }, '50条/页'),
})
const wrappers = []
const pending = []
const open = component => {
  const wrapper = shallowMount(component, { global: {
    stubs: {
      ElCard: { template: '<div><slot /></div>' },
      ElTable: Table, ElTableColumn: true, ElPagination: Pagination,
      PageHeader: true, FinanceQueryCard: true, AppDialog: true,
    },
    directives: { loading: () => {}, permission: () => {} },
  } })
  wrappers.push(wrapper)
  return wrapper
}

beforeEach(() => {
  pending.length = 0
  for (const loader of [shortage, packing]) {
    loader.mockReset().mockImplementation(() => new Promise(resolve => pending.push(resolve)))
  }
})
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()))

describe.each([
  ['material shortage', MaterialShortage, shortage],
  ['packing lists', PackingLists, packing],
])('%s query lifecycle', (_, component, loader) => {
  test('accepts a new page size during loading and preserves its result when the older query finishes', async () => {
    const wrapper = open(component)
    await flushPromises()
    await wrapper.findComponent(Pagination).trigger('click')
    expect(loader).toHaveBeenCalledTimes(2)
    expect(loader).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 50 }))
    pending[1]({ data: { list: [{ id: 2 }], total: 75 } })
    await flushPromises()
    pending[0]({ data: { list: [{ id: 1 }], total: 5 } })
    await flushPromises()
    expect(wrapper.findComponent(Table).props('data')).toEqual([{ id: 2 }])
    expect(wrapper.findComponent(Pagination).props('total')).toBe(75)
  })
})

test('packing statistics come from the complete server result with camelCase fields', async () => {
  const wrapper = open(PackingLists)
  pending[0]({ data: {
    list: [{ id: 1, totalBoxes: '8', totalQuantity: '12.5', status: 'draft' }], total: 50,
    statistics: { totalLists: 50, draftCount: 30, confirmedCount: 10, packingCount: 5, completedCount: 5, totalBoxes: 80 },
  } })
  await flushPromises()
  expect(wrapper.findAll('.stat-value').map(node => node.text())).toEqual(['50', '30', '10', '5', '5', '80'])
})
