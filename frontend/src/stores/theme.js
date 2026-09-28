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
  isThemePreset,
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
  let appearanceRevision = 0
  let serverLoadRevision = 0
  let sessionRevision = 0
  let appliedRevision = 0
  let pendingAppearance = null
  let hasUnsyncedChanges = false
  let saveQueue = Promise.resolve()
  let sessionRequests = new AbortController()
  let pendingUserLoad = null

  const saveThemeToServer = async (themeData) => {
    const settings = normalizeThemeAppearance(themeData)
    const session = sessionRevision
    const signal = sessionRequests.signal
    // Serialize writes: an older request must never finish after a newer save.
    const task = saveQueue.then(async () => {
      if (session !== sessionRevision) return false
      await userApi.updateTheme(settings, { signal })
      return session === sessionRevision
    })
    saveQueue = task.catch(() => {})
    try {
      return await task
    } catch (error) {
      if (session !== sessionRevision) return false
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

    const lightTarget = isDark.value ? 0 : 255
    const darkTarget = isDark.value ? 255 : 0

    const mix = (color, target, weight) => Math.round(color + (target - color) * weight)
    const toHex = (rv, gv, bv) =>
      `#${[rv, gv, bv].map((c) => c.toString(16).padStart(2, '0')).join('')}`

    const light3 = toHex(mix(r, lightTarget, 0.3), mix(g, lightTarget, 0.3), mix(b, lightTarget, 0.3))
    const light5 = toHex(mix(r, lightTarget, 0.5), mix(g, lightTarget, 0.5), mix(b, lightTarget, 0.5))
    const light7 = toHex(mix(r, lightTarget, 0.7), mix(g, lightTarget, 0.7), mix(b, lightTarget, 0.7))
    const light8 = toHex(mix(r, lightTarget, 0.8), mix(g, lightTarget, 0.8), mix(b, lightTarget, 0.8))
    const light9 = toHex(mix(r, lightTarget, 0.9), mix(g, lightTarget, 0.9), mix(b, lightTarget, 0.9))
    const dark2 = toHex(mix(r, darkTarget, 0.2), mix(g, darkTarget, 0.2), mix(b, darkTarget, 0.2))

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
    html.style.setProperty('--font-size-base', `${appearance.value.fontSize}px`)
    html.style.setProperty('--el-font-size-base', `${appearance.value.fontSize}px`)

    const primaryOverrides = {
      '--color-primary': primaryColor,
      '--el-color-primary': primaryColor,
      '--color-on-primary': getAccessibleTextColor(primaryColor),
      ...generatePrimaryDerivatives(primaryColor)
    }
    const isCustomColor = primaryColor.toUpperCase() !== getThemePreset(appearance.value.preset).primaryColor.toUpperCase()
    Object.entries(primaryOverrides).forEach(([key, value]) => {
      // Preset palettes own their color ramps, especially the dark theme surfaces.
      if (isCustomColor) html.style.setProperty(key, value)
      else html.style.removeProperty(key)
    })

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

  const persistLocalTheme = (settings) => {
    try {
      localStorage.setItem('theme_settings', JSON.stringify(settings))
    } catch (error) {
      logger.error('保存本地主题失败:', error)
    }
  }

  /** Commit the state and DOM together only after the target palette is ready. */
  const commitAppearance = async (settings, isCurrent) => {
    try {
      await ensureThemeCss(settings.preset)
    } catch (error) {
      logger.error('主题样式加载失败:', error)
      return false
    }
    if (!isCurrent()) return false
    appearance.value = settings
    appliedRevision++
    applyTheme()
    return true
  }

  const loadThemeFromServer = async () => {
    const revision = appearanceRevision
    const load = ++serverLoadRevision
    const session = sessionRevision
    const signal = sessionRequests.signal
    const isCurrent = () => revision === appearanceRevision && load === serverLoadRevision && session === sessionRevision
    try {
      await saveQueue
      if (!isCurrent() || pendingAppearance || hasUnsyncedChanges) return false
      const response = await userApi.getTheme({ signal })
      if (!isCurrent()) return false
      const next = normalizeThemeAppearance(response.data)
      if (!await commitAppearance(next, isCurrent)) return false
      isLoaded.value = true
      persistLocalTheme(next)
      return true
    } catch (error) {
      if (session !== sessionRevision) return false
      logger.error('从数据库加载主题失败:', error.message)
      return false
    }
  }

  const currentPreset = computed(() => getThemePreset(appearance.value.preset))

  const loadThemeForUser = (userId) => {
    if (userId == null) return Promise.resolve(false)
    if (isLoaded.value && loadedForUser.value === userId) return Promise.resolve(true)
    if (pendingUserLoad?.userId === userId) return pendingUserLoad.promise
    const request = { userId, session: sessionRevision, promise: null }
    request.promise = loadThemeFromServer().then((loaded) => {
      if (request.session !== sessionRevision) return false
      if (loaded) loadedForUser.value = userId
      return loaded
    }).finally(() => {
      if (pendingUserLoad === request) pendingUserLoad = null
    })
    pendingUserLoad = request
    return request.promise
  }

  const updateAppearance = async (newAppearance) => {
    const next = normalizeThemeAppearance({ ...(pendingAppearance || appearance.value), ...newAppearance })
    const revision = ++appearanceRevision
    pendingAppearance = next
    const applied = await commitAppearance(next, () => revision === appearanceRevision)
    if (revision === appearanceRevision) pendingAppearance = null
    if (!applied) return false
    const appliedVersion = appliedRevision
    persistLocalTheme(next)
    hasUnsyncedChanges = true

    try {
      const synced = await saveThemeToServer(next)
      if (synced && appliedVersion === appliedRevision) hasUnsyncedChanges = false
      return synced
    } catch (error) {
      logger.error('保存主题到数据库失败:', error)
      return false
    }
  }

  const applyPreset = async (presetId) => {
    if (!isThemePreset(presetId)) {
      logger.warn(`主题预设 "${presetId}" 不存在`)
      return false
    }

    const preset = THEME_PRESETS[presetId]
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
    return updateAppearance({ ...defaultAppearance })
  }

  const initTheme = async () => {
    const revision = ++appearanceRevision
    const isCurrent = () => revision === appearanceRevision
    if (!await commitAppearance(appearance.value, isCurrent) && isCurrent()) {
      // The default palette is bundled at startup and remains available offline.
      appearance.value = { ...defaultAppearance }
      applyTheme()
    }
  }

  const resetForSession = () => {
    sessionRequests.abort()
    sessionRequests = new AbortController()
    saveQueue = Promise.resolve()
    pendingUserLoad = null
    sessionRevision++
    appearanceRevision++
    serverLoadRevision++
    pendingAppearance = null
    hasUnsyncedChanges = false
    loadedForUser.value = null
    isLoaded.value = false
    appearance.value = { ...defaultAppearance }
    applyTheme()
    try {
      localStorage.removeItem('theme_settings')
    } catch (error) {
      logger.error('清除本地主题失败:', error)
    }
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
    resetForSession,
    initTheme,
    applyPreset,
    loadThemeFromServer,
    loadThemeForUser,
    loadedForUser,
    themePresets: THEME_PRESETS,
    themePresetList: THEME_PRESET_LIST
  }
})
