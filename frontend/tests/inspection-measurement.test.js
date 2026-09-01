import { describe, expect, it } from 'vitest'
import {
  formatInspectionMeasurement,
  isDimensionInspectionItem,
  normalizeQualitativeMeasurementValue,
  summarizeQualitativeMeasurements
} from '@/utils/inspectionMeasurement'

describe('inspection measurement helpers', () => {
  it('keeps dimension values as text input values', () => {
    const item = { type: 'dimension' }
    expect(isDimensionInspectionItem(item)).toBe(true)
    expect(formatInspectionMeasurement(item, '2.830')).toBe('2.830')
  })

  it('normalizes legacy qualitative values to check or cross', () => {
    expect(normalizeQualitativeMeasurementValue('1.000000')).toBe('√')
    expect(normalizeQualitativeMeasurementValue('0.000000')).toBe('×')
    expect(normalizeQualitativeMeasurementValue('passed')).toBe('√')
    expect(normalizeQualitativeMeasurementValue('failed')).toBe('×')
  })

  it('summarizes six qualitative measurements and fails on any cross', () => {
    expect(summarizeQualitativeMeasurements(['√', '√', '√', '√', '√', '×'])).toEqual({
      passed: 5,
      failed: 1,
      total: 6,
      text: '√5 / ×1',
      result: 'failed'
    })
  })
})
