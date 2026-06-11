/**
 * language.js
 * @description 浏览器语言检测公共函数
 * @date 2025-08-27
 * @version 1.0.0
 */

/**
 * 获取浏览器语言偏好，映射为应用支持的语言代码
 * @returns {'zh-CN' | 'ko' | 'en'} 语言代码
 */
export function getBrowserLanguage() {
  const language = navigator.language || navigator.userLanguage
  if (language.includes('zh')) {
    return 'zh-CN'
  } else if (language.includes('ko')) {
    return 'ko'
  }
  return 'en'
}
