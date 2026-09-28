import { afterEach, describe, expect, test, vi } from 'vitest'
import { effectScope } from 'vue'
import { getThemeDefaultPageSize } from '@/utils/themePageSize'
import { PAGE_SIZE_OPTIONS } from '@/config/pagination'
import { parsePaginatedData } from '@/utils/responseParser'
import { normalizePaginationData } from '@/utils/helpers/typeUtils'
import { usePaginatedFetching } from '@/composables/useDataFetching'

vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { error: vi.fn() } }))

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
  localStorage.clear()
})

describe('theme pagination defaults', () => {
  test('uses the applied palette instead of stale or inaccessible persisted settings', () => {
    localStorage.setItem('theme_settings', JSON.stringify({ preset: 'workspace' }))
    document.documentElement.dataset.theme = 'kacon'
    expect(getThemeDefaultPageSize(20)).toBe(20)
    document.documentElement.dataset.theme = 'workspace'
    localStorage.setItem('theme_settings', 'invalid JSON')
    expect(getThemeDefaultPageSize()).toBe(25)
    expect(PAGE_SIZE_OPTIONS).toEqual(expect.arrayContaining([10, 20, 25, 50, 100]))
    document.documentElement.dataset.theme = 'invalid-preset'
    expect(getThemeDefaultPageSize(20)).toBe(20)
  })

  test('theme density initializes new lists without resetting current queries or explicit sizes', async () => {
    document.documentElement.dataset.theme = 'workspace'
    const loader = vi.fn(async () => ({ data: { list: [], total: 0 } }))
    const scope = effectScope()
    const list = scope.run(() => usePaginatedFetching(loader))
    const explicit = scope.run(() => usePaginatedFetching(loader, { pageSize: 100 }))
    try {
      expect(list.pagination.pageSize).toBe(25)
      expect(explicit.pagination.pageSize).toBe(100)
      await list.handleSizeChange(50)
      document.documentElement.dataset.theme = 'dark'
      expect(list.pagination.pageSize).toBe(50)
      expect(loader).toHaveBeenCalledTimes(1)
      expect(scope.run(() => usePaginatedFetching(loader)).pagination.pageSize).toBe(10)
    } finally {
      scope.stop()
    }
  })

  test('response metadata is independent of theme and honors the requested fallback', () => {
    document.documentElement.dataset.theme = 'workspace'
    expect(normalizePaginationData(null).pageSize).toBe(10)
    expect(parsePaginatedData(null, { enableLog: false }).pageSize).toBe(20)
    const response = { data: { list: [{ id: 1 }], total: 101 } }
    expect(parsePaginatedData(response, { pageSize: 50, enableLog: false }))
      .toMatchObject({ pageSize: 50, totalPages: 3 })
    response.data.pageSize = 10
    expect(parsePaginatedData(response, { pageSize: 50, enableLog: false }).pageSize).toBe(10)
  })

  test('preserves zero totals and rejects invalid pagination metadata', () => {
    const response = { data: { list: [{ id: 1 }], total: 0, page: -1, pageSize: 'Infinity' } }
    expect(parsePaginatedData(response, { pageSize: '25', enableLog: false }))
      .toMatchObject({ total: 0, page: 1, pageSize: 25, totalPages: 0 })
    expect(parsePaginatedData(null, { pageSize: 0, enableLog: false }).pageSize).toBe(20)
  })
})
