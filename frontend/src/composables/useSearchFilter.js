/**
 * useSearchFilter.js
 * @description 通用搜索筛选 composable — 消除 ~50 个组件的搜索逻辑重复
 * @date 2026-06-22
 *
 * 用法:
 *   const { searchForm, searchLoading, handleSearch, handleReset } = useSearchFilter({
 *     defaultForm: { keyword: '', status: '' },
 *     onSearch: () => loadData(),
 *     debounceMs: 300
 *   })
 *
 *   <!-- 模板中 -->
 *   <el-input v-model="searchForm.keyword" @input="handleSearch" />
 *   <el-button @click="handleReset">重置</el-button>
 */

import { reactive, ref, onUnmounted } from 'vue'

/**
 * @param {Object} options
 * @param {Object} options.defaultForm - 搜索表单默认值
 * @param {Function} options.onSearch - 搜索回调（在防抖后触发）
 * @param {number} [options.debounceMs=300] - 防抖延迟（毫秒），0 表示不防抖
 * @param {Function} [options.onReset] - 重置回调（可选，默认调用 onSearch）
 */
export function useSearchFilter(options = {}) {
  const {
    defaultForm = {},
    onSearch,
    debounceMs = 300,
    onReset,
  } = options

  const searchForm = reactive({ ...defaultForm })
  const searchLoading = ref(false)
  let debounceTimer = null

  /** 执行搜索（带防抖） */
  const handleSearch = () => {
    if (debounceMs > 0) {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        onSearch?.()
      }, debounceMs)
    } else {
      onSearch?.()
    }
  }

  /** 立即搜索（不防抖） */
  const handleSearchImmediate = () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    onSearch?.()
  }

  /** 重置搜索条件 */
  const handleReset = () => {
    Object.keys(defaultForm).forEach((key) => {
      searchForm[key] = defaultForm[key]
    })
    if (onReset) {
      onReset()
    } else {
      handleSearchImmediate()
    }
  }

  /**
   * 获取非空搜索参数（用于传给 API）
   * @returns {Object} 过滤掉空字符串和 null/undefined 的参数
   */
  const getSearchParams = () => {
    const params = {}
    Object.entries(searchForm).forEach(([key, value]) => {
      if (value !== '' && value !== null && value !== undefined) {
        params[key] = value
      }
    })
    return params
  }

  // 组件卸载时清理防抖定时器
  onUnmounted(() => {
    if (debounceTimer) clearTimeout(debounceTimer)
  })

  return {
    searchForm,
    searchLoading,
    handleSearch,
    handleSearchImmediate,
    handleReset,
    getSearchParams,
  }
}
