import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: vi.fn() }))
vi.mock('@/api', () => ({ qualityApi: {}, purchaseApi: {}, baseDataApi: {} }))

import { generateBatchNumber } from '@/utils/inspectionHelpers'

describe('purchase inspection batch preview', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 22, 10, 0, 0))
  })
  afterEach(() => vi.useRealTimers())

  test('uses the compact supplier/date/sequence format', async () => {
    const api = { getIncomingInspections: vi.fn(async () => ({ data: { total: 2 } })) }
    expect(await generateBatchNumber('G023', 23, api)).toBe('G023-260922003')
  })

  test('keeps the actual supplier code instead of the rule preview example', async () => {
    expect(await generateBatchNumber('G002')).toBe('G002-260922001')
  })
})
