import { describe, expect, test, vi } from 'vitest'
import { compileI18nMessage } from '../src/locales/cspSafeMessageCompiler.js'

describe('cspSafeMessageCompiler', () => {
  test('returns plain strings without Function', () => {
    const spy = vi.spyOn(globalThis, 'Function')
    const fn = compileI18nMessage('工作台')
    expect(fn()).toBe('工作台')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  test('interpolates simple named placeholders via ctx.named', () => {
    const fn = compileI18nMessage('最少输入{min}个字符')
    expect(
      fn({
        named: (key) => ({ min: 6 }[key])
      })
    ).toBe('最少输入6个字符')
  })

  test('falls back to ctx.values when named is unavailable', () => {
    const fn = compileI18nMessage('最多输入{max}个字符')
    expect(fn({ values: { max: 20 } })).toBe('最多输入20个字符')
  })

  test('treats missing values as empty string', () => {
    const fn = compileI18nMessage('hello {name}')
    expect(fn({ named: () => undefined })).toBe('hello ')
  })
})
