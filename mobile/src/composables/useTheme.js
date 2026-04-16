/**
 * 主题管理 Composable
 * @description 通过 html[data-theme] 切换主题，所有样式通过 CSS 变量驱动
 * @version 2.0.0
 */

import { ref, computed } from 'vue'
import { themes, defaultThemeName, getTheme } from '@/config/themes'

// 全局主题状态
const currentThemeName = ref(localStorage.getItem('theme') || defaultThemeName)

/**
 * 应用主题到 DOM
 * @param {string} themeName 主题名称
 */
const applyThemeToDOM = (themeName) => {
  const theme = getTheme(themeName)
  const root = document.documentElement

  if (theme.dataTheme) {
    // 非默认主题 — 设置 data-theme 属性激活对应 CSS 选择器
    root.setAttribute('data-theme', theme.dataTheme)
  } else {
    // 默认主题 — 移除 data-theme 属性
    root.removeAttribute('data-theme')
  }
}

/**
 * 主题管理 Hook
 */
export const useTheme = () => {
  // 切换主题
  const setTheme = (themeName) => {
    const theme = getTheme(themeName)
    if (theme) {
      currentThemeName.value = theme.name
      localStorage.setItem('theme', theme.name)
      applyThemeToDOM(theme.name)
    }
  }

  // 当前主题配置
  const currentTheme = computed(() => getTheme(currentThemeName.value))

  // 所有可用主题
  const availableThemes = computed(() => themes)

  // 检查是否为暗色模式
  const isDark = computed(() => currentThemeName.value === 'dark')

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
  const saved = localStorage.getItem('theme') || defaultThemeName
  currentThemeName.value = saved
  applyThemeToDOM(saved)
}
