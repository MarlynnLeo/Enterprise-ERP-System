import fs from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { reactive, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import postcss from 'postcss'
import { THEME_PRESET_LIST } from '@/config/themePresets'
import { DASHBOARD_CONTEXT } from '@/views/dashboard/dashboardContext'
import DashboardLayout from '@/views/dashboard/layouts/DashboardLayout.vue'
import SharedDashboardLayout from '@/views/dashboard/layouts/SharedDashboardLayout.vue'
import ClassicProductionPlanTable from '@/views/dashboard/components/classic/ProductionPlanTable.vue'
import SharedProductionPlanTable from '@/views/dashboard/components/ProductionPlanTable.vue'

let themeState
vi.mock('@/stores/theme', () => ({ useThemeStore: () => themeState }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ user: null }) }))

let wrapper
afterEach(() => wrapper?.unmount())

const fixture = () => ({
  statCards: ref([]), isLoadingStats: ref(false), userProfile: ref({}), weather: ref({}), isLoadingProfile: ref(false),
  activeTodoTasks: ref([]), activeTodoTab: ref('pending'), activeTodoCount: ref(0),
  switchTodoTab: vi.fn(), goToTodoPage: vi.fn(), viewTodoDetail: vi.fn(),
  onlineTimeRanking: ref([]), rankingLoading: ref(false), rankingDate: ref('2026/9/29'), fetchOnlineTimeRanking: vi.fn(),
  metalPriceCards: ref({}), exchangeRateCards: ref({}), exchangeRateLoading: ref(false), metalPricesLoading: ref(false),
  metalPrices: ref({}), exchangeRates: ref({}), setMiniChartRef: vi.fn(), setMetalMiniChartRef: vi.fn(),
  setExchangeRateChartRef: vi.fn(), refreshAllPrices: vi.fn(), onPricePanelTabChange: vi.fn(),
  canViewProductionPlans: ref(true), warningList: ref([]), viewProductionPlan: vi.fn(), changeMonth: vi.fn(),
  currentMonthStr: ref('2026年9月'), currentYear: ref(2026), currentMonth: ref(9), currentDay: ref(29),
  calendarDays: ref([]), todayLabel: '2026年9月29日', refreshDashboardCharts: vi.fn()
})

describe('dashboard theme isolation', () => {
  test('classic shows the first nine plans without truncating shared data or changing row navigation', async () => {
    const plans = Array.from({ length: 20 }, (_, index) => ({
      id: index + 1, studentId: `PLAN-${index + 1}`, name: `产品${index + 1}`,
      studentType: 'A', protectionId: '20件', status: 'in_progress', warningType: '生产中'
    }))
    wrapper = mount(ClassicProductionPlanTable, { props: { warningList: plans } })
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(9)
    expect(wrapper.get('.plan-count').text()).toBe('9 项计划')
    expect(rows[8].text()).toContain('PLAN-9')
    await rows[0].trigger('click')
    await rows[8].trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('view')).toEqual([[1], [9]])
    expect(plans).toHaveLength(20)
    wrapper.unmount()
    wrapper = mount(SharedProductionPlanTable, { props: { warningList: plans } })
    expect(wrapper.findAll('tbody tr')).toHaveLength(20)
    wrapper.unmount()
    wrapper = mount(ClassicProductionPlanTable, { props: { warningList: plans.slice(0, 3) } })
    expect(wrapper.findAll('tbody tr')).toHaveLength(3)
    await wrapper.setProps({ warningList: [] })
    expect(wrapper.findAll('tbody tr')).toHaveLength(0)
    expect(wrapper.get('.plan-empty-state').text()).toContain('暂无生产计划')
  })

  test('only classic uses its independent layout; every other preset shares one mounted layout', async () => {
    themeState = reactive({ appearance: { preset: 'workspace' } })
    const context = fixture()
    wrapper = mount(DashboardLayout, {
      global: {
        provide: { [DASHBOARD_CONTEXT]: context },
        stubs: {
          DashboardTodoList: true, OnlineTimeRanking: true, PersonalInfoCard: true,
          PriceExchangePanel: true, ProductionPlanTable: true,
          ElRow: { template: '<div class="shared-row"><slot /></div>' },
          ElCol: { template: '<div><slot /></div>' },
          ElButton: { template: '<button><slot /></button>' },
          ElSkeletonItem: true,
          ElIcon: { template: '<span><slot /></span>' }
        }
      }
    })
    expect(wrapper.find('.dashboard--classic .dashboard-content').exists()).toBe(true)
    expect(wrapper.find('.dashboard--shared').exists()).toBe(false)
    let sharedInstance
    for (const preset of THEME_PRESET_LIST.filter(item => item.id !== 'workspace')) {
      themeState.appearance.preset = preset.id
      await flushPromises()
      expect(wrapper.find('.dashboard--classic').exists()).toBe(false)
      expect(wrapper.findAll('.dashboard--shared .main-layout > .shared-row')).toHaveLength(3)
      sharedInstance ??= wrapper.getComponent(SharedDashboardLayout).vm.$.uid
      expect(wrapper.getComponent(SharedDashboardLayout).vm.$.uid).toBe(sharedInstance)
    }
    expect(context.refreshDashboardCharts).toHaveBeenCalledTimes(1)
    themeState.appearance.preset = 'workspace'
    await flushPromises()
    expect(wrapper.find('.dashboard--classic .overview-metrics').exists()).toBe(true)
    expect(wrapper.find('.dashboard--shared').exists()).toBe(false)
    expect(context.refreshDashboardCharts).toHaveBeenCalledTimes(2)
  })

  test.each([['classic', 'classic-price-panel.css'], ['shared', 'price-panel.css']])(
    '%s price styles cannot match a dashboard from the other layout', (family, filename) => {
      const styles = postcss.parse(fs.readFileSync(resolve('src/assets', filename), 'utf8'))
      const selectors = []
      styles.walkRules(rule => {
        if (rule.parent.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return
        selectors.push(...rule.selectors.filter(selector => !selector.startsWith('.list-container')))
      })
      expect(selectors.length).toBeGreaterThan(0)
      expect(selectors.every(selector => selector.startsWith(`:where(.dashboard--${family}) `))).toBe(true)
    }
  )
})
