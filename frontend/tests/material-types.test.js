import { describe, expect, it } from 'vitest'
import {
  MATERIAL_TYPE_OPTIONS,
  getMaterialTypeLabel,
  normalizeMaterialType
} from '../src/utils/materialTypes.js'

describe('materialTypes', () => {
  it('covers the live NG item types', () => {
    expect(MATERIAL_TYPE_OPTIONS.map((item) => item.value)).toEqual([
      'finished_goods',
      'semi_finished',
      'raw_material',
      'packaging',
      'component'
    ])
  })

  it('renders Chinese labels for stored codes', () => {
    expect(getMaterialTypeLabel('finished_goods')).toBe('产成品')
    expect(getMaterialTypeLabel('component')).toBe('零部件')
    expect(getMaterialTypeLabel('packaging')).toBe('包装物')
    expect(getMaterialTypeLabel('finished_product')).toBe('产成品')
  })

  it('does not treat composition text as a type code', () => {
    expect(normalizeMaterialType('304不锈钢')).toBe('304不锈钢')
    expect(getMaterialTypeLabel('304不锈钢')).toBe('304不锈钢')
  })
})
