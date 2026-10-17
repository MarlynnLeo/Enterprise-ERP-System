import { describe, expect, it } from 'vitest'
import { resolveFinalInspectionResult } from '@/utils/finalInspectionResult'

const mixed = () => ({ quantity: 100, qualifiedQuantity: 90, unqualifiedQuantity: 10,
  items: [{ result: 'passed' }, { result: 'failed' }] })

describe('final inspection quantity verdict', () => {
  it('releases 90 while retaining 10 defective', () => {
    const inspection = mixed()
    expect(resolveFinalInspectionResult(inspection)).toBe('partial')
    expect(inspection.unqualifiedQuantity).toBe(10)
  })
  it('allows a repaired lot of 10 to pass separately', () => {
    expect(resolveFinalInspectionResult({ quantity: 10, qualifiedQuantity: 10, unqualifiedQuantity: 0,
      items: [{ result: 'passed' }] })).toBe('passed')
  })
  it('records a fully rejected lot', () => {
    expect(resolveFinalInspectionResult({ ...mixed(), qualifiedQuantity: 0, unqualifiedQuantity: 100 })).toBe('failed')
  })
  it.each([
    { qualifiedQuantity: 100 }, { qualifiedQuantity: -1 }, { quantity: NaN },
    { items: [] }, { items: [{ result: '' }] }, { items: [{ result: 'passed' }] },
    { items: [{ result: 'failed', isCritical: true }] },
    { qualifiedQuantity: 100, unqualifiedQuantity: 0 }
  ])('rejects inconsistent quantity or item evidence: %j', change => {
    expect(() => resolveFinalInspectionResult({ ...mixed(), ...change })).toThrow()
  })
})
