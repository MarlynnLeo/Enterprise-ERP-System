import { describe, expect, it } from 'vitest'
import { validateItemsCompleteness } from '@/utils/inspectionValidation'

describe('inspection item validation', () => {
  it('allows a dimension item without numeric fields', () => {
    expect(validateItemsCompleteness([{
      item_name: '线径',
      standard: '线径符合图纸（卡尺）',
      type: 'dimension'
    }])).toEqual({ valid: true })
  })
})
