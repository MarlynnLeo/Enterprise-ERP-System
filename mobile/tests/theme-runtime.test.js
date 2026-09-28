import { beforeEach, describe, expect, test, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import api from '@/api'

vi.mock('@/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

const deferred = () => {
  let resolve, reject
  const promise = new Promise((accept, decline) => { resolve = accept; reject = decline })
  return { promise, resolve, reject }
}

describe('mobile theme runtime', () => {
  let themeModule
  beforeEach(async () => {
    vi.resetModules()
    vi.resetAllMocks()
    localStorage.clear()
    document.documentElement.removeAttribute('style')
    document.documentElement.removeAttribute('data-theme')
    api.post.mockResolvedValue({})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    themeModule = await import('@/composables/useTheme')
    themeModule.initTheme()
  })

  test('uses the workspace palette color for state, DOM, cache and server settings', async () => {
    const theme = themeModule.useTheme()
    expect(await theme.setTheme('workspace')).toBe(true)
    expect(theme.currentTheme.value.preview.primary).toBe('#4263EB')
    expect(document.documentElement.dataset.theme).toBe('workspace')
    expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#4263EB')
    expect(JSON.parse(localStorage.getItem('theme_settings')).primaryColor).toBe('#4263EB')
    expect(api.post).toHaveBeenCalledWith('/auth/theme', {
      preset: 'workspace', theme: 'light', primaryColor: '#4263EB', fontSize: 14
    }, { signal: expect.any(AbortSignal) })
  })

  test('initializes and switches when storage access throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    vi.resetModules()
    themeModule = await import('@/composables/useTheme')
    expect(() => themeModule.initTheme()).not.toThrow()
    expect(await themeModule.useTheme().setTheme('workspace')).toBe(true)
    expect(document.documentElement.dataset.theme).toBe('workspace')
  })

  test('keeps the latest choice when an older server read finishes later', async () => {
    const response = deferred()
    api.get.mockReturnValueOnce(response.promise)
    const read = themeModule.loadThemeFromServer()
    await flushPromises()
    await themeModule.useTheme().setTheme('workspace')
    response.resolve({ data: { data: { preset: 'dark' } } })
    expect(await read).toBe(false)
    expect(themeModule.useTheme().currentThemeName.value).toBe('workspace')
  })

  test('serializes account writes without delaying the visual switch', async () => {
    const firstResponse = deferred()
    api.post.mockReturnValueOnce(firstResponse.promise)
    const theme = themeModule.useTheme()
    const first = theme.setTheme('workspace')
    await flushPromises()
    const second = theme.setTheme('dark')
    await flushPromises()
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(api.post).toHaveBeenCalledTimes(1)
    firstResponse.resolve({})
    await Promise.all([first, second])
    expect(api.post.mock.calls.map(([, settings]) => settings.preset)).toEqual(['workspace', 'dark'])
  })

  test('ignores responses and pending saves from an ended account session', async () => {
    const response = deferred()
    api.get.mockReturnValueOnce(response.promise)
    const read = themeModule.loadThemeFromServer()
    await flushPromises()
    const firstSave = deferred()
    api.post.mockReturnValueOnce(firstSave.promise)
    const first = themeModule.useTheme().setTheme('workspace')
    await flushPromises()
    const second = themeModule.useTheme().setTheme('dark')
    themeModule.resetThemeForSession()
    response.resolve({ data: { preset: 'premium' } })
    firstSave.resolve({})
    expect(await read).toBe(false)
    expect(await first).toBe(false)
    expect(await second).toBe(false)
    expect(api.post).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('theme_settings')).toBeNull()
    expect(api.post.mock.calls[0][2].signal.aborted).toBe(true)
    expect(api.get.mock.calls[0][1].signal.aborted).toBe(true)
    expect(themeModule.useTheme().currentThemeName.value).toBe('kacon')
    expect(document.documentElement.dataset.theme).toBe('kacon')
  })

  test('new-account preferences load independently of a canceled old-account save', async () => {
    const oldSave = deferred()
    api.post.mockReturnValueOnce(oldSave.promise)
    const update = themeModule.useTheme().setTheme('dark', { settings: { primaryColor: '#123456', fontSize: 18 } })
    await flushPromises()
    themeModule.resetThemeForSession()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#15803D')
    expect(document.documentElement.style.getPropertyValue('--font-size-base')).toBe('14px')
    api.get.mockResolvedValueOnce({ data: { preset: 'workspace' } })
    expect(await themeModule.loadThemeFromServer()).toBe(true)
    oldSave.resolve({})
    expect(await update).toBe(false)
    expect(themeModule.useTheme().currentThemeName.value).toBe('workspace')
  })

  test('restores the classic theme and normalizes a shorthand color from local cache', async () => {
    localStorage.setItem('theme_settings', JSON.stringify({ preset: 'workspace', primaryColor: '#abc', fontSize: 16 }))
    themeModule.initTheme()
    expect(themeModule.useTheme().currentThemeName.value).toBe('workspace')
    expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#AABBCC')
    expect(document.documentElement.style.getPropertyValue('--font-size-base')).toBe('16px')
  })

  test.each(['   ', [], [16], {}])('recovers malformed cached font size %p', (fontSize) => {
    localStorage.setItem('theme_settings', JSON.stringify({ preset: 'workspace', fontSize }))
    themeModule.initTheme()
    expect(document.documentElement.style.getPropertyValue('--font-size-base')).toBe('14px')
  })

  test.each(['constructor', 'unknown', ['workspace']])('does not switch or save an unregistered selection %p', async (preset) => {
    await themeModule.useTheme().setTheme('workspace', { syncServer: false })
    expect(await themeModule.useTheme().setTheme(preset)).toBe(false)
    expect(themeModule.useTheme().currentThemeName.value).toBe('workspace')
    expect(api.post).not.toHaveBeenCalled()
  })

  test('coalesces per-account loads and reuses only a successful result', async () => {
    const response = deferred()
    api.get.mockReturnValueOnce(response.promise)
    const first = themeModule.loadThemeForUser(7)
    const second = themeModule.loadThemeForUser(7)
    await flushPromises()
    expect(api.get).toHaveBeenCalledTimes(1)
    response.resolve({ data: { preset: 'workspace' } })
    expect(await first).toBe(true)
    expect(await second).toBe(true)
    expect(await themeModule.loadThemeForUser(7)).toBe(true)
    expect(api.get).toHaveBeenCalledTimes(1)
  })

  test('retries a failed account load instead of setting a global loaded flag', async () => {
    api.get.mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ data: { preset: 'workspace' } })
    expect(await themeModule.loadThemeForUser(7)).toBe(false)
    expect(await themeModule.loadThemeForUser(7)).toBe(true)
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  test('uses the preset mode and preserves server custom colors and font size', async () => {
    api.get.mockResolvedValueOnce({ data: { preset: 'tech', theme: 'light', primaryColor: '#112233', fontSize: 16 } })
    expect(await themeModule.loadThemeFromServer()).toBe(true)
    expect(themeModule.useTheme().isDark.value).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#112233')
    expect(document.documentElement.style.getPropertyValue('--font-size-base')).toBe('16px')
    expect(document.documentElement.style.getPropertyValue('--color-on-primary')).toBe('#FFFFFF')
  })

  test('uses dark button text for a light custom classic-theme color', async () => {
    await themeModule.useTheme().setTheme('workspace', { settings: { primaryColor: '#fff' } })
    expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#FFFFFF')
    expect(document.documentElement.style.getPropertyValue('--color-on-primary')).toBe('#000000')
  })
})
