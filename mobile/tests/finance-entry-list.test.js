import { createRequire } from 'node:module'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { Search } from 'vant'
import Entries from '@/views/finance/Entries.vue'
import { financeApi } from '@/api'

const require = createRequire(import.meta.url)
const { toGlEntryApi, fromGlEntryListQuery } = require('../../backend/src/utils/finance/glFieldMap')
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }))
vi.mock('@/api', () => ({ financeApi: { getEntries: vi.fn() } }))

const rows = [
  toGlEntryApi({ id: 1, entry_number: 'GL-DRAFT', is_posted: 0, status: 'draft', total_debit: 0 }),
  toGlEntryApi({ id: 2, entry_number: 'GL-POSTED', is_posted: 1, status: 'posted', total_debit: 120 }),
  toGlEntryApi({ id: 3, entry_number: 'GL-REVERSED', is_posted: 1, is_reversed: 1, status: 'reversed', total_debit: 120 }),
]
let wrapper
beforeEach(() => {
  financeApi.getEntries.mockReset().mockImplementation(async query => {
    // The actual backend boundary ignores unsupported status fields.
    const filters = fromGlEntryListQuery(query)
    const list = rows.filter(item => (filters.is_posted === undefined || item.isPosted === filters.is_posted)
      && (!filters.search || item.entryNumber.includes(filters.search)))
    return { data: { list, total: list.length } }
  })
})
afterEach(() => { wrapper?.unmount(); vi.useRealTimers() })
const open = async () => {
  wrapper = shallowMount(Entries, { global: {
    renderStubDefaultSlot: true, stubs: { UniversalListPage: false }, directives: { permission() {} },
  } })
  await flushPromises()
}

test('posting filters use the real API boolean and preserve posted reversal records', async () => {
  await open()
  for (const [label, isPosted, expected] of [
    ['已过账', true, ['GL-POSTED', 'GL-REVERSED']],
    ['草稿', false, ['GL-DRAFT']],
    ['全部', undefined, ['GL-DRAFT', 'GL-POSTED', 'GL-REVERSED']],
  ]) {
    const chip = wrapper.findAll('.filter-chip').find(element => element.text().startsWith(label))
    expect(chip, `Missing ${label} filter`).toBeDefined()
    await chip.trigger('click')
    await flushPromises()
    expect(financeApi.getEntries.mock.lastCall[0].isPosted).toBe(isPosted)
    expect(financeApi.getEntries.mock.lastCall[0]).not.toHaveProperty('status')
    expect(wrapper.findAll('.item-title').map(element => element.text())).toEqual(expected)
  }
})

test('reversed vouchers have a readable status without unsupported approval tabs', async () => {
  await open()
  expect(wrapper.findAll('.status-tag').map(element => element.text())).toEqual(['草稿', '已过账', '已冲销'])
  expect(wrapper.findAll('.filter-chip').some(element => /待审核|已审核|已驳回/.test(element.text()))).toBe(false)
})

test('debounced search combines with the selected posting filter and clears back to its full list', async () => {
  await open()
  await wrapper.findAll('.filter-chip').find(element => element.text().startsWith('已过账')).trigger('click')
  await flushPromises()
  vi.useFakeTimers()
  wrapper.findComponent(Search).vm.$emit('update:modelValue', 'GL-POSTED')
  await vi.advanceTimersByTimeAsync(301)
  await flushPromises()
  expect(fromGlEntryListQuery(financeApi.getEntries.mock.lastCall[0])).toEqual({ search: 'GL-POSTED', is_posted: true })
  expect(wrapper.findAll('.item-title').map(element => element.text())).toEqual(['GL-POSTED'])
  wrapper.findComponent(Search).vm.$emit('update:modelValue', '')
  await vi.advanceTimersByTimeAsync(301)
  await flushPromises()
  expect(fromGlEntryListQuery(financeApi.getEntries.mock.lastCall[0])).toEqual({ is_posted: true })
  expect(wrapper.findAll('.item-title').map(element => element.text())).toEqual(['GL-POSTED', 'GL-REVERSED'])
})
