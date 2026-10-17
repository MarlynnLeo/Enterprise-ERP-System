import { beforeEach, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { getPreferredLanguage } from '@/utils/language'

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  setActivePinia(createPinia())
})

test('application locale initialization survives blocked browser storage', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError') })
  const { default: i18n } = await import('@/locales')
  const { useLanguageStore } = await import('@/stores/language')
  const store = useLanguageStore()
  await expect(store.initLanguage()).resolves.toBe(true)
  expect(store.currentLanguage).toBe(i18n.global.locale.value)
  await expect(store.setLanguage('ko')).resolves.toBe(true)
  expect(document.documentElement.lang).toBe('ko')
})

test('corrupt saved language falls back to a supported browser preference', () => {
  localStorage.setItem('language', 'unsupported')
  expect(['zh-CN', 'en', 'ko']).toContain(getPreferredLanguage())
})

test('a late locale import cannot undo the most recent selection', async () => {
  const { useLanguageStore } = await import('@/stores/language')
  const store = useLanguageStore()
  const first = store.setLanguage('en')
  const latest = store.setLanguage('zh-CN')
  expect(await latest).toBe(true)
  expect(await first).toBe(false)
  expect(store.currentLanguage).toBe('zh-CN')
  expect(store.elementLocale.name).toBe('zh-cn')
  expect(localStorage.getItem('language')).toBe('zh-CN')
})
