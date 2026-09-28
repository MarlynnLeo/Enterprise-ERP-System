/**
 * 主题 CSS 按需加载，预设 ID 与主题注册表一致。
 * - 启动：theme-compat + kacon（main 静态）
 * - 其余：default / tech / business / vibrant / nature / dark / premium / professional / workspace
 * - 缓存 + 用户悬停时预取候选主题（低端/省流跳过）
 */

import {
  DEFAULT_THEME_PRESET_ID,
  THEME_PRESET_LIST,
  isThemePreset
} from '@/config/themePresets'

/** 与 themePresets 一一对应 */
const THEME_CSS_LOADERS = {
  default: () => import('@/assets/themes/pc/default.css'),
  tech: () => import('@/assets/themes/pc/tech.css'),
  business: () => import('@/assets/themes/pc/business.css'),
  vibrant: () => import('@/assets/themes/pc/vibrant.css'),
  nature: () => import('@/assets/themes/pc/nature.css'),
  dark: () => import('@/assets/themes/pc/dark.css'),
  premium: () => import('@/assets/themes/pc/premium.css'),
  professional: () => import('@/assets/themes/pc/professional.css'),
  workspace: () => import('@/assets/themes/pc/workspace.css'),
  // 默认主题：main 静态引入，避免首屏 FOUC
  kacon: () => Promise.resolve()
}

const loadedThemes = new Set(['kacon'])
/** @type {Map<string, Promise<void>>} */
const inflight = new Map()
export const ALL_THEME_IDS = Object.freeze(THEME_PRESET_LIST.map((p) => p.id))

/**
 * @param {string} presetId
 * @returns {Promise<string>}
 */
export async function ensureThemeCss(presetId) {
  const id = isThemePreset(presetId) ? presetId : DEFAULT_THEME_PRESET_ID

  if (loadedThemes.has(id)) return id

  if (inflight.has(id)) {
    await inflight.get(id)
    return id
  }

  const loader = THEME_CSS_LOADERS[id]
  if (!loader) {
    throw new Error(`[themeLoader] 主题 ${id} 缺少样式加载器`)
  }

  const task = loader()
    .then(() => {
      loadedThemes.add(id)
    })
    .catch((error) => {
      console.error(`[themeLoader] 加载主题失败: ${id}`, error)
      throw error
    })
    .finally(() => {
      inflight.delete(id)
    })

  inflight.set(id, task)
  await task
  return id
}

/**
 * 预取单个主题
 * @param {string} presetId
 */
export function prefetchThemeCss(presetId) {
  if (typeof window === 'undefined') return
  if (window.__ERP_PERF__?.saveData || window.__ERP_PERF__?.lowEnd) return

  const id = isThemePreset(presetId) ? presetId : ''
  if (!id || loadedThemes.has(id) || inflight.has(id)) return

  const run = () => {
    ensureThemeCss(id).catch(() => {})
  }

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 3000 })
  } else {
    setTimeout(run, 900)
  }
}

export function isThemeCssLoaded(presetId) {
  return loadedThemes.has(presetId)
}

export function getLoadedThemeIds() {
  return [...loadedThemes]
}
