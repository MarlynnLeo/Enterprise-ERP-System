import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { List } from 'vant'
import EditCheck from '@/views/inventory/EditCheck.vue'
import { inventoryApi } from '@/api'

vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: '1' } }), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/api', () => ({ inventoryApi: { getCheckDetail: vi.fn(), getAllMaterials: vi.fn() } }))
vi.mock('vant', async original => ({ ...await original(), showToast: vi.fn() }))
let wrapper
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
beforeEach(() => {
  inventoryApi.getCheckDetail.mockResolvedValue({ data: { id: 1, status: 'draft', items: [] } })
  inventoryApi.getAllMaterials.mockReset()
  vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(() => document.body)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 300, height: 100, top: 0, left: 0, bottom: 100, right: 300 })
})
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks() })
async function open() {
  wrapper = mount(EditCheck, { attachTo: document.body })
  await flushPromises()
  wrapper.vm.showMaterialPicker = true
  await flushPromises()
  const list = wrapper.findComponent(List)
  list.vm.check()
  await flushPromises()
  return list
}

test('real Vant List can load after setting v-model loading and append a second page', async () => {
  const first = deferred(), second = deferred()
  inventoryApi.getAllMaterials.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  const list = await open()
  expect(list.emitted('update:loading')[0]).toEqual([true])
  expect(inventoryApi.getAllMaterials).toHaveBeenCalledTimes(1)
  first.resolve({ data: { items: [{ id: 1, name: '螺钉' }], total: 2 } })
  await flushPromises()
  list.vm.check(); await flushPromises()
  expect(inventoryApi.getAllMaterials.mock.calls[1][0].page).toBe(2)
  second.resolve({ data: { items: [{ id: 2, name: '螺母' }], total: 2 } })
  await flushPromises()
  expect(wrapper.vm.materialList.map(item => item.id)).toEqual([1, 2])
  expect(wrapper.vm.loadingMaterials).toBe(false)
  expect(wrapper.vm.materialListFinished).toBe(true)
})

test('search replaces a pending request and ignores its late response', async () => {
  const old = deferred()
  inventoryApi.getAllMaterials.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ data: { items: [{ id: 9, name: '新物料' }], total: 1 } })
  await open()
  wrapper.vm.materialSearch = '新物料'
  await wrapper.vm.onSearchMaterial()
  old.resolve({ data: { items: [{ id: 1, name: '旧物料' }], total: 1 } })
  await flushPromises()
  expect(inventoryApi.getAllMaterials.mock.calls[1][0]).toMatchObject({ page: 1, search: '新物料' })
  expect(wrapper.vm.materialList.map(item => item.id)).toEqual([9])
})

test('failed loading exposes the Vant retry control and retries the same page', async () => {
  inventoryApi.getAllMaterials.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ data: { items: [{ id: 1 }], total: 1 } })
  const list = await open()
  expect(wrapper.vm.materialListError).toBe(true)
  await list.find('.van-list__error-text').trigger('click')
  await flushPromises()
  expect(inventoryApi.getAllMaterials.mock.calls.map(([params]) => params.page)).toEqual([1, 1])
  expect(wrapper.vm.materialListError).toBe(false)
  expect(wrapper.vm.materialList).toHaveLength(1)
})
