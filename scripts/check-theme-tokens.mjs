#!/usr/bin/env node
/**
 * CI：主题 token 最低一致性
 * - 每套主题 --font-size-base 为 14px
 * - themePresets.primaryColor 与 CSS --color-primary 一致（hex）
 * - 禁止 premium 使用纯白 #ffffff 作为 --color-primary
 * - theme-compat 必须定义 --color-border 别名
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const themesDir = path.join(root, 'frontend/src/assets/themes/pc')
const presetsPath = path.join(root, 'frontend/src/config/themePresets.js')

const THEMES = [
  'default',
  'tech',
  'business',
  'vibrant',
  'nature',
  'dark',
  'premium',
  'professional',
  'kacon',
]

function extractToken(css, name) {
  const re = new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*([^;]+);`)
  const m = css.match(re)
  return m ? m[1].trim() : null
}

function extractPresetPrimary(src, id) {
  const re = new RegExp(`id:\\s*'${id}'[\\s\\S]*?primaryColor:\\s*'([^']+)'`, 'm')
  const m = src.match(re)
  return m ? m[1].toUpperCase() : null
}

const errors = []
const presetsSrc = fs.readFileSync(presetsPath, 'utf8')
const compat = fs.readFileSync(path.join(themesDir, 'theme-compat.css'), 'utf8')

if (!/--color-border\s*:\s*var\(--color-border-base\)/.test(compat)) {
  errors.push('theme-compat.css 缺少 --color-border: var(--color-border-base)')
}
if (!/--font-size-base\s*:\s*14px/.test(compat)) {
  errors.push('theme-compat.css 缺少全局 --font-size-base: 14px')
}
if (!/--el-color-primary\s*:\s*var\(--color-primary\)/.test(compat)) {
  errors.push('theme-compat.css 缺少 --el-color-primary: var(--color-primary)')
}

const mainJs = fs.readFileSync(path.join(root, 'frontend/src/main.js'), 'utf8')
if (!mainJs.includes("themes/pc/theme-components.css")) {
  errors.push('main.js 未引入 theme-components.css（全主题共享组件壳）')
}
if (!mainJs.includes("themes/pc/theme-compat.css")) {
  errors.push('main.js 未引入 theme-compat.css')
}
const componentsCss = path.join(themesDir, 'theme-components.css')
if (!fs.existsSync(componentsCss)) {
  errors.push('缺少 theme-components.css')
} else {
  const shell = fs.readFileSync(componentsCss, 'utf8')
  for (const must of [
    '[data-theme] .el-table',
    '[data-theme] .el-button--primary',
    '[data-theme] .el-card',
    // 布局壳：侧栏密度 / 顶栏 / 控件（从 kacon 上收，全主题可用）
    '[data-theme] .sidebar-menu',
    '[data-theme] .app-header',
    '[data-theme] .icon-button',
    '[data-theme] .user-info',
    '[data-theme] .el-card.data-card',
    '[data-theme] .el-dropdown-menu',
    '[data-theme] .el-tag--primary',
  ]) {
    if (!shell.includes(must)) {
      errors.push(`theme-components.css 缺少共享规则: ${must}`)
    }
  }
}

/** 全主题均应声明侧栏 shell（浅色可用与 compat 默认一致的显式值） */
const SIDEBAR_SHELL_THEMES = new Set(THEMES)
const SIDEBAR_SHELL_TOKENS = [
  '--shell-sidebar-bg',
  '--shell-sidebar-text-muted',
  '--shell-sidebar-active-bg',
  '--shell-sidebar-active-text',
  '--shell-sidebar-accent',
]

for (const id of THEMES) {
  const css = fs.readFileSync(path.join(themesDir, `${id}.css`), 'utf8')
  const fontBase = extractToken(css, '--font-size-base')
  // 允许 media query 里再次声明 14px；主声明必须是 14px
  const baseDecls = [...css.matchAll(/--font-size-base\s*:\s*([^;]+);/g)].map((m) => m[1].trim())
  if (!baseDecls.length) {
    errors.push(`${id}: 缺少 --font-size-base`)
  } else if (!baseDecls.every((v) => v === '14px')) {
    errors.push(`${id}: --font-size-base 必须全部为 14px，当前: ${baseDecls.join(', ')}`)
  }

  const cssPrimary = (extractToken(css, '--color-primary') || '').toUpperCase()
  const presetPrimary = extractPresetPrimary(presetsSrc, id)
  if (id === 'premium' && (cssPrimary === '#FFFFFF' || presetPrimary === '#FFFFFF')) {
    errors.push('premium: 禁止使用 #FFFFFF 作为 primary（控件不可见）')
  }
  if (
    presetPrimary &&
    cssPrimary &&
    /^#[0-9A-F]{6}$/.test(cssPrimary) &&
    /^#[0-9A-F]{6}$/.test(presetPrimary) &&
    presetPrimary !== cssPrimary
  ) {
    errors.push(`${id}: preset primaryColor ${presetPrimary} ≠ CSS ${cssPrimary}`)
  }

  if (SIDEBAR_SHELL_THEMES.has(id)) {
    for (const tok of SIDEBAR_SHELL_TOKENS) {
      if (!css.includes(tok)) {
        errors.push(`${id}: 缺少侧栏 shell token ${tok}`)
      }
    }
  }

  // 禁止主题再写菜单激活背景/文字色（应走 shell token + theme-components）
  // 允许：.is-active .el-icon、分支菜单 active-path、仅 font-weight 已迁到 token
  const menuActiveBlocks = [
    ...css.matchAll(
      /\[data-theme[^\]]*\][^{]*\.app-menu-link\.is-active(?![-\w.])[^{]*\{([^}]*)\}/g
    ),
  ]
  for (const m of menuActiveBlocks) {
    const body = m[1]
    const sel = m[0].slice(0, m[0].indexOf('{')).replace(/\s+/g, ' ').trim()
    // 仅图标 opacity 可保留
    if (/\.el-icon/.test(sel)) continue
    if (/background(?:-color)?\s*:/.test(body) || /(?<!-)\bcolor\s*:/.test(body)) {
      errors.push(
        `${id}: 菜单 is-active 仍写 background/color（请改 shell token）: ${sel.slice(0, 80)}`
      )
    }
  }
}

// theme-components 侧栏壳必须存在
const componentsSrc = fs.readFileSync(componentsCss, 'utf8')
for (const must of [
  '--shell-sidebar-active-bg',
  '--shell-sidebar-active-shadow',
  '--shell-sidebar-rail-width',
    '.sidebar .app-menu-link.is-active',
]) {
  if (!componentsSrc.includes(must)) {
    errors.push(`theme-components.css 缺少侧栏壳: ${must}`)
  }
}

if (errors.length) {
  console.error('❌ check-theme-tokens 失败:\n')
  for (const e of errors) console.error('  -', e)
  process.exit(1)
}

console.log('✅ check-theme-tokens: 主题 token 一致性通过')
