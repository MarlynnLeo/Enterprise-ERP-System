import { describe, expect, it } from 'vitest'
import {
  compareInspectionMeasurement,
  evaluateInspectionMeasurements,
  formatInspectionMeasurement,
  isNumericInspectionItem,
  isDimensionInspectionItem,
  normalizeQualitativeMeasurementValue,
  parseInspectionStandard,
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

  it('parses a numeric performance standard and ignores the sampling quantity', () => {
    const item = {
      type: 'performance',
      standard: '破坏扭矩 ≥1.5N.m，无滑牙、断杆每批抽10只'
    }

    expect(parseInspectionStandard(item)).toMatchObject({
      mode: 'numeric',
      operator: 'gte',
      nominal: 1.5,
      lowerBound: 1.5
    })
    expect(isNumericInspectionItem(item)).toBe(true)
    expect(compareInspectionMeasurement(item, '1.49').result).toBe('failed')
    expect(compareInspectionMeasurement(item, '1.50').result).toBe('passed')
  })

  it('parses ranges and explicit nominal tolerances', () => {
    expect(parseInspectionStandard({ standard: '2.76～2.90mm之间', type: 'performance' })).toMatchObject({
      mode: 'numeric',
      operator: 'range',
      lowerBound: 2.76,
      upperBound: 2.9
    })
    expect(parseInspectionStandard({
      type: 'performance',
      dimensionValue: 2.83,
      toleranceUpper: 0.07,
      toleranceLower: -0.07,
      standard: '螺纹外径'
    })).toMatchObject({
      mode: 'numeric',
      operator: 'tolerance',
      lowerBound: 2.76,
      upperBound: 2.9
    })
  })

  it('uses qualitative controls when a number is only a sample count', () => {
    const item = { type: 'performance', standard: '无滑牙、断杆每批抽10只' }
    expect(isNumericInspectionItem(item)).toBe(false)
    expect(evaluateInspectionMeasurements(item, ['√', '×']).mode).toBe('qualitative')
    expect(isNumericInspectionItem({ type: 'visual', standard: '抽样数量:10' })).toBe(false)
  })
})
