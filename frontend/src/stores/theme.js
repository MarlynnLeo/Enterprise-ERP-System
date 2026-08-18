/**
 * theme.js
 * @description 多主题预设 + 数据库持久化；主题 CSS 按需加载
 * @version 3.1.0
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { userApi } from '@/api/user'
import logger from '../utils/logger'
import {
  DEFAULT_THEME_SETTINGS,
  DEFAULT_THEME_PRESET_ID,
  THEME_PRESET_LIST,
  THEME_PRESETS,
  getAccessibleTextColor,
  getThemePreset,
  normalizeThemeAppearance
} from '@/config/themePresets'
import { ensureThemeCss } from '@/utils/themeLoader'

export const useThemeStore = defineStore('theme', () => {
  const defaultAppearance = { ...DEFAULT_THEME_SETTINGS }

  const getLocalTheme = () => {
    try {
      const saved = localStorage.getItem('theme_settings')
      if (saved) {
        return normalizeThemeAppearance(JSON.parse(saved))
      }
    } catch (error) {
      logger.error('加载本地主题失败:', error)
    }
    return { ...defaultAppearance }
  }

  const appearance = ref(getLocalTheme())
  const isLoaded = ref(false)
  const loadedForUser = ref(null)

  const saveThemeToServer = async (themeData) => {
    try {
      await userApi.updateTheme(normalizeThemeAppearance(themeData))
    } catch (error) {
      logger.error('保存主题设置失败:', error.message)
      throw error
    }
  }

  const currentTheme = computed(() => {
    return getThemePreset(appearance.value.preset).mode
  })

  const isDark = computed(() => currentTheme.value === 'dark')

  const generatePrimaryDerivatives = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)

    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    const lightTarget = luminance > 0.85 ? 0 : 255

    const mix = (color, target, weight) => Math.round(color + (target - color) * weight)
    const toHex = (rv, gv, bv) =>
      `#${[rv, gv, bv].map((c) => c.toString(16).padStart(2, '0')).join('')}`

    const light3 = toHex(mix(r, lightTarget, 0.3), mix(g, lightTarget, 0.3), mix(b, lightTarget, 0.3))
    const light5 = toHex(mix(r, lightTarget, 0.5), mix(g, lightTarget, 0.5), mix(b, lightTarget, 0.5))
    const light7 = toHex(mix(r, lightTarget, 0.7), mix(g, lightTarget, 0.7), mix(b, lightTarget, 0.7))
    const light8 = toHex(mix(r, lightTarget, 0.8), mix(g, lightTarget, 0.8), mix(b, lightTarget, 0.8))
    const light9 = toHex(mix(r, lightTarget, 0.9), mix(g, lightTarget, 0.9), mix(b, lightTarget, 0.9))
    const dark2 = toHex(mix(r, 0, 0.2), mix(g, 0, 0.2), mix(b, 0, 0.2))

    return {
      '--color-primary-light-3': light3,
      '--color-primary-light-5': light5,
      '--color-primary-light-7': light7,
      '--color-primary-light-8': light8,
      '--color-primary-light-9': light9,
      '--color-primary-dark-2': dark2,
      '--el-color-primary-light-3': light3,
      '--el-color-primary-light-5': light5,
      '--el-color-primary-light-7': light7,
      '--el-color-primary-light-8': light8,
      '--el-color-primary-light-9': light9,
      '--el-color-primary-dark-2': dark2
    }
  }

  /** 同步写 DOM class / CSS 变量（假定主题 CSS 已或即将就绪） */
  const applyTheme = () => {
    if (typeof document === 'undefined') return

    appearance.value = normalizeThemeAppearance(appearance.value)
    const html = document.documentElement

    html.classList.remove('light', 'dark')
    html.classList.add(currentTheme.value)
    html.setAttribute('data-theme', appearance.value.preset)

    const primaryColor = appearance.value.primaryColor
    html.style.setProperty('--color-primary', primaryColor)
    html.style.setProperty('--el-color-primary', primaryColor)
    html.style.setProperty('--color-on-primary', getAccessibleTextColor(primaryColor))
    html.style.setProperty('--font-size-base', `${appearance.value.fontSize}px`)
    html.style.setProperty('--el-font-size-base', `${appearance.value.fontSize}px`)

    if (primaryColor && /^#[0-9a-fA-F]{6}$/.test(primaryColor)) {
      const derivatives = generatePrimaryDerivatives(primaryColor)
      Object.entries(derivatives).forEach(([key, value]) => {
        html.style.setProperty(key, value)
      })
    }

    const computedStyle = window.getComputedStyle(html)
    const semanticColors = {
      '--color-on-success': '--color-success',
      '--color-on-warning': '--color-warning',
      '--color-on-danger': '--color-danger',
      '--color-on-info': '--color-info'
    }

    Object.entries(semanticColors).forEach(([textToken, backgroundToken]) => {
      const background = computedStyle.getPropertyValue(backgroundToken).trim()
      html.style.setProperty(textToken, getAccessibleTextColor(background))
    })
  }

  /** 先加载主题 CSS 再应用，避免切换 FOUC */
  const applyThemeWithCss = async (presetId) => {
    const target = presetId || appearance.value.preset
    try {
      await ensureThemeCss(target)
    } catch (error) {
      logger.error('主题样式加载失败:', error)
    }
    applyTheme()
  }

  const loadThemeFromServer = async () => {
    try {
      const response = await userApi.getTheme()
      if (response.data) {
        appearance.value = normalizeThemeAppearance(response.data)
        isLoaded.value = true
        try {
          localStorage.setItem('theme_settings', JSON.stringify(appearance.value))
        } catch (error) {
          logger.error('同步主题到本地失败:', error)
        }
        await applyThemeWithCss(appearance.value.preset)
      }
    } catch (error) {
      logger.error('从数据库加载主题失败:', error.message)
      appearance.value = getLocalTheme()
      await applyThemeWithCss(appearance.value.preset)
    }
  }

  const currentPreset = computed(() => getThemePreset(appearance.value.preset))

  const updateAppearance = async (newAppearance) => {
    const next = normalizeThemeAppearance({ ...appearance.value, ...newAppearance })
    appearance.value = next

    try {
      await ensureThemeCss(next.preset)
    } catch (error) {
      logger.error('加载主题 CSS 失败:', error)
    }
    applyTheme()

    try {
      localStorage.setItem('theme_settings', JSON.stringify(appearance.value))
    } catch (error) {
      logger.error('保存本地主题失败:', error)
    }

    try {
      await saveThemeToServer(appearance.value)
      return true
    } catch (error) {
      logger.error('保存主题到数据库失败:', error)
      return false
    }
  }

  const applyPreset = async (presetId) => {
    const preset = THEME_PRESETS[presetId]
    if (!preset) {
      logger.warn(`主题预设 "${presetId}" 不存在`)
      return false
    }

    return updateAppearance({
      preset: preset.id,
      theme: preset.mode,
      primaryColor: preset.primaryColor
    })
  }

  const toggleTheme = () => {
    const presetId = currentTheme.value === 'light' ? 'dark' : DEFAULT_THEME_PRESET_ID
    return applyPreset(presetId)
  }

  const resetTheme = () => {
    updateAppearance({ ...defaultAppearance })
  }

  const initTheme = async () => {
    const preset = appearance.value.preset
    if (preset && preset !== 'kacon') {
      await ensureThemeCss(preset)
        .catch((error) => logger.error('初始主题 CSS 加载失败:', error))
    }
    applyTheme()
  }

  return {
    appearance,
    currentTheme,
    currentPreset,
    isDark,
    isLoaded,
    updateAppearance,
    toggleTheme,
    resetTheme,
    initTheme,
    applyTheme,
    applyThemeWithCss,
    applyPreset,
    loadThemeFromServer,
    saveThemeToServer,
    loadedForUser,
    themePresets: THEME_PRESETS,
    themePresetList: THEME_PRESET_LIST
  }
})
