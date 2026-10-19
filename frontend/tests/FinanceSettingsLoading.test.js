import { reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { ElTabs, ElTabPane } from 'element-plus/es/components/tabs/index'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import FinanceSettings from '@/views/finance/settings/FinanceSettings.vue'
import { financeDirectives, financeStubs } from './helpers/financeFormHarness'

const state = vi.hoisted(() => ({
  permissions: [], query: {}, settings: vi.fn(),
  automation: { getTaskStatus: vi.fn(), getFailedJobs: vi.fn(), getHistory: vi.fn() },
}))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ hasPermission: permission => state.permissions.includes(permission) }) }))
vi.mock('@/stores/dictionary', () => ({ useDictionaryStore: () => ({ getOptions: () => [] }) }))
vi.mock('@/api', () => ({ financeApi: { settings: { get: state.settings } } }))
vi.mock('@/api/finance', () => ({ financeApi: { automation: state.automation } }))
vi.mock('@/api/inventory', () => ({ inventoryApi: {} }))
vi.mock('@/api/production', () => ({ productionApi: {} }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: state.query }), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }))

let wrapper
beforeEach(() => {
  state.permissions = ['finance:settings:view', 'finance:automation:view']
  state.query = reactive({})
  state.settings.mockReset().mockResolvedValue({ data: {} })
  state.automation.getTaskStatus.mockReset().mockResolvedValue({ data: {} })
  state.automation.getFailedJobs.mockReset().mockResolvedValue({ data: { list: [], total: 0 } })
  state.automation.getHistory.mockReset().mockResolvedValue({ data: { items: [] } })
})
afterEach(() => wrapper?.unmount())

async function settle() {
  await vi.dynamicImportSettled()
  await flushPromises()
}
async function open() {
  const { ElTabs: _tabs, ElTabPane: _pane, ...stubs } = financeStubs
  wrapper = mount(FinanceSettings, {
    global: { components: { ElTabs, ElTabPane }, stubs: { ...stubs, ElCheckbox: true }, directives: financeDirectives },
  })
  await settle()
}
async function clickTab(label) {
  await wrapper.findAll('[role="tab"]').find(tab => tab.text() === label).trigger('click')
  await settle()
}
const automationCallCount = () => Object.values(state.automation).reduce((sum, mock) => sum + mock.mock.calls.length, 0)

test('base settings do not mount or request unopened automation with real Element Plus tabs', async () => {
  await open()
  expect(state.settings).toHaveBeenCalledOnce()
  expect(automationCallCount()).toBe(0)
})

test('automation loads on first visit and keeps the mounted state when switching away and back', async () => {
  await open()
  await clickTab('自动化任务')
  expect(automationCallCount()).toBe(3)
  await clickTab('基础设置')
  await clickTab('自动化任务')
  expect(automationCallCount()).toBe(3)
  expect(state.automation.getFailedJobs).toHaveBeenCalledExactlyOnceWith({ status: 'pending', page: 1, pageSize: 20 })
})

test('an authorized automation-only deep link loads automation without reading settings', async () => {
  state.permissions = ['finance:automation:view']
  state.query.tab = 'automation'
  await open()
  expect(state.settings).not.toHaveBeenCalled()
  expect(automationCallCount()).toBe(3)
})

test('an unauthorized automation deep link never requests its APIs', async () => {
  state.permissions = ['finance:settings:view']
  state.query.tab = 'automation'
  await open()
  expect(state.settings).toHaveBeenCalledOnce()
  expect(automationCallCount()).toBe(0)
  expect(wrapper.findAll('[role="tab"]').some(tab => tab.text() === '自动化任务')).toBe(false)
})
