/**
 * useDebounce.js
 * @description 通用防抖 composable，适用于搜索框等高频输入场景
 * @date 2026-04-18
 * @version 1.0.0
 */

import { ref, watch } from 'vue'

/**
 * 对 ref 值进行防抖处理
 * 
 * @param {import('vue').Ref} source 源 ref
 * @param {number} delay 防抖延迟(ms)，默认 300
 * @returns {import('vue').Ref} 防抖后的 ref
 */
export function useDebouncedRef(source, delay = 300) {
  const debounced = ref(source.value)
  let timer = null

  watch(source, (val) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      debounced.value = val
    }, delay)
  })

  return debounced
}

/**
 * 对函数进行防抖包装
 * 
 * @param {Function} fn 要防抖的函数
 * @param {number} delay 防抖延迟(ms)，默认 300
 * @returns {Function} 防抖后的函数
 */
export function useDebounceFn(fn, delay = 300) {
  let timer = null

  return (...args) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      fn(...args)
    }, delay)
  }
}
