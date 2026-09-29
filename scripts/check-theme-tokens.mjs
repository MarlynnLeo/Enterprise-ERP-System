#!/usr/bin/env node
/** Validate preset palettes and shared CSS contracts without binding to duplicated selectors. */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { THEME_PRESET_LIST } from '../frontend/src/config/themePresets.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(root, 'frontend/package.json'))
const postcss = require('postcss')
const parse = (relativePath) => postcss.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'), { from: path.join(root, relativePath) })
const selectorsOf = (rule) => postcss.list.comma(rule.selector).map((selector) => selector.replace(/\s+/g, ' ').trim())
const declarationValue = (rule, name) => rule.nodes?.filter((node) => node.type === 'decl' && node.prop === name).at(-1)?.value

export function hasRuleDeclarations(stylesheet, selector, declarations) {
  let found = false
  stylesheet.walkRules((rule) => {
    if (!selectorsOf(rule).includes(selector)) return
    if (Object.entries(declarations).every(([name, value]) => declarationValue(rule, name) === value)) found = true
  })
  return found
}

/** Resolve declarations that apply to the document root, using specificity and !important. */
export function collectRootTokens(stylesheets, presetId) {
  const tokens = new Map()
  for (const stylesheet of stylesheets) {
    stylesheet.walkRules((rule) => {
      const specificity = selectorsOf(rule).reduce((maximum, selector) => {
        const match = selector.match(/^(?:(:root|html))?(\[data-theme(?:=["']([^"']+)["'])?\])?$/)
        if (!match || (!match[1] && !match[2]) || (match[3] && match[3] !== presetId)) return maximum
        return Math.max(maximum, (match[1] === ':root' ? 10 : match[1] ? 1 : 0) + (match[2] ? 10 : 0))
      }, -1)
      if (specificity < 0) return
      for (const node of rule.nodes || []) {
        if (node.type !== 'decl' || !node.prop.startsWith('--')) continue
        const rank = specificity + (node.important ? 1000 : 0)
        if (!tokens.has(node.prop) || tokens.get(node.prop).rank <= rank) tokens.set(node.prop, { value: node.value, rank })
      }
    })
  }
  return new Map([...tokens].map(([name, entry]) => [name, entry.value]))
}

export function findTokenCycles(tokens) {
  const cycles = []
  const visited = new Set()
  const active = []
  const visit = (name) => {
    const cycleStart = active.indexOf(name)
    if (cycleStart >= 0) {
      cycles.push([...active.slice(cycleStart), name].join(' → '))
      return
    }
    if (visited.has(name)) return
    visited.add(name)
    active.push(name)
    for (const [, dependency] of tokens.get(name)?.matchAll(/var\(\s*(--[\w-]+)/g) || []) {
      if (tokens.has(dependency)) visit(dependency)
    }
    active.pop()
  }
  for (const name of tokens.keys()) visit(name)
  return cycles
}

export function auditThemeTokens() {
  const errors = []
  const main = parse('frontend/src/assets/main.css')
  const compat = parse('frontend/src/assets/themes/pc/theme-compat.css')
  const components = parse('frontend/src/assets/themes/pc/theme-components.css')
  const common = parse('frontend/src/assets/common-styles.css')
  const mainJs = fs.readFileSync(path.join(root, 'frontend/src/main.js'), 'utf8')
  const requireRule = (stylesheet, selector, declarations) => {
    if (!hasRuleDeclarations(stylesheet, selector, declarations)) {
      errors.push(`${stylesheet.source.input.file}: 缺少规则 ${selector} 的声明 ${JSON.stringify(declarations)}`)
    }
  }

  requireRule(compat, ':root', { '--color-border': 'var(--color-border-base)', '--font-size-base': '14px', '--el-color-primary': 'var(--color-primary)' })
  for (const file of ['theme-components.css', 'theme-compat.css']) {
    if (!mainJs.includes(`themes/pc/${file}`)) errors.push(`main.js 未引入 ${file}`)
  }
  const sharedSelectors = []
  components.walkRules((rule) => {
    if (rule.nodes.some((node) => node.type === 'decl')) sharedSelectors.push(...selectorsOf(rule))
  })
  for (const selector of ['[data-theme] .el-table', '[data-theme] .el-card', '[data-theme] .sidebar-menu', '[data-theme] .app-header', '[data-theme] .icon-button', '[data-theme] .user-info', '[data-theme] .el-card.data-card', '[data-theme] .el-dropdown-menu', '[data-theme] .el-tag--primary']) {
    if (!sharedSelectors.includes(selector)) errors.push(`theme-components.css 缺少共享规则: ${selector}`)
  }

  // Buttons have one shared state implementation. Each semantic type supplies EP variables.
  for (const type of ['primary', 'success', 'warning', 'danger', 'info']) {
    requireRule(compat, `:root[data-theme] .el-button--${type}`, {
      '--el-button-bg-color': `var(--color-${type})`,
      '--el-button-text-color': `var(--color-on-${type})`
    })
    requireRule(compat, `:root[data-theme] .el-button--${type}.is-plain`, {
      '--el-button-text-color': `var(--color-${type})`,
      '--el-button-hover-text-color': `var(--color-on-${type})`
    })
  }
  const enabledButton = '[data-theme] .el-button:not(.is-text):not(.is-link):not(.is-disabled)'
  requireRule(components, enabledButton, { background: 'var(--el-button-bg-color)', color: 'var(--el-button-text-color)' })
  requireRule(components, `${enabledButton}:hover`, { background: 'var(--el-button-hover-bg-color)', color: 'var(--el-button-hover-text-color)' })
  requireRule(components, '[data-theme] .el-button.is-disabled:not(.is-text):not(.is-link)', { background: 'var(--el-button-disabled-bg-color)', color: 'var(--el-button-disabled-text-color)' })
  requireRule(components, '[data-theme] .el-tag.el-tag--dark', { background: 'var(--theme-tag-solid-bg)', color: 'var(--theme-tag-solid-color)' })
  requireRule(components, '[data-theme] .el-tag.el-tag--plain', { background: 'transparent' })
  requireRule(components, '[data-theme] .el-table', {
    '--el-table-tr-bg-color': 'var(--erp-table-fixed-cell-bg)',
    '--el-table-header-bg-color': 'var(--erp-table-fixed-header-bg)',
    '--el-table-row-hover-bg-color': 'var(--erp-table-fixed-hover-bg)',
    '--el-table-current-row-bg-color': 'var(--erp-table-fixed-current-bg)'
  })
  requireRule(compat, '[data-theme] .el-dialog.is-fullscreen', { border: 'none', 'border-radius': '0', 'box-shadow': 'none' })

  const verifyInteractionRules = (stylesheet, isPreset = false) => stylesheet.walkRules((rule) => {
    const paintsBackground = rule.nodes.some((node) => node.type === 'decl' && /^(background|background-color)$/.test(node.prop))
    for (const selector of selectorsOf(rule)) {
      if (paintsBackground && /tr\.el-table__row--striped/.test(selector) && !selector.includes(':not(.current-row):not(.hover-row):not(:hover)')) {
        errors.push(`${stylesheet.source.input.file}: 条纹背景未排除选中或悬停行: ${selector}`)
      }
      if (paintsBackground && /tr(?::hover|\.hover-row)/.test(selector) && !selector.includes(':not(.current-row)')) {
        errors.push(`${stylesheet.source.input.file}: 悬停背景未排除选中行: ${selector}`)
      }
      if (selector.includes('.el-table') && selector.includes('th.el-table__cell') && ['background', 'background-color'].some((property) => declarationValue(rule, property) === 'transparent')) {
        errors.push(`${stylesheet.source.input.file}: 表头背景必须与不透明固定列表头共享 token: ${selector}`)
      }
      const targetsTableHeader = selector.includes('.el-table') && /(?:\bth\b|\bthead\b|\.el-table__(?:header|fixed-header|fixed-right-header)(?:-wrapper)?\b)/.test(selector)
      if (isPreset && targetsTableHeader && rule.nodes.some((node) => node.type === 'decl' && /^background(?:-|$)/.test(node.prop))) {
        errors.push(`${stylesheet.source.input.file}: 主题表头不能单独覆写背景，请声明共享 --erp-table-fixed-header-bg / --erp-table-header-image token: ${selector}`)
      }
      const radius = declarationValue(rule, 'border-radius')
      if (/\.el-dialog$/.test(selector) && radius && !/^0(?:px)?$/.test(radius)) {
        errors.push(`${stylesheet.source.input.file}: 弹窗圆角规则必须排除全屏: ${selector}`)
      }
    }
  })
  verifyInteractionRules(common)
  verifyInteractionRules(components)
  verifyInteractionRules(compat)

  for (const preset of THEME_PRESET_LIST) {
    const stylesheet = parse(`frontend/src/assets/themes/pc/${preset.id}.css`)
    const tokens = collectRootTokens([main, compat, stylesheet], preset.id)
    const presetTokens = collectRootTokens([stylesheet], preset.id)
    const primary = presetTokens.get('--color-primary')?.toUpperCase()
    if (primary !== preset.primaryColor.toUpperCase()) errors.push(`${preset.id}: CSS 主色 ${primary} 与预设 ${preset.primaryColor} 不一致`)
    if (preset.id === 'premium' && primary === '#FFFFFF') errors.push('premium: 主色不能回退为旧版 #FFFFFF')
    const fontSizes = []
    stylesheet.walkDecls('--font-size-base', (declaration) => fontSizes.push(declaration.value))
    if (!fontSizes.length || fontSizes.some((value) => value !== '14px')) errors.push(`${preset.id}: --font-size-base 必须为 14px`)
    for (const token of ['--shell-sidebar-bg', '--shell-sidebar-text-muted', '--shell-sidebar-active-bg', '--shell-sidebar-active-text', '--shell-sidebar-accent']) {
      // Shared defaults are part of the effective palette; presets only own differences.
      let declared = tokens.has(token)
      stylesheet.walkRules((rule) => {
        if (selectorsOf(rule).some((selector) => selector === `[data-theme="${preset.id}"] .app-shell`) && declarationValue(rule, token)) declared = true
      })
      if (!declared) errors.push(`${preset.id}: 缺少侧栏 token ${token}`)
    }
    for (const cycle of findTokenCycles(tokens)) errors.push(`${preset.id}: CSS token 循环引用 ${cycle}`)
    verifyInteractionRules(stylesheet, true)
    stylesheet.walkRules((rule) => {
      for (const selector of selectorsOf(rule)) {
        if (/\.app-menu-link\.is-active(?![-\w.])/.test(selector) && !selector.includes('.el-icon') && rule.nodes.some((node) => node.type === 'decl' && /^(color|background|background-color)$/.test(node.prop))) {
          errors.push(`${preset.id}: 菜单选中态应使用共享 shell token: ${selector}`)
        }
      }
    })
  }
  return errors
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = auditThemeTokens()
  if (errors.length) {
    console.error('check-theme-tokens 失败:\n' + errors.map((error) => `  - ${error}`).join('\n'))
    process.exitCode = 1
  } else {
    console.log('check-theme-tokens: 主题 token、组件状态和字体引用检查通过')
  }
}
