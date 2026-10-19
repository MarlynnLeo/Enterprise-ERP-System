import { createRequire } from 'node:module'
import { reactive } from 'vue'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { Button, Empty, showConfirmDialog, showToast } from 'vant'
import EntryDetail from '@/views/finance/EntryDetail.vue'

const require = createRequire(import.meta.url)
const { toGlEntryApi, toGlEntryItemApi } = require('../../backend/src/utils/finance/glFieldMap')
const state = vi.hoisted(() => ({ financeApi: { getEntry: vi.fn(), approveEntry: vi.fn() }, api: { get: vi.fn() }, route: null }))
vi.mock('@/api', () => ({ financeApi: state.financeApi, default: state.api }))
vi.mock('vue-router', () => ({ useRoute: () => state.route }))
vi.mock('vant', async original => ({ ...await original(), showConfirmDialog: vi.fn(), showToast: vi.fn() }))

const entry = (id = 900, changes = {}) => toGlEntryApi({ id: Number(id), entry_number: `GL-${id}`, is_posted: 1,
  entry_date: '2026-10-17', posting_date: '2026-10-17', total_debit: 2500, total_credit: 2500,
  creator_name: '会计员', ...changes })
const items = id => [toGlEntryItemApi({ id: 1, entry_id: Number(id), account_code: '1001', account_name: '库存现金', debit_amount: 2500, credit_amount: 0 })]
const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail }); return { promise, resolve, reject } }
let wrapper
const open = async () => {
  wrapper = shallowMount(EntryDetail, { global: { renderStubDefaultSlot: true, directives: { permission() {} },
    stubs: { VanNavBar: { template: '<nav><slot name="right" /></nav>' } }
  } })
  await flushPromises()
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  state.route = reactive({ params: { id: '900' } })
  state.financeApi.getEntry.mockImplementation(id => Promise.resolve({ data: { entry: entry(id) } }))
  state.financeApi.approveEntry.mockResolvedValue({ data: {} })
  state.api.get.mockImplementation(path => Promise.resolve({ data: items(path.split('/')[3]) }))
  showConfirmDialog.mockResolvedValue(true)
})
afterEach(() => wrapper?.unmount())

test('renders the posted status, totals, number and metadata from actual backend mappers', async () => {
  await open()
  expect(wrapper.get('.entry-status').text()).toBe('已过账')
  expect(wrapper.get('.entry-number').text()).toBe('GL-900')
  expect(wrapper.findAll('.amount-value').map(element => element.text())).toEqual(['¥2,500.00', '¥2,500.00'])
  expect(wrapper.get('.hero-meta').text()).toContain('2026-10-17')
  expect(wrapper.get('.hero-meta').text()).toContain('会计员')
  expect(wrapper.get('.item-account').text()).toContain('库存现金')
  expect(wrapper.find('.post-btn').exists()).toBe(false)
})

test('a reversed voucher is identified and cannot be posted again', async () => {
  state.financeApi.getEntry.mockResolvedValueOnce({ data: { entry: entry(900, { is_reversed: 1 }) } })
  await open()
  expect(wrapper.get('.entry-status').text()).toBe('已冲销')
  expect(wrapper.find('.post-btn').exists()).toBe(false)
})

test('draft posting locks duplicate clicks and reloads the posted voucher', async () => {
  state.financeApi.getEntry.mockResolvedValueOnce({ data: { entry: entry(900, { is_posted: 0 }) } })
  const confirmation = deferred()
  showConfirmDialog.mockReturnValueOnce(confirmation.promise)
  await open()
  const button = wrapper.get('.post-btn').element
  button.click(); button.click()
  await flushPromises()
  expect(showConfirmDialog).toHaveBeenCalledOnce()
  confirmation.resolve(true)
  await flushPromises()
  expect(state.financeApi.approveEntry).toHaveBeenCalledExactlyOnceWith(900)
  expect(wrapper.get('.entry-status').text()).toBe('已过账')
  expect(wrapper.find('.post-btn').exists()).toBe(false)
})

test('a slower previous voucher cannot replace the newly selected header or items', async () => {
  const oldHeader = deferred(), oldItems = deferred()
  state.financeApi.getEntry.mockReturnValueOnce(oldHeader.promise)
  state.api.get.mockReturnValueOnce(oldItems.promise)
  await open()
  state.route.params.id = '901'
  await flushPromises()
  oldHeader.resolve({ data: { entry: entry(900, { total_debit: 500, total_credit: 500 }) } })
  oldItems.resolve({ data: items(900) })
  await flushPromises()
  expect(wrapper.get('.entry-number').text()).toBe('GL-901')
  expect(wrapper.findAll('.amount-value').map(element => element.text())).toEqual(['¥2,500.00', '¥2,500.00'])
})

test('failed replacement items clear the previous voucher and allow retrying the current one', async () => {
  await open()
  state.api.get.mockRejectedValueOnce(new Error('明细暂时不可用'))
  state.route.params.id = '901'
  await flushPromises()
  expect(wrapper.find('.entry-hero').exists()).toBe(false)
  expect(wrapper.getComponent(Empty).props('description')).toContain('明细暂时不可用')
  wrapper.findComponent(Button).vm.$emit('click')
  await flushPromises()
  expect(wrapper.get('.entry-number').text()).toBe('GL-901')
})

test('changing the voucher while confirmation is open never posts the replacement', async () => {
  state.financeApi.getEntry.mockResolvedValueOnce({ data: { entry: entry(900, { is_posted: 0 }) } })
  const confirmation = deferred()
  showConfirmDialog.mockReturnValueOnce(confirmation.promise)
  await open()
  await wrapper.get('.post-btn').trigger('click')
  state.route.params.id = '901'
  await flushPromises()
  confirmation.resolve(true)
  await flushPromises()
  expect(state.financeApi.approveEntry).not.toHaveBeenCalled()
  expect(wrapper.get('.entry-number').text()).toBe('GL-901')
})

test('completion of a previous post cannot refresh or notify the current voucher', async () => {
  state.financeApi.getEntry.mockResolvedValueOnce({ data: { entry: entry(900, { is_posted: 0 }) } })
  const pending = deferred()
  state.financeApi.approveEntry.mockReturnValueOnce(pending.promise)
  await open()
  await wrapper.get('.post-btn').trigger('click')
  await flushPromises()
  state.route.params.id = '901'
  await flushPromises()
  pending.resolve({ data: {} })
  await flushPromises()
  expect(state.financeApi.approveEntry).toHaveBeenCalledExactlyOnceWith(900)
  expect(state.financeApi.getEntry.mock.calls).toEqual([['900'], ['901']])
  expect(showToast).not.toHaveBeenCalledWith('过账成功')
  expect(wrapper.get('.entry-number').text()).toBe('GL-901')
})

test('unmounting while confirmation is open prevents a late posting request', async () => {
  state.financeApi.getEntry.mockResolvedValueOnce({ data: { entry: entry(900, { is_posted: 0 }) } })
  const confirmation = deferred()
  showConfirmDialog.mockReturnValueOnce(confirmation.promise)
  await open()
  await wrapper.get('.post-btn').trigger('click')
  wrapper.unmount()
  confirmation.resolve(true)
  await flushPromises()
  expect(state.financeApi.approveEntry).not.toHaveBeenCalled()
})
