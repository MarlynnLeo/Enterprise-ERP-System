import fs from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import { describe, expect, test } from 'vitest'
import { getAccessibleTextColor } from '@/config/themePresets'
import { collectRootTokens } from '../../scripts/check-theme-tokens.mjs'

const readStyles = (name) => postcss.parse(fs.readFileSync(resolve(process.cwd(), 'src/assets/themes/pc', `${name}.css`), 'utf8'))

describe('classic theme component contracts', () => {
  test('input appearance does not bypass native disabled and validation states', () => {
    const overrides = []
    for (const name of ['theme-compat', 'theme-components', 'workspace']) {
      readStyles(name).walkRules((rule) => {
        if (!/\.el-(?:input__wrapper|textarea__inner)/.test(rule.selector)) return
        rule.walkDecls((decl) => {
          if (decl.important && ['background', 'background-color', 'color', 'box-shadow'].includes(decl.prop)) {
            overrides.push(`${rule.selector}: ${decl}`)
          }
        })
      })
    }
    expect(overrides).toEqual([])
  })

  test('pagination hover rules preserve active and disabled states', () => {
    const violations = []
    readStyles('theme-components').walkRules((rule) => {
      if (!rule.selector.includes('.el-pagination') || !rule.selector.includes(':hover')) return
      for (const selector of rule.selectors) {
        if (selector.includes('li') && (!selector.includes(':not(.is-active)') || !selector.includes(':not(.is-disabled)'))) {
          violations.push(selector)
        }
        if (selector.includes('button') && !selector.includes(':not(:disabled)')) violations.push(selector)
      }
    })
    expect(violations).toEqual([])
  })

  test('input group seams stay owned by Element Plus', () => {
    for (const name of ['workspace', 'theme-components']) {
      const overrides = []
      readStyles(name).walkRules((rule) => {
        if (!/\.el-(?:input__wrapper|textarea__inner)/.test(rule.selector)) return
        rule.walkDecls('border-radius', (decl) => {
          if (decl.important) overrides.push(decl.toString())
        })
      })
      expect(overrides).toEqual([])
    }
    const tokens = collectRootTokens([readStyles('workspace')], 'workspace')
    expect(tokens.get('--theme-input-radius')).toBe('var(--radius-sm)')
  })

  test('filled buttons retain readable text on normal and pressed surfaces', () => {
    const tokens = collectRootTokens([readStyles('workspace')], 'workspace')
    for (const type of ['primary', 'success', 'warning', 'danger', 'info']) {
      const text = tokens.get(`--color-on-${type}`)
      for (const suffix of ['', type === 'primary' ? '-dark-2' : '-dark']) {
        expect(getAccessibleTextColor(tokens.get(`--color-${type}${suffix}`))).toBe(text)
      }
    }
  })

  test('control borders remain owned by Element Plus validation and focus states', () => {
    for (const name of ['workspace', 'theme-components']) {
      const resets = []
      readStyles(name).walkRules((rule) => {
        if (!/\.el-(?:input__wrapper|select__wrapper|textarea__inner|range-editor)/.test(rule.selector)) return
        rule.walkDecls('box-shadow', (decl) => {
          if (decl.important) resets.push(`${rule.selector}: ${decl.value}`)
        })
      })
      expect(resets).toEqual([])
    }
  })

  test('text uses configurable typography and table palettes have a single alias direction', () => {
    const violations = []
    readStyles('workspace').walkDecls((decl) => {
      if (decl.prop === 'font-size' && /^\d+px$/.test(decl.value) && !/icon/.test(decl.parent.selector)) violations.push(decl.toString())
      if (decl.prop.startsWith('--erp-table-') && /var\(--el-table-/.test(decl.value)) violations.push(decl.toString())
    })
    expect(violations).toEqual([])
  })

})
