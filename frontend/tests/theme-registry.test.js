import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { THEME_PRESET_LIST } from '@/config/themePresets'
import { themes as mobileThemes } from '../../mobile/src/config/themes.js'

const require = createRequire(import.meta.url)
const { THEME_PRESETS: backendThemes } = require('../../backend/src/config/themeConfig.js')
const readCss = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
const readColor = (css, token) => css.match(new RegExp(`${token}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1]?.toUpperCase()

describe('theme registry consistency across clients and persistence', () => {
  test('every desktop theme exists on mobile and the server', () => {
    const ids = THEME_PRESET_LIST.map((theme) => theme.id).sort()
    expect(mobileThemes.map((theme) => theme.name).sort()).toEqual(ids)
    expect(Object.keys(backendThemes).sort()).toEqual(ids)
  })

  test.each(THEME_PRESET_LIST)('$id has consistent mode, primary color and stylesheet', (preset) => {
    const mobileTheme = mobileThemes.find((theme) => theme.name === preset.id)
    expect(mobileTheme.label).toBe(preset.name)
    expect(backendThemes[preset.id].name).toBe(preset.name)
    const pcCss = readCss(`../src/assets/themes/pc/${preset.id}.css`)
    const mobileCss = readCss(`../../mobile/src/styles/themes/${preset.id}.css`)
    expect(mobileTheme.isDark).toBe(preset.mode === 'dark')
    expect(backendThemes[preset.id].mode).toBe(preset.mode)
    expect(mobileTheme.preview.primary.toUpperCase()).toBe(preset.primaryColor.toUpperCase())
    if (preset.id !== 'kacon' || !process.env.DEFAULT_THEME_PRIMARY_COLOR) {
      expect(backendThemes[preset.id].primaryColor.toUpperCase()).toBe(preset.primaryColor.toUpperCase())
    }
    expect(readColor(pcCss, '--color-primary')).toBe(preset.primaryColor.toUpperCase())
    expect(readColor(mobileCss, '--color-primary')).toBe(preset.primaryColor.toUpperCase())
    expect(readColor(mobileCss, '--color-accent')).toBe(mobileTheme.preview.accent.toUpperCase())
    expect(readColor(mobileCss, '--bg-primary')).toBe(mobileTheme.preview.bg.toUpperCase())
  })

  test('renames the theme while preserving the persisted workspace identity', () => {
    const preset = THEME_PRESET_LIST.find((theme) => theme.id === 'workspace')
    expect(preset.name).toBe('经典主题')
    expect(preset.description).toBe('清晰紧凑的表格布局，适合日常业务操作')
    expect(mobileThemes.find((theme) => theme.name === 'workspace').description).toBe(preset.description)
  })

  test('mobile primary buttons consume the custom-color contrast token', () => {
    const mobileBase = readCss('../../mobile/src/styles/themes/_base.css')
    expect(mobileBase).toMatch(/--van-button-primary-color:\s*var\(--color-on-primary\)/)
  })
})
