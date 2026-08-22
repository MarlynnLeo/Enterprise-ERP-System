/**
 * index.js
 * @description 应用程序入口文件
  * @date 2025-08-27
 * @version 1.0.0
 */

import { createI18n } from 'vue-i18n'
import zhCN from './zhCN'
import en from './en'
import ko from './ko'
import { getBrowserLanguage } from '@/utils/language'
import { compileI18nMessage } from './cspSafeMessageCompiler'

// 从localStorage获取保存的语言，如果没有则使用浏览器语言
const savedLanguage = localStorage.getItem('language') || getBrowserLanguage()

const i18n = createI18n({
  legacy: false, // 使用 Composition API 模式
  locale: savedLanguage,
  fallbackLocale: 'zh-CN',
  // 生产 CSP 禁止 unsafe-eval；避免 vue-i18n 默认 new Function 编译消息
  messageCompiler: compileI18nMessage,
  messages: {
    'zh-CN': zhCN,
    'en': en,
    'ko': ko
  }
})

export default i18n
