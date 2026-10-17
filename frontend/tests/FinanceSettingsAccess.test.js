import { reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import FinanceSettings from '@/views/finance/settings/FinanceSettings.vue'
import routes from '@/router/modules/finance'
import { financeDirectives, financeStubs } from './helpers/financeFormHarness'

const state = vi.hoisted(() => ({ permissions: [], query: {}, settings: { get: vi.fn(), update: vi.fn(), reset: vi.fn() }, error: vi.fn() }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ hasPermission: p => state.permissions.includes(p) }) }))
vi.mock('@/stores/dictionary', () => ({ useDictionaryStore: () => ({ getOptions: () => [] }) }))
vi.mock('@/api', () => ({ financeApi: { settings: state.settings } }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: state.query }) }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { success: vi.fn(), warning: vi.fn(), error: state.error } }))
vi.mock('@/views/finance/settings/AutomationTab.vue', () => ({ default: { template: '<p data-automation>自动化内容</p>' } }))
let wrapper
beforeEach(() => {
  state.permissions = []; state.query = reactive({ tab: 'automation' })
  state.settings.get.mockReset().mockResolvedValue({ data: {} })
  state.settings.update.mockReset(); state.error.mockReset()
})
afterEach(() => wrapper?.unmount())
const open = async () => {
  wrapper = mount(FinanceSettings, { global: { stubs: { ...financeStubs, ElCheckbox: true }, directives: financeDirectives } })
  await flushPromises()
}

test('the merged entry permits automation viewers and only mounts their authorized tab', async () => {
  state.permissions = ['finance:automation:view']
  expect(routes.children.find(route => route.path === 'settings').meta.permission).toContain('finance:automation:view')
  await open()
  expect(wrapper.find('[data-automation]').exists()).toBe(true)
  expect(wrapper.text()).not.toContain('基础设置')
  expect(state.settings.get).not.toHaveBeenCalled()
})

test('settings viewers never mount automation without its permission, even through the query string', async () => {
  state.permissions = ['finance:settings:view']
  await open()
  expect(wrapper.find('[data-automation]').exists()).toBe(false)
  expect(wrapper.find('[data-tab="base"]').exists()).toBe(true)
  expect(state.settings.get).toHaveBeenCalledOnce()
})

test('a failed read cannot save default values over the unknown stored settings', async () => {
  state.permissions = ['finance:settings:view', 'finance:settings:update']
  state.settings.get.mockRejectedValueOnce(new Error('offline'))
  await open()
  await wrapper.findAll('button').find(button => button.text() === '保存设置').trigger('click')
  await flushPromises()
  expect(state.settings.update).not.toHaveBeenCalled()
})
