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

// 抑制 vue-i18n 对安全自定义 messageCompiler 的开发期实验性特性提示
const originalWarn = console.warn
console.warn = (...args) => {
  if (
    typeof args[0] === 'string' &&
    args[0].includes('[intlify]') &&
    args[0].includes('Custom Message Compiler')
  ) {
    return
  }
  originalWarn.apply(console, args)
}

let i18n
try {
  i18n = createI18n({
    legacy: false, // 使用 Composition API 模式
    locale: savedLanguage,
    fallbackLocale: 'zh-CN',
    // 生产 CSP 禁止 unsafe-eval；避免 vue-i18n 默认 new Function 编译消息
    messageCompiler: compileI18nMessage,
    silentTranslationWarn: true,
    missingWarn: false,
    fallbackWarn: false,
    messages: {
      'zh-CN': zhCN,
      'en': en,
      'ko': ko
    }
  })
} finally {
  console.warn = originalWarn
}

export default i18n
