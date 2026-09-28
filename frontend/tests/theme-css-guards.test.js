import postcss from 'postcss'
import { describe, expect, test } from 'vitest'
import { auditThemeTokens, collectRootTokens, findTokenCycles, hasRuleDeclarations } from '../../scripts/check-theme-tokens.mjs'

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
})
