import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import SettlementDashboard from '@/views/finance/components/SettlementDashboard.vue'
import ProductionCalendar from '@/views/production/ProductionCalendar.vue'

const mocks = vi.hoisted(() => ({
  canUpdate: true,
  finance: { getAPSettlementDashboard: vi.fn(), getARSettlementDashboard: vi.fn() },
  production: { getCalendars: vi.fn(), getCalendarOverrides: vi.fn(), saveCalendarOverrides: vi.fn() },
}))
vi.mock('@/api/finance', () => ({ financeApi: mocks.finance }))
vi.mock('@/api/production', () => ({ productionApi: mocks.production }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ hasPermission: () => mocks.canUpdate }) }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { error: vi.fn() } }))

const Container = { template: '<div><slot name="header" /><slot /></div>' }
const Button = { template: '<button type="button"><slot /></button>' }
const AppDialog = {
  props: ['modelValue', 'title'],
  template: '<section v-if="modelValue" role="dialog" :aria-label="title"><slot /><slot name="footer" /></section>',
}
const global = {
  directives: { loading: {}, permission: {} },
  stubs: {
    ElRow: Container, ElCol: Container, ElCard: Container, ElButton: Button, ElIcon: Container,
    ElForm: Container, ElFormItem: Container, ElTag: Container, ElDivider: Container,
    ElRadioGroup: Container, ElRadioButton: Container, ElSwitch: true, ElTimePicker: true,
    ElInput: true, ElSelect: true, ElOption: true, ElTable: true, ElTableColumn: true,
    FinanceQueryCard: true, AppDialog,
  },
}
let wrapper
beforeEach(() => {
  mocks.canUpdate = true
  Object.values(mocks.finance).forEach(fn => fn.mockReset().mockResolvedValue({ data: { details: [] } }))
  Object.values(mocks.production).forEach(fn => fn.mockReset().mockResolvedValue({ data: [] }))
})
afterEach(() => wrapper?.unmount())

describe('page keyboard interactions', () => {
  test('Enter and Space filter settlement details and update the pressed card', async () => {
    wrapper = mount(SettlementDashboard, { props: { side: 'ap' }, global })
    await flushPromises()
    const cards = wrapper.findAll('.stat-card[role="button"]')
    expect(cards).toHaveLength(6)
    expect(cards[0].attributes('aria-pressed')).toBe('true')
    expect(cards.every(card => card.attributes('tabindex') === '0')).toBe(true)
    mocks.finance.getAPSettlementDashboard.mockClear()

    await cards[1].trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(mocks.finance.getAPSettlementDashboard).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ settlementKey: 'unpaid' }))
    expect(cards[0].attributes('aria-pressed')).toBe('false')
    expect(cards[1].attributes('aria-pressed')).toBe('true')
    expect(wrapper.emitted('filter-status')).toEqual([['已确认']])

    await cards[4].trigger('keydown', { key: ' ' })
    await flushPromises()
    expect(mocks.finance.getAPSettlementDashboard).toHaveBeenLastCalledWith(expect.objectContaining({ settlementKey: 'paid' }))
    expect(cards[4].attributes('aria-pressed')).toBe('true')
    expect(wrapper.emitted('filter-status').at(-1)).toEqual(['已付款'])

    mocks.finance.getAPSettlementDashboard.mockClear()
    await cards[1].get('.stat-label').trigger('keydown', { key: 'Enter' })
    expect(mocks.finance.getAPSettlementDashboard).not.toHaveBeenCalled()
    expect(cards[4].attributes('aria-pressed')).toBe('true')
  })

  test.each(['Enter', ' '])('calendar %s opens the focused day without saving it', async key => {
    wrapper = mount(ProductionCalendar, { global })
    await flushPromises()
    const day = wrapper.findAll('.calendar-cell[role="button"]')[0]
    expect(day.attributes('tabindex')).toBe('0')
    const date = day.attributes('aria-label').split(' ')[0]
    await day.trigger('keydown', { key })
    expect(wrapper.get('[role="dialog"]').attributes('aria-label')).toContain(date)
    expect(mocks.production.saveCalendarOverrides).not.toHaveBeenCalled()
    expect(wrapper.findAll('.calendar-cell.is-other-month[tabindex]')).toHaveLength(0)
  })

  test('calendar days remain read-only without update permission', async () => {
    mocks.canUpdate = false
    wrapper = mount(ProductionCalendar, { global })
    await flushPromises()
    expect(wrapper.findAll('.calendar-cell[role="button"]')).toHaveLength(0)
    expect(wrapper.findAll('.calendar-cell[tabindex]')).toHaveLength(0)
    const day = wrapper.findAll('.calendar-cell:not(.is-other-month)')[0]
    await day.trigger('keydown', { key: 'Enter' })
    await day.trigger('keydown', { key: ' ' })
    await day.trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(mocks.production.saveCalendarOverrides).not.toHaveBeenCalled()
  })
})
