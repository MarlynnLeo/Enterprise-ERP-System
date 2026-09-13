import { describe, expect, test } from 'vitest'
import { getProductionTaskProgress } from '@/utils/productionTask'

describe('production task completion shown in list and detail', () => {
  test('uses camelCase API quantities even when a stale progress field says zero', () => {
    expect(getProductionTaskProgress({ quantity: '10.0000', completedQuantity: '10.0000', progress: 0 })).toBe(100)
    expect(getProductionTaskProgress({ quantity: 2.5, completedQuantity: 1.25 })).toBe(50)
  })

  test('keeps missing, invalid and over-complete quantities within the progress range', () => {
    expect(getProductionTaskProgress(null)).toBe(0)
    expect(getProductionTaskProgress({ quantity: 0, completedQuantity: 0 })).toBe(0)
    expect(getProductionTaskProgress({ quantity: 10, completedQuantity: 12 })).toBe(100)
    expect(getProductionTaskProgress({ quantity: 10, completedQuantity: -1 })).toBe(0)
    expect(getProductionTaskProgress({ progress: 35 })).toBe(35)
  })
})
