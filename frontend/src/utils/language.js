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
  const language = String(navigator.language || navigator.userLanguage || '').toLowerCase()
  if (language.includes('zh')) {
    return 'zh-CN'
  } else if (language.includes('ko')) {
    return 'ko'
  }
  return 'en'
}

export function getPreferredLanguage() {
  try {
    const saved = localStorage.getItem('language')
    if (['zh-CN', 'en', 'ko'].includes(saved)) return saved
  } catch {
    // Storage can be disabled by browser privacy settings.
  }
  return getBrowserLanguage()
}
