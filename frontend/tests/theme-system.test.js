import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  THEME_PRESET_LIST,
  getAccessibleTextColor,
  normalizePrimaryColor,
  normalizeThemeAppearance
} from '@/config/themePresets'

const themesDirectory = resolve(process.cwd(), 'src/assets/themes/pc')

const readTheme = (id) => readFileSync(resolve(themesDirectory, `${id}.css`), 'utf8')

const parseHexColor = (value) => {
  const match = value?.match(/^#([0-9a-f]{6})$/i)
  if (!match) return null
  return [0, 2, 4].map((index) => Number.parseInt(match[1].slice(index, index + 2), 16))
}

const relativeLuminance = (value) => {
  const rgb = parseHexColor(value)
  if (!rgb) return null

  return rgb.reduce((sum, channel, index) => {
    const normalized = channel / 255
    const linear = normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
    return sum + linear * [0.2126, 0.7152, 0.0722][index]
  }, 0)
}

const contrastRatio = (foreground, background) => {
  const foregroundLuminance = relativeLuminance(foreground)
  const backgroundLuminance = relativeLuminance(background)
  if (foregroundLuminance === null || backgroundLuminance === null) return 0

  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

const readToken = (css, token) => css.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})`))?.[1]

describe('theme system', () => {
  test.each(THEME_PRESET_LIST)('$id declares a scoped root and accessible primary text', (preset) => {
    const css = readTheme(preset.id)
    const token = css.match(/--color-on-primary:\s*(#[0-9a-fA-F]{6})/)

    expect(css).toContain(`:root[data-theme="${preset.id}"]`)
    expect(token?.[1]).toBeTruthy()
    // 对比度至少 4.5:1；允许主题用近黑（如 premium #09090B）替代纯黑
    expect(contrastRatio(token[1], preset.primaryColor)).toBeGreaterThanOrEqual(4.5)
  })

  test('normalization keeps preset and color mode consistent', () => {
    expect(normalizeThemeAppearance({ preset: 'nature', theme: 'dark' }).theme).toBe('light')
    expect(normalizeThemeAppearance({ preset: 'tech', theme: 'light' }).theme).toBe('dark')
  })

  test('contrast helper supports light and dark custom colors', () => {
    expect(getAccessibleTextColor('#FFFFFF')).toBe('#000000')
    expect(getAccessibleTextColor('#050505')).toBe('#FFFFFF')
    expect(contrastRatio(getAccessibleTextColor('#409EFF'), '#409EFF')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(getAccessibleTextColor('#FFFFFF'), '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
  })

  test('normalizes invalid primary colors instead of keeping stale derivatives', () => {
    expect(normalizePrimaryColor('red', '#51CF66')).toBe('#51CF66')
    expect(normalizePrimaryColor('#fff', '#51CF66')).toBe('#51CF66')
    expect(normalizePrimaryColor('', '#51CF66')).toBe('#51CF66')
    expect(normalizePrimaryColor('#aabbcc', '#51CF66')).toBe('#AABBCC')
    expect(normalizeThemeAppearance({ preset: 'nature', primaryColor: 'red' }).primaryColor).toBe('#51CF66')
  })

  test.each(THEME_PRESET_LIST)('$id keeps content text tokens readable', (preset) => {
    const css = readTheme(preset.id)
    const background = readToken(css, '--color-bg-base')
    const textTokens = [
      '--color-text-primary',
      '--color-text-regular',
      '--color-text-secondary',
      '--color-text-placeholder',
      '--color-text-muted'
    ]

    expect(background).toBeTruthy()
    textTokens.forEach((token) => {
      const value = readToken(css, token)
      expect(value, `${preset.id} is missing ${token}`).toBeTruthy()
      expect(contrastRatio(value, background), `${preset.id} ${token}`).toBeGreaterThanOrEqual(4.5)
    })
  })

  test('themes do not force text color or typography through broad descendants', () => {
    expect(readTheme('vibrant')).not.toMatch(/\.header\s+\*/)
    expect(readTheme('nature')).not.toMatch(/\.header\s+\*/)
    expect(readTheme('professional')).not.toMatch(/\[data-theme="professional"\]\s+\*/)
  })

  test('shared compatibility layer honors reduced motion preferences', () => {
    const compatibility = readFileSync(resolve(themesDirectory, 'theme-compat.css'), 'utf8')
    expect(compatibility).toContain('@media (prefers-reduced-motion: reduce)')
  })

  test('theme-components owns shared layout shell density for all themes', () => {
    const components = readFileSync(resolve(themesDirectory, 'theme-components.css'), 'utf8')
    // 布局/密度必须在 [data-theme] 共享壳，禁止只写在 kacon
    expect(components).toContain('[data-theme] .sidebar-menu')
    expect(components).toContain('[data-theme] .app-header')
    expect(components).toContain('[data-theme] .icon-button')
    expect(components).toContain('[data-theme] .user-info')
    expect(components).toContain('--shell-menu-icon-opacity')
    expect(components).toContain('[data-theme] .el-dropdown-menu')
    expect(components).toContain('[data-theme] .el-step__head.is-finish')
    expect(components).toContain('[data-theme] .el-tag--primary')
  })

  test('kacon keeps brand glass and does not solely own menu density', () => {
    const kacon = readTheme('kacon')
    expect(kacon).toContain('--kacon-glass-bg')
    expect(kacon).toContain('backdrop-filter')
    // 菜单水平内缩已上收到 theme-components
    expect(kacon).not.toMatch(/\[data-theme="kacon"\]\s+\.sidebar-menu\s*\{/)
    // 面包屑/表单标签/日期选中已上收
    expect(kacon).not.toMatch(/\[data-theme="kacon"\]\s+\.el-breadcrumb__inner/)
    expect(kacon).not.toMatch(/\[data-theme="kacon"\]\s+\.el-form-item__label/)
    expect(kacon).not.toMatch(/\[data-theme="kacon"\]\s+::-webkit-scrollbar/)
  })

  test('lazy themes load the final compatibility layer after their own CSS', () => {
    const finalCompatibility = readFileSync(resolve(themesDirectory, 'theme-compat-final.css'), 'utf8')
    const loader = readFileSync(resolve(process.cwd(), 'src/utils/themeLoader.js'), 'utf8')
    const main = readFileSync(resolve(process.cwd(), 'src/main.js'), 'utf8')

    // theme-compat 由 main 静态引入；final 仅作后加载钩子，禁止重复 @import
    expect(main).toContain('theme-compat.css')
    expect(finalCompatibility).not.toContain("@import './theme-compat.css';")
    expect(loader).toContain('.then(() => ensureFinalCompatibilityCss())')
  })

  test('startup mounts even when theme initialization rejects', () => {
    const main = readFileSync(resolve(process.cwd(), 'src/main.js'), 'utf8')

    expect(main).toMatch(/themeReady\s*\.catch\([\s\S]*?\)\s*\.finally\(/)
  })
})
