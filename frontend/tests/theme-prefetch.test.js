import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const loaded = vi.hoisted(() => ({ tech: vi.fn(), dark: vi.fn() }))

let performanceMode
let themeLoader
let idleTasks
let connection
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.doMock('@/assets/themes/pc/tech.css', () => { loaded.tech(); return {} })
  vi.doMock('@/assets/themes/pc/dark.css', () => { loaded.dark(); return {} })
  localStorage.clear()
  idleTasks = []
  connection = new EventTarget()
  connection.saveData = false
  vi.stubGlobal('navigator', { hardwareConcurrency: 8, deviceMemory: 8, connection })
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
  vi.stubGlobal('requestIdleCallback', vi.fn(callback => {
    idleTasks.push(callback)
    return idleTasks.length
  }))
  performanceMode = await import('@/utils/performanceMode')
  themeLoader = await import('@/utils/themeLoader')
  performanceMode.initPerformanceMode()
})

afterEach(() => {
  performanceMode.disposePerformanceMode()
  localStorage.clear()
  document.documentElement.className = ''
  vi.unstubAllGlobals()
})

describe('optional theme prefetching', () => {
  test('coalesces repeated hover requests until the browser is idle', async () => {
    themeLoader.prefetchThemeCss('tech')
    themeLoader.prefetchThemeCss('tech')
    themeLoader.prefetchThemeCss('tech')
    expect(idleTasks).toHaveLength(1)
    expect(loaded.tech).not.toHaveBeenCalled()
    idleTasks.shift()()
    await vi.dynamicImportSettled()
    expect(loaded.tech).toHaveBeenCalledOnce()
    themeLoader.prefetchThemeCss('tech')
    expect(idleTasks).toHaveLength(0)
  })

  test('skips queued downloads after data saving is enabled and allows a later retry', async () => {
    themeLoader.prefetchThemeCss('tech')
    connection.saveData = true
    connection.dispatchEvent(new Event('change'))
    idleTasks.shift()()
    await vi.dynamicImportSettled()
    expect(loaded.tech).not.toHaveBeenCalled()
    themeLoader.prefetchThemeCss('dark')
    expect(idleTasks).toHaveLength(0)

    connection.saveData = false
    connection.dispatchEvent(new Event('change'))
    themeLoader.prefetchThemeCss('tech')
    expect(idleTasks).toHaveLength(1)
    idleTasks.shift()()
    await vi.dynamicImportSettled()
    expect(loaded.tech).toHaveBeenCalledOnce()
  })

  test('does not prefetch on a low-end device but still loads a user-selected palette', async () => {
    localStorage.setItem('erp_low_end_mode', 'true')
    performanceMode.initPerformanceMode()
    themeLoader.prefetchThemeCss('dark')
    expect(idleTasks).toHaveLength(0)
    expect(loaded.dark).not.toHaveBeenCalled()
    expect(await themeLoader.ensureThemeCss('dark')).toBe('dark')
    expect(loaded.dark).toHaveBeenCalledOnce()
  })

  test('does not enqueue invalid or already loaded presets', () => {
    themeLoader.prefetchThemeCss('missing')
    themeLoader.prefetchThemeCss('kacon')
    expect(idleTasks).toHaveLength(0)
  })

  test('a queued hover cannot download CSS or restart observers after application teardown', async () => {
    themeLoader.prefetchThemeCss('tech')
    expect(idleTasks).toHaveLength(1)
    performanceMode.disposePerformanceMode()
    const mediaReads = window.matchMedia.mock.calls.length
    idleTasks.shift()()
    await vi.dynamicImportSettled()
    expect(loaded.tech).not.toHaveBeenCalled()
    expect(window.matchMedia).toHaveBeenCalledTimes(mediaReads)
    expect(performanceMode.shouldPrefetchThemes()).toBe(false)
  })
})
