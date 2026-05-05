/**
 * 通用数据获取Composable - 优化版本
 * 统一处理数据获取、加载状态、错误处理和分页
 * 合并了原有的多个数据获取组合式函数的功能
 */
import { ref, reactive, computed } from 'vue'
import { ElMessage } from 'element-plus'
/**
 * 防抖函数
 */
function debounce(func, delay) {
  let timeoutId
  return function (...args) {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => func.apply(this, args), delay)
  }
}
/**
 * 重试函数
 */
async function retryApiCall(apiFunction, retryCount = 3, delay = 1000) {
  for (let i = 0; i < retryCount; i++) {
    try {
      return await apiFunction()
    } catch (error) {
      if (i === retryCount - 1) throw error
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)))
    }
  }
}
/**
 * 统一数据获取Hook - 支持基础获取、分页、搜索等多种模式
 * @param {Function} apiFunction - API调用函数
 * @param {Object} options - 配置选项
 * @returns {Object} 数据获取相关的响应式数据和方法
 */
export function useUnifiedDataFetching(apiFunction, options = {}) {
  const {
    immediate = false,
    defaultParams = {},
    errorMessage = '数据获取失败',
    successMessage = null,
    transform = null,
    // 分页相关
    enablePagination = false,
    pageSize = 10,
    // 搜索相关
    enableSearch = false,
    debounceTime = 300,
    minSearchLength = 0,
    // 重试相关
    retryCount = 3,
    retryDelay = 1000,
    // 缓存相关
    enableCache = false,
    cacheTimeout = 5 * 60 * 1000, // 5分钟
  } = options
  // 基础状态
  const loading = ref(false)
  const data = ref([])
  const error = ref(null)
  const params = ref({ ...defaultParams })
  const lastUpdated = ref(null)
  // 分页状态
  const pagination = enablePagination ? reactive({
    current: 1,
    pageSize: pageSize,
    total: 0
  }) : null
  // 搜索状态
  const searchQuery = enableSearch ? ref('') : null
  const searchLoading = enableSearch ? ref(false) : null
  // 缓存
  const cache = enableCache ? new Map() : null
  // 计算属性
  const hasData = computed(() => Array.isArray(data.value) ? data.value.length > 0 : !!data.value)
  const isEmpty = computed(() => !loading.value && !hasData.value)
  /**
   * 生成缓存key
   */
  const getCacheKey = (requestParams) => {
    return JSON.stringify(requestParams)
  }
  /**
   * 从缓存获取数据
   */
  const getFromCache = (key) => {
    if (!enableCache || !cache) return null
    const cached = cache.get(key)
    if (cached && Date.now() - cached.timestamp < cacheTimeout) {
      return cached.data
    }
    cache.delete(key)
    return null
  }
  /**
   * 设置缓存
   */
  const setCache = (key, data) => {
    if (!enableCache || !cache) return
    cache.set(key, {
      data,
      timestamp: Date.now()
    })
  }
  /**
   * 核心数据获取函数
   */
  const fetchData = async (customParams = {}, showLoading = true) => {
    if (showLoading) {
      loading.value = true
    }
    error.value = null
    try {
      // 构建最终参数
      let finalParams = { ...params.value, ...customParams }
      // 如果启用分页，添加分页参数
      if (enablePagination && pagination) {
        finalParams = {
          ...finalParams,
          page: pagination.current,
          pageSize: pagination.pageSize
        }
      }
      // 检查缓存
      const cacheKey = getCacheKey(finalParams)
      const cachedData = getFromCache(cacheKey)
      if (cachedData) {
        updateData(cachedData)
        return cachedData
      }
      // API调用（带重试）
      const apiCall = () => apiFunction(finalParams)
      const response = await retryApiCall(apiCall, retryCount, retryDelay)
      // 处理响应数据
      let result = response.data
      if (transform && typeof transform === 'function') {
        result = transform(result)
      }
      // 更新数据和状态
      updateData(result)
      lastUpdated.value = new Date()
      // 设置缓存
      setCache(cacheKey, result)
      if (successMessage) {
        ElMessage.success(successMessage)
      }
      return result
    } catch (err) {
      error.value = err
      console.error('数据获取失败:', err)
      ElMessage.error(err.message || errorMessage)
      throw err
    } finally {
      if (showLoading) {
        loading.value = false
      }
    }
  }
  /**
   * 更新数据状态
   */
  const updateData = (result) => {
    if (enablePagination && pagination) {
      // 处理分页响应
      if (result && typeof result === 'object') {
        if (result.items) {
          data.value = result.items
          pagination.total = result.total || 0
        } else if (result.data && result.pagination) {
          data.value = result.data
          pagination.total = result.pagination.total || 0
        } else if (Array.isArray(result)) {
          data.value = result
          pagination.total = result.length
        } else {
          data.value = []
          pagination.total = 0
        }
      } else {
        data.value = []
        pagination.total = 0
      }
    } else {
      // 非分页模式直接设置数据
      data.value = result
    }
  }
  /**
   * 分页相关方法
   */
  const handlePageChange = enablePagination ? async (page) => {
    pagination.current = page
    await fetchData()
  } : null
  const handleSizeChange = enablePagination ? async (size) => {
    pagination.pageSize = size
    pagination.current = 1
    await fetchData()
  } : null
  const resetPagination = enablePagination ? () => {
    pagination.current = 1
    pagination.total = 0
  } : null
  /**
   * 搜索相关方法
   */
  const _searchTimeout = null
  const debouncedSearch = enableSearch ? debounce(async (query) => {
    if (query.length < minSearchLength && query.length > 0) return
    searchLoading.value = true
    try {
      await fetchData({ search: query })
    } finally {
      searchLoading.value = false
    }
  }, debounceTime) : null
  const handleSearch = enableSearch ? (query) => {
    searchQuery.value = query
    debouncedSearch(query)
  } : null
  const clearSearch = enableSearch ? () => {
    searchQuery.value = ''
    fetchData()
  } : null
  /**
   * 通用方法
   */
  const refresh = () => fetchData()
  const updateParams = (newParams) => {
    params.value = { ...params.value, ...newParams }
  }
  const clearCache = () => {
    if (enableCache && cache) {
      cache.clear()
    }
  }
  // 立即执行
  if (immediate) {
    fetchData()
  }
  // 返回对象 - 根据启用的功能返回相应的方法和状态
  const returnObject = {
    // 基础状态和方法
    loading,
    data,
    error,
    params,
    hasData,
    isEmpty,
    lastUpdated,
    fetchData,
    refresh,
    updateParams,
    clearCache
  }
  // 分页相关
  if (enablePagination) {
    Object.assign(returnObject, {
      pagination,
      handlePageChange,
      handleSizeChange,
      resetPagination
    })
  }
  // 搜索相关
  if (enableSearch) {
    Object.assign(returnObject, {
      searchQuery,
      searchLoading,
      handleSearch,
      clearSearch
    })
  }
  return returnObject
}
/**
 * 基础数据获取Hook（向后兼容）
 */
export function useDataFetching(apiFunction, options = {}) {
  return useUnifiedDataFetching(apiFunction, {
    ...options,
    enablePagination: false,
    enableSearch: false
  })
}
/**
 * 分页数据获取Hook（向后兼容）
 */
export function usePaginatedFetching(apiFunction, options = {}) {
  return useUnifiedDataFetching(apiFunction, {
    ...options,
    enablePagination: true
  })
}
/**
 * 搜索数据获取Hook（向后兼容）
 */
export function useSearchFetching(apiFunction, options = {}) {
  return useUnifiedDataFetching(apiFunction, {
    ...options,
    enableSearch: true
  })
}
/**
 * 表格数据管理Hook（整合原usePageData功能）
 */
export function useTableData(options = {}) {
  const {
    fetchApi,
    createApi,
    updateApi,
    deleteApi,
    moduleName = '记录',
    ...otherOptions
  } = options
  // 使用统一数据获取
  const {
    loading,
    data: tableData,
    pagination,
    searchQuery,
    handlePageChange,
    handleSizeChange,
    handleSearch,
    fetchData,
    refresh
  } = useUnifiedDataFetching(fetchApi, {
    enablePagination: true,
    enableSearch: true,
    errorMessage: `获取${moduleName}列表失败`,
    ...otherOptions
  })
  // 对话框状态
  const dialogVisible = ref(false)
  const dialogType = ref('create') // 'create' | 'edit' | 'view'
  const currentRecord = ref(null)
  const formLoading = ref(false)
  // 搜索和筛选状态
  const statusFilter = ref('')
  const dateRange = ref([])
  /**
   * 对话框操作
   */
  const openCreateDialog = () => {
    dialogType.value = 'create'
    currentRecord.value = null
    dialogVisible.value = true
  }
  const openEditDialog = (record) => {
    dialogType.value = 'edit'
    currentRecord.value = { ...record }
    dialogVisible.value = true
  }
  const openViewDialog = (record) => {
    dialogType.value = 'view'
    currentRecord.value = record
    dialogVisible.value = true
  }
  const closeDialog = () => {
    dialogVisible.value = false
    currentRecord.value = null
  }
  /**
   * CRUD操作
   */
  const createRecord = async (data) => {
    if (!createApi) throw new Error('创建API未配置')
    formLoading.value = true
    try {
      await createApi(data)
      ElMessage.success(`${moduleName}创建成功`)
      closeDialog()
      refresh()
    } catch (error) {
      ElMessage.error(`创建${moduleName}失败`)
      throw error
    } finally {
      formLoading.value = false
    }
  }
  const updateRecord = async (id, data) => {
    if (!updateApi) throw new Error('更新API未配置')
    formLoading.value = true
    try {
      await updateApi(id, data)
      ElMessage.success(`${moduleName}更新成功`)
      closeDialog()
      refresh()
    } catch (error) {
      ElMessage.error(`更新${moduleName}失败`)
      throw error
    } finally {
      formLoading.value = false
    }
  }
  const deleteRecord = async (id) => {
    if (!deleteApi) throw new Error('删除API未配置')
    try {
      await deleteApi(id)
      ElMessage.success(`${moduleName}删除成功`)
      refresh()
    } catch (error) {
      ElMessage.error(`删除${moduleName}失败`)
      throw error
    }
  }
  /**
   * 高级搜索
   */
  const resetSearch = () => {
    searchQuery.value = ''
    statusFilter.value = ''
    dateRange.value = []
    refresh()
  }
  return {
    // 数据状态
    loading,
    tableData,
    pagination,
    // 搜索状态
    searchQuery,
    statusFilter,
    dateRange,
    // 对话框状态
    dialogVisible,
    dialogType,
    currentRecord,
    formLoading,
    // 数据操作
    fetchData,
    refresh,
    handlePageChange,
    handleSizeChange,
    handleSearch,
    resetSearch,
    // 对话框操作
    openCreateDialog,
    openEditDialog,
    openViewDialog,
    closeDialog,
    // CRUD操作
    createRecord,
    updateRecord,
    deleteRecord
  }
}
/**
 * 表单提交Hook（向后兼容）
 * @param {Function} submitFunction - 提交函数
 * @param {Object} options - 配置选项
 * @returns {Object} 表单提交相关的响应式数据和方法
 */
export function useFormSubmit(submitFunction, options = {}) {
  const {
    successMessage = '操作成功',
    errorMessage = '操作失败',
    onSuccess = null,
    onError = null
  } = options
  const loading = ref(false)
  const error = ref(null)
  const submit = async (formData, formRef = null) => {
    // 表单验证
    if (formRef && formRef.validate) {
      const valid = await new Promise((resolve) => {
        formRef.validate((valid) => resolve(valid))
      })
      if (!valid) {
        return false
      }
    }
    loading.value = true
    error.value = null
    try {
      const result = await submitFunction(formData)
      ElMessage.success(successMessage)
      if (onSuccess && typeof onSuccess === 'function') {
        await onSuccess(result)
      }
      return result
    } catch (err) {
      error.value = err
      console.error('表单提交失败:', err)
      // 提取后端返回的错误信息
      let errorMsg = errorMessage
      if (err.response?.data) {
        errorMsg = err.response.data.error ||
          err.response.data.message ||
          err.response.data.msg ||
          errorMessage
      } else if (err.message) {
        errorMsg = err.message
      }
      // 提取后端特定错误代码用于特殊处理（如 DUPLICATE_DRAFT_EXISTS）
      const errorCode = err.response?.data?.code
      // 如果是重复提交错误（409状态码），考虑使用 Alert 引起注意
      if (err.response?.status === 409 || errorCode === 'DUPLICATE_DRAFT_EXISTS') {
        import('element-plus').then(({ ElMessageBox }) => {
          ElMessageBox.alert(errorMsg, '操作被限制', {
            confirmButtonText: '我知道了',
            type: 'warning'
          }).catch(() => { })
        })
      } else {
        ElMessage.error(errorMsg)
      }
      if (onError && typeof onError === 'function') {
        await onError(err)
      }
      throw err
    } finally {
      loading.value = false
    }
  }
  return {
    loading,
    error,
    submit
  }
}