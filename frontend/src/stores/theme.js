/**
 * theme.js
 * @description 状态管理文件 - 扩展支持多主题预设，支持数据库持久化
 * @date 2025-08-27
 * @version 3.0.0
 */

import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { userApi } from '@/api/user'
import logger from '../utils/logger'
import {
  DEFAULT_THEME_SETTINGS,
  THEME_PRESET_LIST,
  THEME_PRESETS,
  getThemePreset,
  normalizeThemeAppearance
} from '@/config/themePresets'

export const useThemeStore = defineStore('theme', () => {
  // 主题设置 - 默认值
  const defaultAppearance = { ...DEFAULT_THEME_SETTINGS }

  // 从 localStorage 加载主题设置（作为初始值）
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

  // 主题设置
  const appearance = ref(getLocalTheme())

  // 是否已从服务器加载
  const isLoaded = ref(false)

  // 记录已加载主题的用户标识（替代 window.__themeLoadedFor）
  const loadedForUser = ref(null)

  // 系统主题监听器清理函数
  let _cleanupSystemThemeListener = null

  // 从服务器加载主题设置
  const loadThemeFromServer = async () => {
    try {
      const response = await userApi.getTheme()

      // 拦截器已解包，response.data 就是主题数据
      if (response.data) {
        // 数据库的主题是权威来源，覆盖localStorage
        appearance.value = normalizeThemeAppearance(response.data)
        isLoaded.value = true

        // 更新 localStorage，保持同步
        try {
          localStorage.setItem('theme_settings', JSON.stringify(appearance.value))
        } catch (error) {
          logger.error('同步主题到本地失败:', error)
        }

        // 应用从数据库加载的主题
        applyTheme()
      }
    } catch (error) {
      logger.error('从数据库加载主题失败:', error.message)
      // 如果从服务器加载失败，使用本地缓存的主题
      appearance.value = getLocalTheme()
      applyTheme()
    }
  }

  // 保存主题设置到服务器
  const saveThemeToServer = async (themeData) => {
    try {
      await userApi.updateTheme(normalizeThemeAppearance(themeData))
    } catch (error) {
      logger.error('保存主题设置失败:', error.message)
      throw error
    }
  }

  // 当前主题模式
  const currentTheme = computed(() => {
    if (appearance.value.theme === 'system') {
      // 跟随系统主题
      if (typeof window === 'undefined') {
        return getThemePreset(appearance.value.preset).mode
      }
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return appearance.value.theme
  })

  // 是否为深色主题
  const isDark = computed(() => currentTheme.value === 'dark')

  // 从 hex 颜色生成 Element Plus 衍生色
  const generatePrimaryDerivatives = (hex) => {
    // 解析 hex 为 RGB
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)

    // 与白色混合（light）或与黑色混合（dark）
    const mix = (color, target, weight) => {
      return Math.round(color + (target - color) * weight)
    }
    const toHex = (rv, gv, bv) =>
      `#${[rv, gv, bv].map(c => c.toString(16).padStart(2, '0')).join('')}`

    return {
      '--el-color-primary-light-3': toHex(mix(r, 255, 0.3), mix(g, 255, 0.3), mix(b, 255, 0.3)),
      '--el-color-primary-light-5': toHex(mix(r, 255, 0.5), mix(g, 255, 0.5), mix(b, 255, 0.5)),
      '--el-color-primary-light-7': toHex(mix(r, 255, 0.7), mix(g, 255, 0.7), mix(b, 255, 0.7)),
      '--el-color-primary-light-8': toHex(mix(r, 255, 0.8), mix(g, 255, 0.8), mix(b, 255, 0.8)),
      '--el-color-primary-light-9': toHex(mix(r, 255, 0.9), mix(g, 255, 0.9), mix(b, 255, 0.9)),
      '--el-color-primary-dark-2': toHex(mix(r, 0, 0.2), mix(g, 0, 0.2), mix(b, 0, 0.2)),
    }
  }

  // 应用主题到DOM
  const applyTheme = () => {
    if (typeof document === 'undefined') return

    appearance.value = normalizeThemeAppearance(appearance.value)
    const html = document.documentElement

    // 移除所有主题类
    html.classList.remove('light', 'dark')

    // 添加当前主题类
    html.classList.add(currentTheme.value)

    // 设置主题预设的data属性
    html.setAttribute('data-theme', appearance.value.preset)

    // 设置CSS变量
    const primaryColor = appearance.value.primaryColor
    html.style.setProperty('--el-color-primary', primaryColor)
    html.style.setProperty('--font-size-base', `${appearance.value.fontSize}px`)
    html.style.setProperty('--el-font-size-base', `${appearance.value.fontSize}px`)

    // 生成并应用主色衍生色，确保按钮/标签等组件颜色协调
    if (primaryColor && /^#[0-9a-fA-F]{6}$/.test(primaryColor)) {
      const derivatives = generatePrimaryDerivatives(primaryColor)
      Object.entries(derivatives).forEach(([key, value]) => {
        html.style.setProperty(key, value)
      })
    }
  }

  // 应用主题预设
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

  // 获取当前预设信息
  const currentPreset = computed(() => {
    return getThemePreset(appearance.value.preset)
  })

  // 更新主题设置
  const updateAppearance = async (newAppearance) => {
    appearance.value = normalizeThemeAppearance({ ...appearance.value, ...newAppearance })
    applyTheme()

    // 立即保存到 localStorage（作为备份）
    try {
      localStorage.setItem('theme_settings', JSON.stringify(appearance.value))
    } catch (error) {
      logger.error('保存本地主题失败:', error)
    }

    // 保存到数据库（权威来源，用于跨设备同步）
    try {
      await saveThemeToServer(appearance.value)
      return true
    } catch (error) {
      logger.error('保存主题到数据库失败:', error)
      return false
    }
  }

  // 切换主题模式
  const toggleTheme = () => {
    const newTheme = currentTheme.value === 'light' ? 'dark' : 'light'
    updateAppearance({ theme: newTheme })
  }

  // 重置主题设置
  const resetTheme = () => {
    updateAppearance({ ...defaultAppearance })
  }

  // 监听系统主题变化
  const setupSystemThemeListener = () => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemThemeChange = () => {
      if (appearance.value.theme === 'system') {
        applyTheme()
      }
    }

    mediaQuery.addEventListener('change', handleSystemThemeChange)

    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange)
    }
  }

  // 初始化主题（仅应用本地主题，不加载服务器数据）
  const initTheme = () => {
    applyTheme()
    _cleanupSystemThemeListener = setupSystemThemeListener()
  }

  // 监听主题变化
  watch(
    () => appearance.value.theme,
    () => {
      applyTheme()
    },
    { immediate: false }
  )

  return {
    // 状态
    appearance,
    currentTheme,
    currentPreset,
    isDark,
    isLoaded,

    // 方法
    updateAppearance,
    toggleTheme,
    resetTheme,
    initTheme,
    applyTheme,
    applyPreset,
    loadThemeFromServer,
    saveThemeToServer,
    loadedForUser,

    // 主题预设列表
    themePresets: THEME_PRESETS,
    themePresetList: THEME_PRESET_LIST
  }
})
