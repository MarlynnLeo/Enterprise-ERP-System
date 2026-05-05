/**
 * language.js
 * @description 状态管理文件
  * @date 2025-08-27
 * @version 1.0.0
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

import { ElMessage } from 'element-plus'

// Element Plus 语言包
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import en from 'element-plus/dist/locale/en.mjs'
import ko from 'element-plus/dist/locale/ko.mjs'

export const useLanguageStore = defineStore('language', () => {
  // 当前语言
  const currentLanguage = ref(localStorage.getItem('language') || 'zh-CN')
  
  // Element Plus 语言配置
  const elementLocale = ref(zhCn)
  
  // 支持的语言列表
  const supportedLanguages = [
    {
      code: 'zh-CN',
      name: '中文',
      elementLocale: zhCn
    },
    {
      code: 'en',
      name: 'English',
      elementLocale: en
    },
    {
      code: 'ko',
      name: '한국어',
      elementLocale: ko
    }
  ]

  // 获取浏览器语言
  const getBrowserLanguage = () => {
    const language = navigator.language || navigator.userLanguage
    if (language.includes('zh')) {
      return 'zh-CN'
    } else if (language.includes('ko')) {
      return 'ko'
    }
    return 'en'
  }

  // 初始化语言设置
  const initLanguage = () => {
    const savedLanguage = localStorage.getItem('language')
    if (!savedLanguage) {
      const browserLang = getBrowserLanguage()
      setLanguage(browserLang)
    } else {
      setLanguage(savedLanguage)
    }
  }

  // 设置语言
  const setLanguage = (langCode) => {
    const language = supportedLanguages.find(lang => lang.code === langCode)
    if (language) {
      currentLanguage.value = langCode
      elementLocale.value = language.elementLocale
      localStorage.setItem('language', langCode)
      
      // 更新 HTML lang 属性
      document.documentElement.lang = langCode
    }
  }

  // 切换语言
  const switchLanguage = (langCode) => {
    setLanguage(langCode)

    // 显示切换成功消息 - 使用固定文本，因为在store中无法使用useI18n
    const messages = {
      'zh-CN': '语言切换成功',
      'en': 'Language switched successfully',
      'ko': '언어가 성공적으로 변경되었습니다'
    }
    ElMessage.success(messages[langCode] || messages['zh-CN'])
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
    switchLanguage,
    getCurrentLanguageInfo,
    getLanguageName
  }
})
