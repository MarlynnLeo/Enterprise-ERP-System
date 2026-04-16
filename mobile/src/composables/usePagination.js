/**
 * usePagination.js
 * @description Vue 3 Composable，用于处理标准的 Vant 列表分页和下拉刷新逻辑
 * @date 2026-04-15
 */
import { ref } from 'vue'
import { showToast } from 'vant'

export function usePagination(fetchDataFn, options = {}) {
  const { immediate = true, initPageSize = 20 } = options

  const list = ref([])
  const loading = ref(false)
  const finished = ref(false)
  const refreshing = ref(false)
  const page = ref(1)
  const pageSize = ref(initPageSize)

  const loadData = async (extraParams = {}) => {
    try {
      if (refreshing.value) {
        list.value = []
        refreshing.value = false
      }

      const params = {
        page: page.value,
        limit: pageSize.value,
        ...extraParams
      }

      const res = await fetchDataFn(params)

      // 适配后端的响应结构 (有时数据在 res.data, 有时已经是裸数据数组, 需要兼容)
      let newData = []
      let total = 0

      if (res && res.data && Array.isArray(res.data.items)) {
        newData = res.data.items
        total = res.data.total
      } else if (res && Array.isArray(res.items)) {
        newData = res.items
        total = res.total
      } else if (Array.isArray(res)) {
        newData = res
        total = res.length
      }

      list.value = [...list.value, ...newData]

      if (list.value.length >= total || newData.length < pageSize.value) {
        finished.value = true
      } else {
        page.value++
      }
    } catch (error) {
      console.error('加载列表失败:', error)
      showToast('加载数据失败')
      finished.value = true
    } finally {
      loading.value = false
    }
  }

  const onRefresh = async (extraParams = {}) => {
    refreshing.value = true
    finished.value = false
    loading.value = true
    page.value = 1
    await loadData(extraParams)
  }

  const onLoad = async (extraParams = {}) => {
    await loadData(extraParams)
  }

  if (immediate) {
    onLoad()
  }

  return {
    list,
    loading,
    finished,
    refreshing,
    page,
    pageSize,
    onLoad,
    onRefresh
  }
}
