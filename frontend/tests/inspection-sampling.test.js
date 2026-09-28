import { describe, expect, it } from 'vitest'
import { getInspectionSampleQuantity, getInspectionSamplingPlan } from '@/utils/inspectionSampling'

describe('inspection sampling report data', () => {
  it('keeps a saved sample count separate from the lot and six measurement slots', () => {
    expect(getInspectionSampleQuantity({ quantity: 1000, sampleQuantity: '80', items: [{ measurements: Array(6).fill('√') }] })).toBe(80)
  })

  it('does not fabricate historical sampling quantities from an unrecorded plan', () => {
    expect(getInspectionSampleQuantity({ quantity: 1000, sampleQuantity: null })).toBeNull()
    expect(getInspectionSampleQuantity({ quantity: 16, sampleQuantity: undefined, isAql: true })).toBeNull()
    expect(getInspectionSampleQuantity({ quantity: 1000, sampleQuantity: 'invalid' })).toBeNull()
    expect(getInspectionSampleQuantity({ quantity: 1000, sampleQuantity: 0 })).toBeNull()
  })

  it('returns null when neither saved quantity nor valid lot quantity is present', () => {
    expect(getInspectionSampleQuantity({ quantity: 0, sampleQuantity: null })).toBeNull()
    expect(getInspectionSampleQuantity({})).toBeNull()
  })

  it('uses lot quantity only for an explicit full inspection', () => {
    expect(getInspectionSampleQuantity({ quantity: 1000, isFullInspection: true })).toBe(1000)
    expect(getInspectionSamplingPlan({ isFullInspection: true })).toBe('全检')
  })

  it('does not label an unconfigured inspection as GB/T 2828.1', () => {
    expect(getInspectionSamplingPlan({ quantity: 1000 })).toBe('未记录')
    expect(getInspectionSamplingPlan({ isAql: true, aqlLevel: 1 })).toContain('尚未匹配标准')
  })

  it('distinguishes a template requirement from the plan actually selected', () => {
    const templateDescription = '检验依据: 图纸 | 抽样方案: GB/T 2828.1 II CR AQL=0.065 MAJ AQL=1.0 MIN AQL=2.5 | 供应商: 工厂'
    expect(getInspectionSamplingPlan({ isAql: false, templateDescription })).toBe('模板要求：GB/T 2828.1 II CR AQL=0.065 MAJ AQL=1.0 MIN AQL=2.5（本单未启用 AQL）')
    expect(getInspectionSamplingPlan({ isAql: true, aqlStandardId: 22, aqlLevel: 1, acceptLimit: 2, rejectLimit: 3, templateDescription })).toBe('AQL 1，Ac=2，Re=3')
  })
})
