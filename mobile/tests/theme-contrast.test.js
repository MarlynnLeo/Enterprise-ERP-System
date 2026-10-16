import { describe, expect, test } from 'vitest'
import { themes } from '@/config/themes'
import { accessibleTextColor, compositeThemeColor, contrastRatio, getContrastSafeColor, parseThemeColor } from '@/utils/themeContrast'

describe('mobile theme contrast', () => {
  test.each(themes)('keeps $name filled primary controls readable', ({ preview }) => {
    expect(contrastRatio(preview.primary, accessibleTextColor(preview.primary))).toBeGreaterThanOrEqual(4.5)
  })

  test.each([
    ['#51CF66', ['#F0FFF4', '#FFFFFF', '#E8F5E9']],
    ['#FF6B6B', ['#FFF8F8', '#FFFFFF', '#FFF0F0']],
    ['#409EFF', ['#F2F3F5', '#FFFFFF', '#F7F8FA']],
    ['#7C4DFF', ['#0B1120', '#111827', '#1F2937']],
    ['#112233', ['#0B1120', '#111827', '#1F2937']],
    ['#FFFFFF', ['#F4F7FB', '#FFFFFF', '#E8EEF5']]
  ])('adapts %s text to every supplied surface', (color, surfaces) => {
    const adapted = getContrastSafeColor(color, surfaces)
    expect(surfaces.every(surface => contrastRatio(adapted, surface) >= 4.5)).toBe(true)
  })

  test('preserves colors which already satisfy all surfaces', () => {
    expect(getContrastSafeColor('#1F4E79', ['#FFFFFF', '#F4F7FB'])).toBe('#1F4E79')
  })

  test('composites translucent status backgrounds before measuring their text', () => {
    const tinted = compositeThemeColor('rgba(255, 171, 64, 0.15)', '#FFFFFF')
    const text = getContrastSafeColor('#FFAB40', ['#FFFFFF', tinted])
    expect(tinted).toBe('#FFF2E2')
    expect(contrastRatio(text, tinted)).toBeGreaterThanOrEqual(4.5)
  })

  test('accepts theme shorthand and computed rgb colors and tolerates absent CSS', () => {
    expect(parseThemeColor('#abc')).toEqual([170, 187, 204])
    expect(parseThemeColor('rgb(17, 24, 39)')).toEqual([17, 24, 39])
    expect(getContrastSafeColor('', ['#FFFFFF'])).toBe('')
    expect(compositeThemeColor('', '#FFFFFF')).toBe('#FFFFFF')
  })
})
