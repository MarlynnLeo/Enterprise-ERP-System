import { beforeEach, describe, expect, test, vi } from 'vitest'
import api from '@/api/client'
import { productionApi } from '@/api/modules/production'

vi.mock('@/api/client', () => ({
  default: { post: vi.fn().mockResolvedValue({ data: { id: 9 } }) }
}))

describe('mobile production reporting contract', () => {
  beforeEach(() => vi.clearAllMocks())

  test('records good and defective output through the reports permission endpoint', async () => {
    await productionApi.reportProductionProgress({
      taskId: 42, completedQuantity: '10', defectiveQuantity: '2', remarks: '本班报工'
    })
    expect(api.post).toHaveBeenCalledWith('/production/reports', {
      taskId: 42,
      completedQuantity: 10,
      qualifiedQuantity: 8,
      defectiveQuantity: 2,
      unqualifiedQuantity: 2,
      remarks: '本班报工'
    })
  })

  test('keeps older callers working without discarding defective quantities', async () => {
    await productionApi.reportProductionProgress({
      task_id: 42, completed_quantity: 5, defective_quantity: 1, remark: 'legacy caller'
    })
    expect(api.post).toHaveBeenCalledWith('/production/reports', expect.objectContaining({
      taskId: 42, completedQuantity: 5, qualifiedQuantity: 4, defectiveQuantity: 1,
      unqualifiedQuantity: 1, remarks: 'legacy caller'
    }))
  })

  test('treats omitted defect quantity as zero', async () => {
    await productionApi.reportProductionProgress({ taskId: 42, quantity: 3 })
    expect(api.post).toHaveBeenCalledWith('/production/reports', expect.objectContaining({
      completedQuantity: 3, qualifiedQuantity: 3, defectiveQuantity: 0
    }))
  })

  test.each([
    { completedQuantity: -1 },
    { completedQuantity: 0 },
    { completedQuantity: '' },
    { completedQuantity: 'NaN' },
    { completedQuantity: 'Infinity' },
    { defectiveQuantity: -1 },
    { defectiveQuantity: 11 },
    { defectiveQuantity: 'Infinity' },
    { taskId: 0 },
    { taskId: 'invalid' },
  ])('blocks invalid input before any write: %j', (changes) => {
    expect(() => productionApi.reportProductionProgress({
      taskId: 42, completedQuantity: 10, defectiveQuantity: 0, ...changes
    })).toThrow()
    expect(api.post).not.toHaveBeenCalled()
  })
})
