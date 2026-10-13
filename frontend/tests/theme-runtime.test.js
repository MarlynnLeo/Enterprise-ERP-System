import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { useThemeStore } from '@/stores/theme'
import { userApi } from '@/api/user'
import { ensureThemeCss } from '@/utils/themeLoader'
import { DEFAULT_THEME_SETTINGS, getThemePreset, normalizeThemeAppearance } from '@/config/themePresets'

vi.mock('@/api/user', () => ({ userApi: { getTheme: vi.fn(), updateTheme: vi.fn() } }))
vi.mock('@/utils/themeLoader', () => ({ ensureThemeCss: vi.fn() }))
vi.mock('@/utils/logger', () => ({ default: { error: vi.fn(), warn: vi.fn() } }))

const deferred = () => {
  let resolve, reject
  const promise = new Promise((accept, decline) => { resolve = accept; reject = decline })
  return { promise, resolve, reject }
}

describe('theme runtime', () => {
  let store
  beforeEach(async () => {
    vi.resetAllMocks()
    localStorage.clear()
    document.documentElement.removeAttribute('style')
    document.documentElement.removeAttribute('data-theme')
    setActivePinia(createPinia())
    ensureThemeCss.mockResolvedValue('kacon')
    userApi.updateTheme.mockResolvedValue({})
    store = useThemeStore()
    await store.initTheme()
  })

  test.each([
    ['preset defaults', DEFAULT_THEME_SETTINGS],
    ['custom color and font', normalizeThemeAppearance({ preset: 'dark', primaryColor: '#AABBCC', fontSize: 18 })]
  ])('replays the cached account theme without root mutations (%s)', async (_label, settings) => {
    await store.updateAppearance(settings)
    const html = document.documentElement
    const mutations = []
    const observer = new MutationObserver((records) => mutations.push(...records))
    observer.observe(html, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] })
    const setStyle = vi.spyOn(html.style, 'setProperty')
    const removeStyle = vi.spyOn(html.style, 'removeProperty')
    const setAttribute = vi.spyOn(html, 'setAttribute')
    userApi.getTheme.mockResolvedValueOnce({ data: {
      ...settings, primaryColor: settings.primaryColor.toLowerCase(), fontSize: String(settings.fontSize)
    } })
    try {
      expect(await store.loadThemeForUser(7)).toBe(true)
      await flushPromises()
      expect(mutations).toHaveLength(0)
      expect(setStyle).not.toHaveBeenCalled()
      expect(removeStyle).not.toHaveBeenCalled()
      expect(setAttribute).not.toHaveBeenCalled()
      expect(ensureThemeCss).toHaveBeenLastCalledWith(settings.preset)
      expect(store.appearance).toEqual(normalizeThemeAppearance(settings))
      expect(store.isLoaded).toBe(true)
      expect(store.loadedForUser).toBe(7)
    } finally {
      observer.disconnect()
    }
  })

  test('applies cached settings to an unthemed document after startup CSS is ready', async () => {
    localStorage.setItem('theme_settings', JSON.stringify({ preset: 'dark', primaryColor: '#abc', fontSize: 18 }))
    const html = document.documentElement
    html.classList.remove('light', 'dark')
    html.removeAttribute('style')
    html.removeAttribute('data-theme')
    setActivePinia(createPinia())
    store = useThemeStore()
    const css = deferred()
    ensureThemeCss.mockReturnValueOnce(css.promise)
    const startup = store.initTheme()
    expect(html.hasAttribute('data-theme')).toBe(false)
    expect(html.style.getPropertyValue('--font-size-base')).toBe('')
    css.resolve('dark')
    await startup
    expect(html.dataset.theme).toBe('dark')
    expect(html.classList.contains('dark')).toBe(true)
    expect(html.style.getPropertyValue('--font-size-base')).toBe('18px')
    expect(html.style.getPropertyValue('--color-primary')).toBe('#AABBCC')
  })

  test('repairs externally changed theme attributes when the account returns unchanged settings', async () => {
    const settings = normalizeThemeAppearance({ preset: 'dark', primaryColor: '#123456', fontSize: 18 })
    await store.updateAppearance(settings)
    const html = document.documentElement
    html.classList.remove('dark')
    html.classList.add('light', 'unrelated-theme-test')
    html.setAttribute('data-theme', 'workspace')
    html.style.setProperty('--font-size-base', '12px')
    html.style.setProperty('--color-primary', settings.primaryColor, 'important')
    html.style.setProperty('--color-on-success', '#000000', 'important')
    html.style.setProperty('--unrelated-theme-test', 'retained')
    userApi.getTheme.mockResolvedValueOnce({ data: settings })
    try {
      expect(await store.loadThemeFromServer()).toBe(true)
      expect(html.dataset.theme).toBe('dark')
      expect(html.classList.contains('dark')).toBe(true)
      expect(html.classList.contains('light')).toBe(false)
      expect(html.classList.contains('unrelated-theme-test')).toBe(true)
      expect(html.style.getPropertyValue('--font-size-base')).toBe('18px')
      expect(html.style.getPropertyValue('--color-primary')).toBe(settings.primaryColor)
      expect(html.style.getPropertyPriority('--color-primary')).toBe('')
      expect(html.style.getPropertyValue('--color-on-success')).toBe('#FFFFFF')
      expect(html.style.getPropertyPriority('--color-on-success')).toBe('')
      expect(html.style.getPropertyValue('--unrelated-theme-test')).toBe('retained')
    } finally {
      html.classList.remove('unrelated-theme-test')
    }
  })

  test('changes font and custom color without rewriting unchanged palette attributes', async () => {
    await store.applyPreset('dark')
    const html = document.documentElement
    const setAttribute = vi.spyOn(html, 'setAttribute')
    const toggleClass = vi.spyOn(html.classList, 'toggle')
    const setStyle = vi.spyOn(html.style, 'setProperty')
    expect(await store.updateAppearance({ fontSize: 18 })).toBe(true)
    expect(html.style.getPropertyValue('--font-size-base')).toBe('18px')
    expect(html.style.getPropertyValue('--el-font-size-base')).toBe('18px')
    expect(setStyle.mock.calls.map(([key]) => key)).toEqual(['--font-size-base', '--el-font-size-base'])
    setStyle.mockClear()
    expect(await store.updateAppearance({ primaryColor: '#123456' })).toBe(true)
    expect(html.style.getPropertyValue('--color-primary')).toBe('#123456')
    expect(html.style.getPropertyValue('--el-color-primary')).toBe('#123456')
    expect(html.style.getPropertyValue('--color-primary-light-9')).toBeTruthy()
    expect(setStyle.mock.calls.map(([key]) => key)).not.toContain('--font-size-base')
    expect(setAttribute).not.toHaveBeenCalled()
    expect(toggleClass).not.toHaveBeenCalled()
    expect(await store.applyPreset('workspace')).toBe(true)
    expect(html.dataset.theme).toBe('workspace')
    expect(html.classList.contains('light')).toBe(true)
    expect(html.classList.contains('dark')).toBe(false)
    expect(html.style.getPropertyValue('--color-primary')).toBe('')
    expect(html.style.getPropertyValue('--color-primary-light-9')).toBe('')
  })

  test('restores preset ownership of empty inline color declarations', async () => {
    const html = document.documentElement
    const emptyProperties = [
      '--color-primary', '--el-color-primary', '--color-on-primary',
      '--color-primary-light-9', '--el-color-primary-light-9'
    ]
    for (const key of emptyProperties) html.style.setProperty(key, 'empty-declaration')
    html.style.setProperty('--unrelated-theme-test', 'retained')
    // jsdom drops whitespace-only declarations; browsers retain them but expose
    // an empty value. Preserve real declaration membership and emulate that read.
    const getPropertyValue = html.style.getPropertyValue.bind(html.style)
    vi.spyOn(html.style, 'getPropertyValue').mockImplementation((key) =>
      emptyProperties.includes(key) ? '' : getPropertyValue(key)
    )
    for (const key of emptyProperties) expect(Array.from(html.style)).toContain(key)

    userApi.getTheme.mockResolvedValueOnce({ data: DEFAULT_THEME_SETTINGS })
    expect(await store.loadThemeFromServer()).toBe(true)
    for (const key of emptyProperties) {
      expect(Array.from(html.style)).not.toContain(key)
      expect(html.style.getPropertyPriority(key)).toBe('')
    }
    expect(html.style.getPropertyValue('--unrelated-theme-test')).toBe('retained')
    expect(html.dataset.theme).toBe(DEFAULT_THEME_SETTINGS.preset)
  })

  test('reads all semantic backgrounds before writing their contrast colors', async () => {
    const html = document.documentElement
    const textTokens = ['--color-on-success', '--color-on-warning', '--color-on-danger', '--color-on-info']
    const phases = []
    const readBackground = vi.fn(() => {
      phases.push('read')
      return '#FFFFFF'
    })
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ getPropertyValue: readBackground })
    const setProperty = html.style.setProperty.bind(html.style)
    vi.spyOn(html.style, 'setProperty').mockImplementation((key, value, priority) => {
      if (textTokens.includes(key)) phases.push('write')
      return setProperty(key, value, priority)
    })
    expect(await store.applyPreset('dark')).toBe(true)
    expect(readBackground).toHaveBeenCalledTimes(4)
    expect(phases.indexOf('write')).toBeGreaterThan(phases.lastIndexOf('read'))
    for (const token of textTokens) expect(html.style.getPropertyValue(token)).toBe('#000000')
  })

  test('keeps state and DOM unchanged until CSS loads and ignores an older selection', async () => {
    const first = deferred()
    const second = deferred()
    ensureThemeCss.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const older = store.applyPreset('workspace')
    const newer = store.applyPreset('dark')
    expect(store.appearance.preset).toBe('kacon')
    expect(document.documentElement.dataset.theme).toBe('kacon')
    second.resolve('dark')
    expect(await newer).toBe(true)
    first.resolve('workspace')
    expect(await older).toBe(false)
    expect(store.appearance.preset).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(userApi.updateTheme).toHaveBeenCalledTimes(1)
    expect(JSON.parse(localStorage.getItem('theme_settings')).preset).toBe('dark')
  })

  test('does not commit or persist a palette whose CSS failed', async () => {
    ensureThemeCss.mockRejectedValueOnce(new Error('offline'))
    expect(await store.applyPreset('workspace')).toBe(false)
    expect(store.appearance).toEqual(DEFAULT_THEME_SETTINGS)
    expect(document.documentElement.dataset.theme).toBe('kacon')
    expect(userApi.updateTheme).not.toHaveBeenCalled()
  })

  test('falls back to the bundled default when cached startup CSS is unavailable', async () => {
    localStorage.setItem('theme_settings', JSON.stringify({ preset: 'workspace' }))
    setActivePinia(createPinia())
    store = useThemeStore()
    ensureThemeCss.mockRejectedValueOnce(new Error('offline'))
    await store.initTheme()
    expect(store.appearance.preset).toBe('kacon')
    expect(document.documentElement.dataset.theme).toBe('kacon')
  })

  test('serializes server writes so a slow older save cannot overwrite the latest choice', async () => {
    const firstSave = deferred()
    userApi.updateTheme.mockReturnValueOnce(firstSave.promise)
    const first = store.applyPreset('workspace')
    await flushPromises()
    const second = store.applyPreset('dark')
    await flushPromises()
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(userApi.updateTheme).toHaveBeenCalledTimes(1)
    firstSave.resolve({})
    await Promise.all([first, second])
    expect(userApi.updateTheme.mock.calls.map(([settings]) => settings.preset)).toEqual(['workspace', 'dark'])
  })

  test.each(['resolve', 'reject'])('preserves the account theme when startup CSS finishes late (%s)', async (outcome) => {
    localStorage.setItem('theme_settings', JSON.stringify({ preset: 'workspace' }))
    setActivePinia(createPinia())
    store = useThemeStore()
    const startupCss = deferred()
    ensureThemeCss.mockReturnValueOnce(startupCss.promise)
    const startup = store.initTheme()
    userApi.getTheme.mockResolvedValueOnce({ data: { preset: 'dark' } })
    expect(await store.loadThemeForUser(7)).toBe(true)
    if (outcome === 'resolve') startupCss.resolve('workspace')
    else startupCss.reject(new Error('offline'))
    await startup
    expect(store.appearance.preset).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(JSON.parse(localStorage.getItem('theme_settings')).preset).toBe('dark')
    expect(store.loadedForUser).toBe(7)
  })

  test('ignores a server read which started before the user selected a theme', async () => {
    const response = deferred()
    userApi.getTheme.mockReturnValueOnce(response.promise)
    const read = store.loadThemeFromServer()
    await flushPromises()
    await store.applyPreset('workspace')
    response.resolve({ data: { preset: 'dark' } })
    expect(await read).toBe(false)
    expect(store.appearance.preset).toBe('workspace')
  })

  test('a failed server save retains the active theme and permits a later save', async () => {
    userApi.updateTheme.mockRejectedValueOnce(new Error('offline'))
    expect(await store.applyPreset('workspace')).toBe(false)
    expect(store.appearance.preset).toBe('workspace')
    expect(await store.loadThemeFromServer()).toBe(false)
    expect(userApi.getTheme).not.toHaveBeenCalled()
    expect(await store.applyPreset('dark')).toBe(true)
  })

  test('drops old account reads and queued writes when the session resets', async () => {
    const readResponse = deferred()
    userApi.getTheme.mockReturnValueOnce(readResponse.promise)
    const read = store.loadThemeFromServer()
    await flushPromises()
    const firstSave = deferred()
    userApi.updateTheme.mockReturnValueOnce(firstSave.promise)
    const first = store.applyPreset('workspace')
    await flushPromises()
    const second = store.applyPreset('dark')
    await flushPromises()
    store.loadedForUser = 7
    store.resetForSession()
    firstSave.resolve({})
    readResponse.resolve({ data: { preset: 'premium' } })
    expect(await read).toBe(false)
    expect(await first).toBe(false)
    expect(await second).toBe(false)
    expect(store.loadedForUser).toBeNull()
    expect(store.isLoaded).toBe(false)
    expect(userApi.updateTheme).toHaveBeenCalledTimes(1)
    expect(userApi.updateTheme.mock.calls[0][1].signal.aborted).toBe(true)
    expect(userApi.getTheme.mock.calls[0][0].signal.aborted).toBe(true)
    expect(store.appearance).toEqual(DEFAULT_THEME_SETTINGS)
    expect(document.documentElement.dataset.theme).toBe('kacon')
    expect(localStorage.getItem('theme_settings')).toBeNull()
  })

  test('a new account can load without waiting for an unfinished old-account save', async () => {
    const oldSave = deferred()
    userApi.updateTheme.mockReturnValueOnce(oldSave.promise)
    const update = store.updateAppearance({ preset: 'dark', primaryColor: '#123456', fontSize: 18 })
    await flushPromises()
    expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#123456')
    store.resetForSession()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--color-primary-light-9')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--font-size-base')).toBe('14px')
    userApi.getTheme.mockResolvedValueOnce({ data: { preset: 'workspace' } })
    expect(await store.loadThemeFromServer()).toBe(true)
    oldSave.resolve({})
    expect(await update).toBe(false)
    expect(store.appearance.preset).toBe('workspace')
  })

  test('restores the same account cached classic theme across a reload', async () => {
    await store.updateAppearance({ preset: 'workspace', primaryColor: '#abc', fontSize: 16 })
    setActivePinia(createPinia())
    const reloaded = useThemeStore()
    await reloaded.initTheme()
    expect(reloaded.appearance).toMatchObject({ preset: 'workspace', primaryColor: '#AABBCC', fontSize: 16 })
    expect(document.documentElement.dataset.theme).toBe('workspace')
  })

  test('coalesces account theme reads and only marks a successful load', async () => {
    const response = deferred()
    userApi.getTheme.mockReturnValueOnce(response.promise)
    const first = store.loadThemeForUser(7)
    const second = store.loadThemeForUser(7)
    await flushPromises()
    expect(userApi.getTheme).toHaveBeenCalledTimes(1)
    expect(store.loadedForUser).toBeNull()
    response.resolve({ data: { preset: 'workspace' } })
    expect(await first).toBe(true)
    expect(await second).toBe(true)
    expect(await store.loadThemeForUser(7)).toBe(true)
    expect(store.loadedForUser).toBe(7)
    expect(userApi.getTheme).toHaveBeenCalledTimes(1)
  })

  test('retries a failed account load on the next navigation', async () => {
    userApi.getTheme.mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ data: { preset: 'workspace' } })
    expect(await store.loadThemeForUser(7)).toBe(false)
    expect(store.loadedForUser).toBeNull()
    expect(await store.loadThemeForUser(7)).toBe(true)
    expect(store.loadedForUser).toBe(7)
    expect(userApi.getTheme).toHaveBeenCalledTimes(2)
  })

  test('leaves predefined color ramps in CSS and removes custom overrides on the next preset', async () => {
    await store.updateAppearance({ primaryColor: '#AABBCC' })
    expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#AABBCC')
    expect(document.documentElement.style.getPropertyValue('--color-primary-light-9')).toBeTruthy()
    await store.applyPreset('premium')
    expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--color-primary-light-9')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--el-color-primary-light-9')).toBe('')
  })

  test('continues applying and syncing when browser storage is disabled', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('disabled') })
    expect(await store.applyPreset('workspace')).toBe(true)
    expect(document.documentElement.dataset.theme).toBe('workspace')
  })

  test('rejects inherited object keys as theme IDs and normalizes corrupt local settings', async () => {
    expect(getThemePreset('constructor').id).toBe('kacon')
    expect(getThemePreset('__proto__').id).toBe('kacon')
    expect(normalizeThemeAppearance(null)).toEqual(DEFAULT_THEME_SETTINGS)
    expect(normalizeThemeAppearance([])).toEqual(DEFAULT_THEME_SETTINGS)
    expect(await store.applyPreset('constructor')).toBe(false)
    expect(userApi.updateTheme).not.toHaveBeenCalled()
  })

  test.each([null, false, true, '', '   ', [], [16], {}, 'invalid', Number.NaN])('normalizes invalid font size %s to the shared default', (fontSize) => {
    expect(normalizeThemeAppearance({ fontSize }).fontSize).toBe(DEFAULT_THEME_SETTINGS.fontSize)
  })
})
