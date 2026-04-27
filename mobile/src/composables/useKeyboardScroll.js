/**
 * useKeyboardScroll.js
 * @description 键盘弹出时自动滚动输入框到可视区域，防止软键盘遮挡
 * @date 2026-04-18
 * @version 1.0.0
 */

import { onMounted, onBeforeUnmount } from 'vue'

/**
 * 在页面中自动监听 input/textarea 的 focus 事件，
 * 当软键盘弹出时将当前聚焦元素滚动到可视区域
 * 
 * @param {Object} options 配置项
 * @param {number} options.delay 延迟滚动时间(ms)，默认 300
 * @param {string} options.behavior 滚动行为，默认 'smooth'
 * @param {string} options.block 滚动对齐方式，默认 'center'
 */
export function useKeyboardScroll(options = {}) {
  const { delay = 300, behavior = 'smooth', block = 'center' } = options

  let focusHandler = null
  let resizeHandler = null
  let activeElement = null

  // 输入框获得焦点时记录元素
  const handleFocus = (e) => {
    const tag = e.target.tagName?.toLowerCase()
    if (tag === 'input' || tag === 'textarea') {
      activeElement = e.target
      // 延迟等待键盘弹出后再滚动
      setTimeout(() => {
        if (activeElement && document.activeElement === activeElement) {
          activeElement.scrollIntoView({
            behavior,
            block,
            inline: 'nearest'
          })
        }
      }, delay)
    }
  }

  // 窗口大小变化时（键盘弹出/收起）重新定位
  const handleResize = () => {
    if (activeElement && document.activeElement === activeElement) {
      setTimeout(() => {
        activeElement.scrollIntoView({
          behavior,
          block,
          inline: 'nearest'
        })
      }, 100)
    }
  }

  // 失焦时清除记录
  const handleBlur = () => {
    activeElement = null
  }

  onMounted(() => {
    focusHandler = handleFocus
    resizeHandler = handleResize

    document.addEventListener('focusin', focusHandler, true)
    document.addEventListener('focusout', handleBlur, true)
    // visualViewport API 对 iOS 兼容性更好
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', resizeHandler)
    } else {
      window.addEventListener('resize', resizeHandler)
    }
  })

  onBeforeUnmount(() => {
    document.removeEventListener('focusin', focusHandler, true)
    document.removeEventListener('focusout', handleBlur, true)
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', resizeHandler)
    } else {
      window.removeEventListener('resize', resizeHandler)
    }
    activeElement = null
  })
}
