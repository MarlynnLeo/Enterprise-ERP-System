import { describe, expect, test } from 'vitest'
import { filterByKeyword, toPagedResponse } from '@/utils/listResponse'

describe('mobile list data flow', () => {
  const rows = [
    { code: 'SO-1001', customer: 'Alpha' },
    { code: 'SO-1002', customer: 'Beta' }
  ]

  test('filters configured business fields case-insensitively', () => {
    expect(filterByKeyword(rows, 'alpha', ['code', 'customer'])).toEqual([rows[0]])
    expect(filterByKeyword(rows, '1002', ['code', 'customer'])).toEqual([rows[1]])
  })

  test('wraps local results in the standard pagination contract', () => {
    expect(toPagedResponse(rows)).toEqual({
      data: { list: rows, total: 2, page: 1, pageSize: 2 }
    })
  })
})
