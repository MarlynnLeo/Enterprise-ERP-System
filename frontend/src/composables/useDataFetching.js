import { computed, getCurrentScope, onScopeDispose, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index'
import { parsePaginatedData } from '@/utils/responseParser'
import { clearAllRequestCaches } from '@/utils/requestOptimizer'

const errorText = (error, fallback) => {
  const detail = error?.response?.data
  return detail?.error?.message || (typeof detail?.error === 'string' && detail.error) ||
    detail?.message || error?.message || fallback
}

/**
 * Owns one page's query state. Request caching/deduplication belongs to the API
 * client, which sees the complete filters, authentication and cancellation data.
 */
export function usePaginatedFetching(apiFunction, options = {}) {
  const {
    immediate = false, defaultParams = {}, pageSize = 10,
    errorMessage = '数据获取失败', successMessage = null, transform,
  } = options
  const loading = ref(false)
  const data = ref([])
  const error = ref(null)
  const statistics = ref(null)
  const params = ref({ ...defaultParams })
  const lastUpdated = ref(null)
  const pagination = reactive({ current: 1, pageSize, total: 0 })
  let generation = 0
  let disposed = false

  if (getCurrentScope()) {
    onScopeDispose(() => { disposed = true; generation += 1 })
  }

  const fetchData = async (customParams = {}, showLoading = true, requestOptions = {}) => {
    if (disposed) return null
    const request = ++generation
    const current = () => !disposed && request === generation
    if (requestOptions === true || requestOptions?.force) clearAllRequestCaches()
    const query = {
      ...params.value,
      page: pagination.current, pageSize: pagination.pageSize, ...customParams,
    }
    loading.value = showLoading
    error.value = null
    try {
      // Invoke every logical query: the loader may read reactive filter values.
      const response = await apiFunction(query)
      const result = transform ? await transform(response) : response
      if (!current()) return null
      const responseLike = result?.data !== undefined ? result : { data: result }
      const parsed = parsePaginatedData(responseLike, { enableLog: false })
      data.value = Array.isArray(result) ? result : parsed.list
      pagination.total = Array.isArray(result) ? result.length : parsed.total
      statistics.value = parsed.statistics
      lastUpdated.value = new Date()
      if (successMessage) ElMessage.success(successMessage)
      return result
    } catch (failure) {
      if (current()) {
        error.value = failure
        ElMessage.error(errorText(failure, errorMessage))
      }
      return null
    } finally {
      if (current()) loading.value = false
    }
  }

  const updateParams = (next) => {
    const { page, pageSize: nextSize, ...filters } = next
    params.value = { ...params.value, ...filters }
    if (page !== undefined) pagination.current = page
    if (nextSize !== undefined) pagination.pageSize = nextSize
  }
  const handlePageChange = (page) => { pagination.current = page; return fetchData() }
  const handleSizeChange = (size) => {
    pagination.pageSize = size
    pagination.current = 1
    return fetchData()
  }
  const resetPagination = () => { pagination.current = 1; pagination.total = 0 }
  const refresh = () => fetchData({}, true, { force: true })

  if (immediate) void fetchData()
  return {
    loading, data, error, params, pagination, statistics, lastUpdated,
    hasData: computed(() => data.value.length > 0),
    isEmpty: computed(() => !loading.value && data.value.length === 0),
    fetchData, refresh, updateParams, handlePageChange, handleSizeChange, resetPagination,
  }
}

/** One submission owns validation, the write and its success notification. */
export function useFormSubmit(submitFunction, options = {}) {
  const { successMessage = '操作成功', errorMessage = '操作失败', onSuccess, onError } = options
  const loading = ref(false)
  const error = ref(null)
  const submit = async (formData, formRef = null) => {
    if (loading.value) return false
    loading.value = true
    error.value = null
    let result
    try {
      if (formRef?.validate) {
        try {
          if (await formRef.validate() === false) return false
        } catch { return false }
      }
      try {
        result = await submitFunction(formData)
      } catch (failure) {
        error.value = failure
        ElMessage.error(errorText(failure, errorMessage))
        await onError?.(failure)
        throw failure
      }
      ElMessage.success(typeof successMessage === 'function' ? successMessage(result) : successMessage)
      // A refresh failure must not tell the user that a committed write failed.
      try { await onSuccess?.(result) } catch {
        ElMessage.warning('操作已成功，列表刷新失败，请刷新页面')
      }
      return result
    } finally { loading.value = false }
  }
  return { loading, error, submit }
}
