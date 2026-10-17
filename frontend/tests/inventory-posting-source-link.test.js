import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { reactive } from 'vue'
import { routeLocationKey } from 'vue-router'
import { flushPromises, mount } from '@vue/test-utils'
import { useInventoryPostingSourceLink } from '@/composables/useInventoryPostingSourceLink'

const mocks = vi.hoisted(() => ({ getBySource: vi.fn(), error: vi.fn() }))
vi.mock('@/api/finance', () => ({ financeApi: { inventoryPostings: mocks } }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: mocks }))
let wrapper
let route
let open
let setSearch
beforeEach(() => {
  vi.clearAllMocks()
  route = reactive({ path: '/inventory/inbound', query: { sourceType: 'inbound', sourceId: '11', sourceNo: 'IN-11' } })
  open = vi.fn().mockResolvedValue(undefined)
  setSearch = vi.fn()
})
afterEach(() => wrapper?.unmount())
async function mountLink(options = {}) {
  wrapper = mount({
    setup() {
      useInventoryPostingSourceLink({ path: '/inventory/inbound', sourceTypes: ['inbound'], open, setSearch, ...options })
      return () => null
    },
  }, { global: { provide: { [routeLocationKey]: route } } })
  await flushPromises()
}

describe('inventory posting source navigation', () => {
  test('opens source detail directly and applies its number to the visible search', async () => {
    await mountLink()
    expect(setSearch).toHaveBeenCalledWith('IN-11')
    expect(open).toHaveBeenCalledExactlyOnceWith({ id: 11, sourceNo: 'IN-11' })
    expect(mocks.getBySource).not.toHaveBeenCalled()
  })

  test('resolves a legacy source number with no stored ID through the posting contract', async () => {
    route.query.sourceId = undefined
    mocks.getBySource.mockResolvedValue({ data: { movement: { sourceId: 12 } } })
    await mountLink()
    expect(mocks.getBySource).toHaveBeenCalledWith({ sourceType: 'inbound', sourceNo: 'IN-11' })
    expect(open).toHaveBeenCalledWith({ id: 12, sourceNo: 'IN-11' })
  })

  test('keeps inactive source pages from consuming another page navigation', async () => {
    route.path = '/sales/outbound'
    await mountLink()
    expect(open).not.toHaveBeenCalled()
    route.path = '/inventory/inbound'
    route.query.sourceType = 'sales_outbound'
    await flushPromises()
    expect(open).not.toHaveBeenCalled()
  })

  test('rejects an invalid ID before a source request', async () => {
    route.query.sourceId = '-1'
    await mountLink()
    expect(open).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalledWith('来源单据定位参数无效')
  })

  test('opens manual transactions by their document number', async () => {
    route.query.sourceId = undefined
    await mountLink({ byNumber: true })
    expect(open).toHaveBeenCalledWith({ id: 0, sourceNo: 'IN-11' })
    expect(mocks.getBySource).not.toHaveBeenCalled()
  })

  test('finishes a pending detail load before opening the latest same-page target', async () => {
    let finish
    open.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    await mountLink()
    route.query = { sourceType: 'inbound', sourceId: '22', sourceNo: 'IN-22' }
    await flushPromises()
    expect(open).toHaveBeenCalledTimes(1)
    finish()
    await flushPromises()
    expect(open).toHaveBeenLastCalledWith({ id: 22, sourceNo: 'IN-22' })
  })
})
