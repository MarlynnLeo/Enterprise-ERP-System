/**
 * language.js
 * @description 状态管理文件
  * @date 2025-08-27
 * @version 1.0.0
 */

import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { getPreferredLanguage } from '@/utils/language'

// Chinese is the default locale. Other Element Plus locale bundles are only
// downloaded when the user selects them.
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'

const elementLocaleLoaders = {
  'zh-CN': () => Promise.resolve(zhCn),
  en: () => import('element-plus/dist/locale/en.mjs').then((module) => module.default),
  ko: () => import('element-plus/dist/locale/ko.mjs').then((module) => module.default)
}

const elementLocaleCache = new Map([['zh-CN', zhCn]])

const loadElementLocale = async (langCode) => {
  if (elementLocaleCache.has(langCode)) return elementLocaleCache.get(langCode)

  const locale = await elementLocaleLoaders[langCode]()
  elementLocaleCache.set(langCode, locale)
  return locale
}

export const useLanguageStore = defineStore('language', () => {
  // 当前语言
  const currentLanguage = ref(getPreferredLanguage())
  let languageRequest = 0

  // Element Plus 语言配置
  const elementLocale = shallowRef(zhCn)

  // 支持的语言列表
  const supportedLanguages = [
    {
      code: 'zh-CN',
      name: '中文'
    },
    {
      code: 'en',
      name: 'English'
    },
    {
      code: 'ko',
      name: '한국어'
    }
  ]

  // 初始化语言设置
  const initLanguage = () => {
    return setLanguage(getPreferredLanguage())
  }

  // 设置语言
  const setLanguage = async (langCode) => {
    const language = supportedLanguages.find(lang => lang.code === langCode)
    if (!language) return false

    const request = ++languageRequest
    const loadedLocale = await loadElementLocale(langCode)
    if (request !== languageRequest) return false
    elementLocale.value = loadedLocale
    currentLanguage.value = langCode
    try { localStorage.setItem('language', langCode) } catch {
      // The active language still works when persistence is unavailable.
    }

    // 更新 HTML lang 属性
    document.documentElement.lang = langCode
    return true
  }

  // 获取当前语言信息
  const getCurrentLanguageInfo = () => {
    return supportedLanguages.find(lang => lang.code === currentLanguage.value)
  }

  // 获取语言名称
  const getLanguageName = (langCode) => {
    const language = supportedLanguages.find(lang => lang.code === langCode)
    return language ? language.name : langCode
  }

  return {
    currentLanguage,
    elementLocale,
    supportedLanguages,
    initLanguage,
    setLanguage,
    getCurrentLanguageInfo,
    getLanguageName
  }
})
