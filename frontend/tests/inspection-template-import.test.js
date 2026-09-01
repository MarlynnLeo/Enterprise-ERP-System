import { describe, expect, it } from 'vitest'
import {
  normalizeImportedInspectionItem,
  normalizeParsedInspectionTemplate,
} from '@/utils/inspectionTemplateImport'

describe('inspection template import normalization', () => {
  it('keeps project and detection method from camel-case API responses', () => {
    const template = normalizeParsedInspectionTemplate({
      materialTypes: [1001],
      items: [
        {
          itemName: '外观',
          standard: '无裂纹、毛刺',
          inspectionMethod: '目测',
          type: 'visual',
        },
      ],
    })

    expect(template.items[0]).toMatchObject({
      itemName: '外观',
      item_name: '外观',
      method: '目测',
      inspectionMethod: '目测',
      inspection_method: '目测',
    })
  })

  it('supports legacy snake-case responses and dimension fields', () => {
    expect(
      normalizeImportedInspectionItem({
        item_name: '线径',
        standard: '1.2±0.1mm',
        inspection_method: '千分尺',
        type: 'dimension',
        dimension_value: 1.2,
        tolerance_upper: 0.1,
        tolerance_lower: -0.1,
      })
    ).toMatchObject({
      itemName: '线径',
      method: '千分尺',
      dimensionValue: 1.2,
      toleranceUpper: 0.1,
      toleranceLower: -0.1,
    })
  })
})
