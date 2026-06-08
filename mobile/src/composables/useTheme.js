/**
 * 主题管理 Composable
 * @description 通过 html[data-theme] 切换主题，所有样式通过 CSS 变量驱动
 * @version 2.0.0
 */

import { ref, computed } from 'vue'
import { themes, defaultThemeName, getTheme } from '@/config/themes'
import api from '@/api'
import { extractApiData } from '@/utils/apiHelper'

const STORAGE_KEYS = Object.freeze({
  themeSettings: 'theme_settings'
})

const THEME_MODES = Object.freeze(['light', 'dark', 'system'])
const DEFAULT_FONT_SIZE = 14

const safeParseJSON = (value) => {
  if (!value || value === 'undefined' || value === 'null') return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

const isThemeName = (themeName) => themes.some((theme) => theme.name === themeName)

const getPresetMode = (themeName) => (getTheme(themeName).isDark ? 'dark' : 'light')

const normalizeFontSize = (value) => {
  const fontSize = Number(value)
  if (!Number.isFinite(fontSize)) {
    return DEFAULT_FONT_SIZE
  }

  return Math.min(18, Math.max(12, Math.round(fontSize)))
}

const readStoredThemeName = () => {
  const settings = safeParseJSON(localStorage.getItem(STORAGE_KEYS.themeSettings))
  if (isThemeName(settings?.preset)) return settings.preset
  if (isThemeName(settings?.theme)) return settings.theme

  return defaultThemeName
}

const buildThemeSettings = (themeName, sourceSettings = {}) => {
  const source = sourceSettings && typeof sourceSettings === 'object' ? sourceSettings : {}
  const theme = getTheme(themeName || source.preset || source.theme)
  const previous = safeParseJSON(localStorage.getItem(STORAGE_KEYS.themeSettings))
  const sourceMode = THEME_MODES.includes(source.theme) ? source.theme : null

  return {
    theme: sourceMode || getPresetMode(theme.name),
    preset: theme.name,
    primaryColor: theme.preview?.primary || previous?.primaryColor || '#00796B',
    fontSize: normalizeFontSize(source.fontSize ?? previous?.fontSize)
  }
}

const persistTheme = (themeName, settings = buildThemeSettings(themeName)) => {
  localStorage.setItem(STORAGE_KEYS.themeSettings, JSON.stringify(settings))
}

// 全局主题状态
const currentThemeName = ref(getTheme(readStoredThemeName()).name)

/**
 * 应用主题到 DOM
 * @param {string} themeName 主题名称
 */
const applyThemeToDOM = (themeName, sourceSettings) => {
  const theme = getTheme(themeName)
  const settings = buildThemeSettings(theme.name, sourceSettings)
  const root = document.documentElement

  root.setAttribute('data-theme', theme.dataTheme)
  root.classList.remove('light', 'dark')
  root.classList.add(settings.theme === 'dark' ? 'dark' : 'light')
  root.style.setProperty('--font-size-base', `${settings.fontSize}px`)
}

/**
 * 主题管理 Hook
 */
export const useTheme = () => {
  // 切换主题
  const setTheme = async (themeName, options = {}) => {
    const { syncServer = true, settings: sourceSettings } = options
    const theme = getTheme(themeName || sourceSettings?.preset || sourceSettings?.theme)
    const settings = buildThemeSettings(theme.name, sourceSettings)
    currentThemeName.value = theme.name
    persistTheme(theme.name, settings)
    applyThemeToDOM(theme.name, settings)

    if (syncServer) {
      try {
        await api.post('/auth/theme', settings)
        return true
      } catch (error) {
        console.warn('[theme] Failed to sync theme settings:', error?.message || error)
        return false
      }
    }

    return true
  }

  // 当前主题配置
  const currentTheme = computed(() => getTheme(currentThemeName.value))

  // 所有可用主题
  const availableThemes = computed(() => themes)

  // 检查是否为暗色模式
  const isDark = computed(() => currentTheme.value?.isDark === true)

  return {
    currentTheme,
    currentThemeName,
    availableThemes,
    isDark,
    setTheme
  }
}

/**
 * 初始化主题（在 main.js 中调用）
 */
export const initTheme = () => {
  const storedSettings = safeParseJSON(localStorage.getItem(STORAGE_KEYS.themeSettings))
  const saved = getTheme(readStoredThemeName())
  currentThemeName.value = saved.name
  const settings = buildThemeSettings(saved.name, storedSettings)
  persistTheme(saved.name, settings)
  applyThemeToDOM(saved.name, settings)
}

export const loadThemeFromServer = async () => {
  try {
    const response = await api.get('/auth/theme')
    const serverSettings = extractApiData(response, {})
    const preset = serverSettings.preset || (isThemeName(serverSettings.theme) ? serverSettings.theme : defaultThemeName)
    await useTheme().setTheme(preset, { syncServer: false, settings: serverSettings })
    return true
  } catch (error) {
    console.warn('[theme] Failed to load server theme settings:', error?.message || error)
    return false
  }
}
