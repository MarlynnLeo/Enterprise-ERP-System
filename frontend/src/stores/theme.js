/**
 * theme.js
 * @description 状态管理文件 - 扩展支持多主题预设，支持数据库持久化
 * @date 2025-08-27
 * @version 3.0.0
 */

import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { api } from '../services/api'
import { tokenManager } from '../utils/unifiedStorage'
import logger from '../utils/logger'

// 主题预设定义
const themePresets = {
  default: {
    id: 'default',
    name: '默认主题',
    primaryColor: '#409EFF',
    mode: 'light'
  },
  tech: {
    id: 'tech',
    name: '科技主题',
    primaryColor: '#00C3FF',
    mode: 'dark'
  },
  business: {
    id: 'business',
    name: '商务主题',
    primaryColor: '#2C3E50',
    mode: 'light'
  },
  vibrant: {
    id: 'vibrant',
    name: '活力主题',
    primaryColor: '#FF6B6B',
    mode: 'light'
  },
  nature: {
    id: 'nature',
    name: '自然主题',
    primaryColor: '#51CF66',
    mode: 'light'
  },
  dark: {
    id: 'dark',
    name: '深色主题',
    primaryColor: '#409EFF',
    mode: 'dark'
  },
  professional: {
    id: 'professional',
    name: '专业主题',
    primaryColor: '#34495E',
    mode: 'light'
  },
  kacon: {
    id: 'kacon',
    name: 'KACON品牌',
    primaryColor: '#00A896',
    mode: 'light'
  }
}

export const useThemeStore = defineStore('theme', () => {
  // 主题设置 - 默认值
  const defaultAppearance = {
    theme: 'light',
    preset: 'kacon',  // 全系统强制采用 KACON 品牌主视觉作为默认主题预设
    primaryColor: '#00A896', // KACON 品牌专属高定色（Teal）
    fontSize: 14
  }

  // 从 localStorage 加载主题设置（作为初始值）
  const getLocalTheme = () => {
    try {
      const saved = localStorage.getItem('theme_settings')
      if (saved) {
        return { ...defaultAppearance, ...JSON.parse(saved) }
      }
    } catch (error) {
      console.error('加载本地主题失败:', error)
    }
    return { ...defaultAppearance }
  }

  // 主题设置
  const appearance = ref(getLocalTheme())

  // 是否已从服务器加载
  const isLoaded = ref(false)

  // 从服务器加载主题设置
  const loadThemeFromServer = async () => {
    try {
      // 使用 tokenManager 获取 token，与 auth store 保持一致
      const token = tokenManager.getToken()
      if (!token || !tokenManager.isTokenValid()) {
        return
      }

      const response = await api.get('/auth/theme')

      // 拦截器已解包，response.data 就是主题数据
      if (response.data) {
        // 数据库的主题是权威来源，覆盖localStorage
        appearance.value = { ...defaultAppearance, ...response.data }
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
      // 使用 tokenManager 检查登录状态
      const token = tokenManager.getToken()
      if (!token || !tokenManager.isTokenValid()) {
        return
      }

      await api.post('/auth/theme', themeData)
    } catch (error) {
      logger.error('保存主题设置失败:', error.message)
      throw error
    }
  }

  // 当前主题模式
  const currentTheme = computed(() => {
    if (appearance.value.theme === 'system') {
      // 跟随系统主题
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return appearance.value.theme
  })

  // 是否为深色主题
  const isDark = computed(() => currentTheme.value === 'dark')

  // 应用主题到DOM
  const applyTheme = () => {
    const html = document.documentElement

    // 移除所有主题类
    html.classList.remove('light', 'dark')

    // 添加当前主题类
    html.classList.add(currentTheme.value)

    // 设置主题预设的data属性
    if (appearance.value.preset) {
      html.setAttribute('data-theme', appearance.value.preset)
    }

    // 设置CSS变量
    html.style.setProperty('--el-color-primary', appearance.value.primaryColor)
    html.style.setProperty('--font-size-base', `${appearance.value.fontSize}px`)
    html.style.setProperty('--el-font-size-base', `${appearance.value.fontSize}px`)
  }

  // 应用主题预设
  const applyPreset = (presetId) => {
    const preset = themePresets[presetId]
    if (!preset) {
      logger.warn(`主题预设 "${presetId}" 不存在`)
      return
    }

    updateAppearance({
      preset: preset.id,
      theme: preset.mode,
      primaryColor: preset.primaryColor
    })
  }

  // 获取当前预设信息
  const currentPreset = computed(() => {
    return themePresets[appearance.value.preset] || themePresets.default
  })

  // 更新主题设置
  const updateAppearance = async (newAppearance) => {
    appearance.value = { ...appearance.value, ...newAppearance }
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
    } catch (error) {
      logger.error('保存主题到数据库失败:', error)
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
    setupSystemThemeListener()
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

    // 主题预设列表
    themePresets
  }
})
