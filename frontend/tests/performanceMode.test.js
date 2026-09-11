import { afterEach, describe, expect, test, vi } from 'vitest'
import { initPerformanceMode } from '../src/utils/performanceMode.js'

describe('performance mode startup', () => {
  afterEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove(
      'perf-low-end',
      'perf-reduced-motion',
      'perf-save-data'
    )
    delete window.__ERP_PERF__
    vi.restoreAllMocks()
  })

  test('does not initialize a canvas or WebGL context on the startup path', () => {
    const createElement = vi.spyOn(document, 'createElement')

    initPerformanceMode()

    expect(createElement).not.toHaveBeenCalledWith('canvas')
    expect(window.__ERP_PERF__).toEqual(expect.objectContaining({
      lowEnd: expect.any(Boolean),
      reducedMotion: expect.any(Boolean),
      saveData: expect.any(Boolean)
    }))
  })

  test('honors the explicit low-end mode without hardware probing', () => {
    localStorage.setItem('erp_low_end_mode', 'true')

    initPerformanceMode()

    expect(document.documentElement.classList.contains('perf-low-end')).toBe(true)
    expect(window.__ERP_PERF__.lowEnd).toBe(true)
  })
})
