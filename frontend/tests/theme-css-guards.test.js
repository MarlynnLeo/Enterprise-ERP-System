import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import { describe, expect, test } from 'vitest'
import { THEME_PRESET_LIST } from '@/config/themePresets'
import { auditThemeTokens, collectRootTokens, findTokenCycles, hasRuleDeclarations } from '../../scripts/check-theme-tokens.mjs'

const readStyles = (name) => postcss.parse(readFileSync(resolve('src/assets/themes/pc', `${name}.css`), 'utf8'))

describe('theme CSS contracts', () => {
  test('all palettes, button states, row states and full-screen dialog rules pass the audit', () => {
    expect(auditThemeTokens()).toEqual([])
  })

  test('checks real declarations instead of matching selectors in comments', () => {
    const stylesheet = postcss.parse('/* .el-button--primary { color: red; } */ .el-button--primary { background: blue; }')
    expect(hasRuleDeclarations(stylesheet, '.el-button--primary', { color: 'red' })).toBe(false)
    expect(hasRuleDeclarations(stylesheet, '.el-button--primary', { background: 'blue' })).toBe(true)
  })

  test('detects cycles including fallback references that invalidate typography tokens', () => {
    const styles = postcss.parse(':root { --font-mono: var(--font-family-mono, monospace); --font-family-mono: var(--font-mono); }')
    expect(findTokenCycles(collectRootTokens([styles], 'workspace'))).toEqual(['--font-mono → --font-family-mono → --font-mono'])
    const fallback = new Map([['--font-mono', 'var(--available-font, var(--font-mono))'], ['--available-font', 'monospace']])
    expect(findTokenCycles(fallback)).toEqual(['--font-mono → --font-mono'])
  })

  test('uses the active preset and selector specificity when validating token references', () => {
    const base = postcss.parse(':root { --font-mono: monospace; } :root[data-theme="workspace"] { --font-family-mono: var(--font-mono); }')
    const later = postcss.parse(':root[data-theme="dark"] { --font-mono: var(--font-mono); } :root { --font-family-mono: sans-serif; }')
    const workspace = collectRootTokens([base, later], 'workspace')
    expect(workspace.get('--font-family-mono')).toBe('var(--font-mono)')
    expect(findTokenCycles(workspace)).toEqual([])
    expect(findTokenCycles(collectRootTokens([base, later], 'dark'))).toEqual(['--font-mono → --font-mono'])
  })

  test('every preset preserves native field validation, disabled surfaces and input group seams', () => {
    const violations = []
    const protectedProperties = new Set(['background', 'background-color', 'color', 'box-shadow', 'border', 'border-color', 'border-radius'])
    for (const name of ['theme-compat', 'theme-components', ...THEME_PRESET_LIST.map(({ id }) => id)]) {
      readStyles(name).walkRules((rule) => {
        if (!/\.el-(?:input__wrapper|select__wrapper|textarea__inner|range-editor)\b/.test(rule.selector)) return
        rule.walkDecls((decl) => {
          if (decl.important && protectedProperties.has(decl.prop)) {
            violations.push(`${name}:${rule.source.start.line} ${rule.selector}: ${decl}`)
          }
        })
      })
    }
    expect(violations).toEqual([])
  })

  test('text, select, numeric and range controls share appearance tokens through their native variables', () => {
    const shared = readStyles('theme-components')
    const inputAppearance = {
      '--el-input-border-radius': 'var(--theme-input-radius)',
      '--el-input-bg-color': 'var(--theme-input-bg)',
      '--el-input-border-color': 'var(--theme-input-border-color)',
      '--el-input-hover-border-color': 'var(--theme-input-hover-border-color)'
    }
    for (const selector of ['[data-theme] .el-input', '[data-theme] .el-textarea', '[data-theme] .el-date-editor']) {
      expect(hasRuleDeclarations(shared, selector, inputAppearance), selector).toBe(true)
    }
    expect(hasRuleDeclarations(shared, '[data-theme] .el-select__wrapper', {
      '--el-border-radius-base': 'var(--theme-input-radius)',
      '--el-fill-color-blank': 'var(--theme-input-bg)',
      '--el-border-color': 'var(--theme-input-border-color)',
      '--el-border-color-hover': 'var(--theme-input-hover-border-color)'
    })).toBe(true)
    expect(hasRuleDeclarations(shared, '[data-theme] .el-input-number', {
      '--el-border-radius-base': 'var(--theme-input-radius)'
    })).toBe(true)
    // Generic Element Plus variables stay on the select trigger, outside its popup scope.
    shared.walkRules((rule) => {
      if (!rule.selectors.includes('[data-theme] .el-select')) return
      expect(rule.nodes.filter((node) => node.type === 'decl' && ['--el-fill-color-blank', '--el-border-color', '--el-border-radius-base'].includes(node.prop))).toEqual([])
    })
  })

  test('disabled date ranges retain the disabled border while hovered', () => {
    expect(hasRuleDeclarations(readStyles('theme-components'), '[data-theme] .el-date-editor.el-range-editor.is-disabled', {
      '--el-input-border-color': 'var(--el-disabled-border-color)',
      '--el-input-hover-border-color': 'var(--el-disabled-border-color)'
    })).toBe(true)
  })
})
