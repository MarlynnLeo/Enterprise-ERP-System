import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import ThemeSelector from '@/components/common/ThemeSelector.vue'
import { THEME_PRESETS, THEME_PRESET_LIST } from '@/config/themePresets'
import { ElMessage } from 'element-plus/es/components/message/index'

let store, wrapper, auth
vi.mock('@/stores/theme', () => ({ useThemeStore: () => store }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('@/utils/themeLoader', () => ({ prefetchThemeCss: vi.fn() }))
vi.mock('element-plus/es/components/message/index', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
}))

const Dropdown = { emits: ['command'], template: '<div><slot /><slot name="dropdown" /></div>' }
beforeEach(() => {
  auth = reactive({ isAuthenticated: true, user: { id: 1 } })
  store = reactive({
    appearance: { preset: 'kacon' },
    currentPreset: THEME_PRESETS.kacon,
    themePresets: THEME_PRESETS,
    themePresetList: THEME_PRESET_LIST,
    applyPreset: vi.fn()
  })
  wrapper = mount(ThemeSelector, {
    global: { stubs: { 'el-dropdown': Dropdown, 'el-dropdown-menu': { template: '<div><slot /></div>' }, 'el-dropdown-item': { template: '<div><slot /></div>' }, 'el-icon': { template: '<span><slot /></span>' } } }
  })
})
afterEach(() => wrapper.unmount())
const select = id => wrapper.findComponent(Dropdown).vm.$emit('command', id)

describe('theme selector feedback', () => {
  test('uses the classic theme name and reports an applied, saved selection', async () => {
    expect(wrapper.text()).toContain('经典主题')
    store.applyPreset.mockImplementation(async id => { store.appearance.preset = id; return true })
    select('workspace')
    await flushPromises()
    expect(ElMessage.success).toHaveBeenCalledWith(expect.objectContaining({ message: '已切换到 经典主题' }))
  })

  test('reports CSS failure without claiming a local switch took place', async () => {
    store.applyPreset.mockResolvedValue(false)
    select('workspace')
    await flushPromises()
    expect(ElMessage.error).toHaveBeenCalledWith(expect.objectContaining({ message: '未能加载 经典主题，请重试' }))
    expect(ElMessage.warning).not.toHaveBeenCalled()
  })

  test('distinguishes a server save failure after applying the theme locally', async () => {
    store.applyPreset.mockImplementation(async id => { store.appearance.preset = id; return false })
    select('workspace')
    await flushPromises()
    expect(ElMessage.warning).toHaveBeenCalledWith(expect.objectContaining({ message: '已本地切换到 经典主题，服务器同步失败' }))
  })

  test('suppresses stale results from a previous selection', async () => {
    let resolve
    store.applyPreset.mockReturnValueOnce(new Promise(accept => { resolve = accept }))
      .mockImplementationOnce(async id => { store.appearance.preset = id; return true })
    select('workspace')
    select('dark')
    await flushPromises()
    resolve(false)
    await flushPromises()
    expect(ElMessage.success).toHaveBeenCalledTimes(1)
    expect(ElMessage.warning).not.toHaveBeenCalled()
    expect(ElMessage.error).not.toHaveBeenCalled()
  })

  test('does not show feedback after the selector has unmounted', async () => {
    let resolve
    store.applyPreset.mockReturnValueOnce(new Promise(accept => { resolve = accept }))
    select('workspace')
    wrapper.unmount()
    resolve(false)
    await flushPromises()
    expect(ElMessage.error).not.toHaveBeenCalled()
    expect(ElMessage.warning).not.toHaveBeenCalled()
  })

  test('handles an unexpected switch rejection', async () => {
    store.applyPreset.mockRejectedValueOnce(new Error('unavailable'))
    select('workspace')
    await flushPromises()
    expect(ElMessage.error).toHaveBeenCalledWith(expect.objectContaining({ message: '主题切换失败，请重试' }))
  })

  test('suppresses cancelled save feedback while logout waits for the server', async () => {
    let resolve
    store.applyPreset.mockReturnValueOnce(new Promise(accept => { resolve = accept }))
    select('workspace')
    auth.isAuthenticated = false
    resolve(false)
    await flushPromises()
    expect(ElMessage.error).not.toHaveBeenCalled()
    expect(ElMessage.warning).not.toHaveBeenCalled()
  })
})
