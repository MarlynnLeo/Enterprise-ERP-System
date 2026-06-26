/**
 * useSafeTimer.js
 * @description 安全定时器 composable —— 组件卸载时自动清理所有 setTimeout/setInterval
 * @date 2026-06-22
 *
 * 用法:
 *   const { safeTimeout, safeInterval } = useSafeTimer()
 *   safeTimeout(() => { ... }, 200)
 *   safeInterval(() => { ... }, 5000)
 *   // 组件卸载时自动清理，无需手动 clearTimeout/clearInterval
 */

import { onBeforeUnmount } from 'vue'

export function useSafeTimer() {
  const timers = new Set()

  /**
   * 安全的 setTimeout —— 组件卸载时自动清理
   * @param {Function} fn - 回调函数
   * @param {number} delay - 延迟毫秒数
   * @returns {number} timer id
   */
  const safeTimeout = (fn, delay) => {
    const id = setTimeout(() => {
      timers.delete(id)
      fn()
    }, delay)
    timers.add(id)
    return id
  }

  /**
   * 安全的 setInterval —— 组件卸载时自动清理
   * @param {Function} fn - 回调函数
   * @param {number} interval - 间隔毫秒数
   * @returns {number} timer id
   */
  const safeInterval = (fn, interval) => {
    const id = setInterval(fn, interval)
    timers.add(id)
    return id
  }

  /**
   * 手动清除指定定时器
   * @param {number} id - timer id
   */
  const clearTimer = (id) => {
    clearTimeout(id)
    clearInterval(id)
    timers.delete(id)
  }

  onBeforeUnmount(() => {
    timers.forEach((id) => {
      clearTimeout(id)
      clearInterval(id)
    })
    timers.clear()
  })

  return { safeTimeout, safeInterval, clearTimer }
}
