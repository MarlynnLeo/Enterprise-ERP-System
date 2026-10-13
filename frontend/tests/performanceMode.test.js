import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  disposePerformanceMode,
  getPerformanceMode,
  initPerformanceMode,
  shouldPrefetchThemes
} from '../src/utils/performanceMode.js'

function createMediaQuery(legacy = false) {
  const listeners = new Set()
  const media = {
    matches: false,
    change(matches) {
      media.matches = matches
      for (const listener of listeners) listener({ matches })
    }
  }
  if (legacy) {
    media.addListener = vi.fn(listener => listeners.add(listener))
    media.removeListener = vi.fn(listener => listeners.delete(listener))
  } else {
    media.addEventListener = vi.fn((_type, listener) => listeners.add(listener))
    media.removeEventListener = vi.fn((_type, listener) => listeners.delete(listener))
  }
  return media
}

let mediaQueries
let connection
beforeEach(() => {
  disposePerformanceMode()
  localStorage.clear()
  document.documentElement.className = 'light'
  mediaQueries = {
    '(prefers-reduced-motion: reduce)': createMediaQuery(),
    '(update: slow)': createMediaQuery()
  }
  connection = new EventTarget()
  connection.saveData = false
  vi.stubGlobal('navigator', { hardwareConcurrency: 8, deviceMemory: 8, connection })
  vi.stubGlobal('matchMedia', vi.fn(query => mediaQueries[query]))
})

afterEach(() => {
  disposePerformanceMode()
  localStorage.clear()
  document.documentElement.className = ''
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('shared performance mode', () => {
  test('initializes without creating a canvas or probing graphics hardware', () => {
    const createElement = vi.spyOn(document, 'createElement')
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')

    initPerformanceMode()

    expect(createElement).not.toHaveBeenCalledWith('canvas')
    expect(getContext).not.toHaveBeenCalled()
    expect(getPerformanceMode()).toEqual({ lowEnd: false, reducedMotion: false, saveData: false })
    expect(Object.isFrozen(getPerformanceMode())).toBe(true)
  })

  test.each([
    [4, 8, true],
    [8, 4, true],
    [8, undefined, false],
    [undefined, undefined, false],
    [0, null, false],
    [8, 8, false]
  ])('uses available positive device metadata (cores=%s, memory=%s)', (cores, memory, lowEnd) => {
    navigator.hardwareConcurrency = cores
    navigator.deviceMemory = memory
    initPerformanceMode()

    expect(getPerformanceMode().lowEnd).toBe(lowEnd)
    expect(document.documentElement.classList.contains('perf-low-end')).toBe(lowEnd)
  })

  test('refreshes an explicit same-tab mode change while preserving other root classes', () => {
    initPerformanceMode()
    localStorage.setItem('erp_low_end_mode', 'true')
    initPerformanceMode()
    expect(getPerformanceMode().lowEnd).toBe(true)
    expect(document.documentElement.classList.contains('perf-low-end')).toBe(true)
    expect(document.documentElement.classList.contains('light')).toBe(true)

    localStorage.removeItem('erp_low_end_mode')
    initPerformanceMode()
    expect(getPerformanceMode().lowEnd).toBe(false)
    expect(document.documentElement.classList.contains('perf-low-end')).toBe(false)
  })

  test('initializes only one observer set and does not rewrite unchanged classes', async () => {
    initPerformanceMode()
    const snapshot = getPerformanceMode()
    const mutations = []
    const observer = new MutationObserver(records => mutations.push(...records))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    try {
      initPerformanceMode()
      initPerformanceMode()
      await Promise.resolve()
      expect(getPerformanceMode()).toBe(snapshot)
      expect(mutations).toHaveLength(0)
      for (const media of Object.values(mediaQueries)) {
        expect(media.addEventListener).toHaveBeenCalledTimes(1)
      }
    } finally {
      observer.disconnect()
    }
  })

  test('updates the snapshot and DOM together for reduced motion', () => {
    initPerformanceMode()
    const previous = getPerformanceMode()
    mediaQueries['(prefers-reduced-motion: reduce)'].change(true)

    const reduced = getPerformanceMode()
    expect(reduced).not.toBe(previous)
    expect(reduced).toEqual({ lowEnd: false, reducedMotion: true, saveData: false })
    expect(document.documentElement.classList.contains('perf-reduced-motion')).toBe(true)
    expect(shouldPrefetchThemes()).toBe(true)
    mediaQueries['(prefers-reduced-motion: reduce)'].change(true)
    expect(getPerformanceMode()).toBe(reduced)

    mediaQueries['(prefers-reduced-motion: reduce)'].change(false)
    expect(getPerformanceMode().reducedMotion).toBe(false)
    expect(document.documentElement.classList.contains('perf-reduced-motion')).toBe(false)
  })

  test('keeps data-saving and slow-display changes in the same runtime policy', () => {
    initPerformanceMode()
    connection.saveData = true
    connection.dispatchEvent(new Event('change'))
    expect(getPerformanceMode()).toEqual({ lowEnd: true, reducedMotion: false, saveData: true })
    expect(document.documentElement.classList.contains('perf-save-data')).toBe(true)
    expect(shouldPrefetchThemes()).toBe(false)

    const dataSaving = getPerformanceMode()
    mediaQueries['(update: slow)'].change(true)
    expect(getPerformanceMode()).toBe(dataSaving)
    connection.saveData = false
    connection.dispatchEvent(new Event('change'))
    expect(getPerformanceMode()).toEqual({ lowEnd: true, reducedMotion: false, saveData: false })
    expect(shouldPrefetchThemes()).toBe(false)
    mediaQueries['(update: slow)'].change(false)
    expect(shouldPrefetchThemes()).toBe(true)
  })

  test('reacts to cross-tab preference changes and ignores unrelated storage', () => {
    initPerformanceMode()
    const previous = getPerformanceMode()
    localStorage.setItem('erp_low_end_mode', 'true')
    window.dispatchEvent(new StorageEvent('storage', { key: 'theme_settings' }))
    expect(getPerformanceMode()).toBe(previous)
    window.dispatchEvent(new StorageEvent('storage', { key: 'erp_low_end_mode' }))
    expect(getPerformanceMode().lowEnd).toBe(true)
    localStorage.clear()
    window.dispatchEvent(new StorageEvent('storage', { key: null }))
    expect(getPerformanceMode().lowEnd).toBe(false)
  })

  test('repairs removed policy classes without replacing an unchanged snapshot', () => {
    localStorage.setItem('erp_low_end_mode', 'true')
    initPerformanceMode()
    const previous = getPerformanceMode()
    document.documentElement.classList.remove('perf-low-end')
    initPerformanceMode()
    expect(document.documentElement.classList.contains('perf-low-end')).toBe(true)
    expect(getPerformanceMode()).toBe(previous)
  })

  test('supports older media-query listeners and removes them on application teardown', () => {
    mediaQueries['(prefers-reduced-motion: reduce)'] = createMediaQuery(true)
    const stop = initPerformanceMode()
    const media = mediaQueries['(prefers-reduced-motion: reduce)']
    media.change(true)
    expect(getPerformanceMode().reducedMotion).toBe(true)
    const removeConnectionListener = vi.spyOn(connection, 'removeEventListener')
    const removeWindowListener = vi.spyOn(window, 'removeEventListener')
    stop()
    stop()
    expect(media.removeListener).toHaveBeenCalledExactlyOnceWith(media.addListener.mock.calls[0][0])
    expect(removeConnectionListener).toHaveBeenCalledOnce()
    expect(removeWindowListener).toHaveBeenCalledWith('storage', expect.any(Function))
    media.change(false)
    connection.saveData = true
    connection.dispatchEvent(new Event('change'))
    window.dispatchEvent(new StorageEvent('storage', { key: 'erp_low_end_mode' }))
    expect(getPerformanceMode()).toEqual({ lowEnd: false, reducedMotion: false, saveData: false })
    expect(shouldPrefetchThemes()).toBe(false)
    expect(media.addListener).toHaveBeenCalledOnce()
  })

  test('tolerates unavailable preference APIs and blocked storage', () => {
    vi.stubGlobal('matchMedia', undefined)
    navigator.connection = undefined
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage disabled') })
    initPerformanceMode()
    expect(getPerformanceMode()).toEqual({ lowEnd: false, reducedMotion: false, saveData: false })
  })

  test('reading policy before application startup does not install global listeners', () => {
    expect(getPerformanceMode()).toEqual({ lowEnd: false, reducedMotion: false, saveData: false })
    expect(shouldPrefetchThemes()).toBe(false)
    expect(window.matchMedia).not.toHaveBeenCalled()
  })
})
