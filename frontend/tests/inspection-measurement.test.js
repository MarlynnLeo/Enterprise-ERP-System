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

  it('prefers a comparison operator over a displayed nominal value', () => {
    const item = {
      type: 'performance',
      standard: '≥0.9N.m，无滑牙、断杆，每批抽10只',
      dimensionValue: 0.9,
      toleranceUpper: null,
      toleranceLower: null
    }

    expect(parseInspectionStandard(item)).toMatchObject({
      operator: 'gte',
      nominal: 0.9,
      lowerBound: 0.9,
      upperBound: null
    })
    expect(compareInspectionMeasurement(item, '0.89').result).toBe('failed')
    expect(compareInspectionMeasurement(item, '0.9').result).toBe('passed')
    expect(compareInspectionMeasurement(item, '1.2').result).toBe('passed')
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

  it('keeps dimension items without numeric constraints qualitative', () => {
    expect(parseInspectionStandard({
      type: 'dimension',
      standard: '线径符合图纸（卡尺）'
    }).mode).toBe('qualitative')
    expect(isNumericInspectionItem({
      type: 'dimension',
      standard: '符合规格尺寸'
    })).toBe(false)
  })

  it('ignores dates, versions and AQL metadata', () => {
    expect(isNumericInspectionItem({ standard: '日期2026-09-03' })).toBe(false)
    expect(isNumericInspectionItem({ standard: '版本 V1.3' })).toBe(false)
    expect(isNumericInspectionItem({ standard: '外观 AQL 1.5' })).toBe(false)
    expect(isNumericInspectionItem({ standard: 'AQL 1.5，Ac 0，Re 1' })).toBe(false)
  })

  it('parses units before postfix comparisons and negative ranges', () => {
    expect(parseInspectionStandard({ standard: '-1.5N.m以上' })).toMatchObject({
      operator: 'gte',
      lowerBound: -1.5,
      unit: 'N.m'
    })
    expect(parseInspectionStandard({ standard: '-1.5--1.0N.m' })).toMatchObject({
      operator: 'range',
      lowerBound: -1.5,
      upperBound: -1,
      unit: 'N.m'
    })
  })
})
