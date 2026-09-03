import { describe, expect, test, vi } from 'vitest'
import {
  createReleaseReloader,
  fetchReleaseVersion,
  isReleaseAssetError,
  setupReleaseRecovery
} from '@/utils/releaseRecovery'

describe('release recovery', () => {
  test('recognizes stale Vite chunk and stylesheet failures', () => {
    expect(isReleaseAssetError(new TypeError(
      'Failed to fetch dynamically imported module: /assets/Page-old.js'
    ))).toBe(true)
    expect(isReleaseAssetError('Unable to preload CSS for /assets/Page-old.css')).toBe(true)
    expect(isReleaseAssetError('ordinary validation error')).toBe(false)
  })

  test('reloads once within the cooldown window', () => {
    const values = new Map()
    const storage = {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value)
    }
    const reload = vi.fn()
    let timestamp = 100_000
    const requestReload = createReleaseReloader({
      storage,
      reload,
      now: () => timestamp,
      cooldownMs: 60_000
    })

    expect(requestReload()).toBe(true)
    expect(requestReload()).toBe(false)
    timestamp += 60_000
    expect(requestReload()).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  test('fetches the current build id without using browser cache', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ buildId: 'release-2' })
    })

    await expect(fetchReleaseVersion({ fetchImpl, cacheBust: 123 })).resolves.toBe('release-2')
    expect(fetchImpl).toHaveBeenCalledWith('/version.json?v=123', {
      cache: 'no-store',
      credentials: 'same-origin'
    })
  })

  test('reloads a visible page when focus detects a newer release', async () => {
    const windowListeners = new Map()
    const documentListeners = new Map()
    const reload = vi.fn()
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ buildId: 'release-new' })
    })
    const windowRef = {
      sessionStorage: window.sessionStorage,
      location: { reload },
      addEventListener: (type, handler) => windowListeners.set(type, handler),
      removeEventListener: vi.fn(),
      setInterval: vi.fn(() => 7),
      clearInterval: vi.fn()
    }
    const documentRef = {
      visibilityState: 'visible',
      addEventListener: (type, handler) => documentListeners.set(type, handler),
      removeEventListener: vi.fn()
    }

    const cleanup = setupReleaseRecovery({
      buildId: 'release-old',
      windowRef,
      documentRef,
      fetchImpl
    })

    await windowListeners.get('focus')()

    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(reload).toHaveBeenCalledOnce()
    expect(documentListeners.has('visibilitychange')).toBe(true)

    cleanup()
    expect(windowRef.clearInterval).toHaveBeenCalledWith(7)
  })
})
