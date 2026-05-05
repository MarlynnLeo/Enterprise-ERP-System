/**
 * 生产计划组合式API
 * 将生产计划相关逻辑抽取为可复用的组合式函数
 */

import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'

import { productionErrorHandler, withErrorHandling } from '@/utils/errorHandler'
import logger from '@/utils/logger'
import productionApi from '@/services/productionApi'
import { parsePaginatedData } from '@/utils/responseParser'

/**
 * 生产计划列表管理
 */
export function useProductionPlanList() {
  // 响应式数据
  const loading = ref(false)
  const planList = ref([])
  const pagination = reactive({
    currentPage: 1,
    pageSize: 10,
    total: 0
  })

  // 搜索表单
  const searchForm = reactive({
    code: '',
    product: '',
    startDate: '',
    endDate: '',
    status: ''
  })

  // 计算属性
  const hasPlans = computed(() => planList.value.length > 0)
  const isEmpty = computed(() => !loading.value && planList.value.length === 0)

  /**
   * 获取生产计划列表 - 优化版本
   */
  const fetchPlanList = withErrorHandling(async () => {
    const params = {
      page: pagination.currentPage,
      pageSize: pagination.pageSize,
      ...searchForm
    }

    const response = await productionApi.getProductionPlans(params)

    // 使用统一解析器处理分页数据
    const { list, total } = parsePaginatedData(response, { enableLog: false })
    planList.value = list
    pagination.total = total

    logger.debug('生产计划列表加载完成', {
      count: planList.value.length,
      total: pagination.total
    })
  }, {
    errorHandler: productionErrorHandler,
    operation: 'fetchPlanList',
    showLoading: true,
    loadingRef: loading
  })

  /**
   * 搜索计划
   */
  const searchPlans = () => {
    pagination.currentPage = 1
    fetchPlanList()
  }

  /**
   * 重置搜索
   */
  const resetSearch = () => {
    Object.keys(searchForm).forEach(key => {
      searchForm[key] = ''
    })
    pagination.currentPage = 1
    fetchPlanList()
  }

  /**
   * 分页处理
   */
  const handleSizeChange = (size) => {
    pagination.pageSize = size
    pagination.currentPage = 1
    fetchPlanList()
  }

  const handleCurrentChange = (page) => {
    pagination.currentPage = page
    fetchPlanList()
  }

  // 初始化
  onMounted(() => {
    fetchPlanList()
  })

  return {
    // 数据
    loading,
    planList,
    pagination,
    searchForm,
    
    // 计算属性
    hasPlans,
    isEmpty,
    
    // 方法
    fetchPlanList,
    searchPlans,
    resetSearch,
    handleSizeChange,
    handleCurrentChange
  }
}

/**
 * 生产计划表单管理
 */
export function useProductionPlanForm() {
  const loading = ref(false)
  const modalVisible = ref(false)
  const modalTitle = ref('')
  const isEditing = ref(false)

  // 表单数据
  const formData = ref({
    id: null,
    code: '',
    name: '',
    startDate: null,
    endDate: null,
    productId: null,
    quantity: 0,
    status: 'draft'
  })

  // 产品列表
  const productList = ref([])
  const materialList = ref([])

  /**
   * 显示创建模态框
   */
  const showCreateModal = withErrorHandling(async () => {
    modalTitle.value = '新建生产计划'
    isEditing.value = false
    
    // 重置表单
    formData.value = {
      id: null,
      code: await generatePlanCode(),
      name: '',
      startDate: null,
      endDate: null,
      productId: null,
      quantity: 0,
      status: 'draft'
    }
    
    materialList.value = []
    modalVisible.value = true
  }, {
    errorHandler: productionErrorHandler,
    operation: 'showCreateModal'
  })

  /**
   * 显示编辑模态框
   */
  const showEditModal = withErrorHandling(async (plan) => {
    modalTitle.value = '编辑生产计划'
    isEditing.value = true
    
    formData.value = {
      ...plan,
      startDate: plan.start_date,
      endDate: plan.end_date,
      productId: plan.product_id
    }
    
    // 加载物料需求
    if (plan.product_id && plan.quantity) {
      await calculateMaterials()
    }
    
    modalVisible.value = true
  }, {
    errorHandler: productionErrorHandler,
    operation: 'showEditModal'
  })

  /**
   * 生成计划编号
   */
  const generatePlanCode = withErrorHandling(async () => {
    const response = await productionApi.getTodaySequence()
    const sequence = response.data.sequence || '001'
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '')
    return `SC${dateStr}${sequence}`
  }, {
    errorHandler: productionErrorHandler,
    operation: 'generatePlanCode'
  })

  /**
   * 计算物料需求
   */
  const calculateMaterials = withErrorHandling(async () => {
    if (!formData.value.productId || !formData.value.quantity) {
      ElMessage.warning('请先选择产品并输入数量')
      return
    }

    const response = await productionApi.calculateMaterials({
      productId: formData.value.productId,
      quantity: formData.value.quantity
    })

    materialList.value = response.data || []
    
    logger.debug('物料需求计算完成', {
      productId: formData.value.productId,
      quantity: formData.value.quantity,
      materialCount: materialList.value.length
    })
  }, {
    errorHandler: productionErrorHandler,
    operation: 'calculateMaterials',
    showLoading: true,
    loadingRef: loading
  })

  /**
   * 保存计划
   */
  const savePlan = withErrorHandling(async () => {
    const data = {
      ...formData.value,
      start_date: formData.value.startDate,
      end_date: formData.value.endDate,
      product_id: formData.value.productId
    }

    if (isEditing.value) {
      await productionApi.updateProductionPlan(data.id, data)
      ElMessage.success('生产计划更新成功')
    } else {
      await productionApi.createProductionPlan(data)
      ElMessage.success('生产计划创建成功')
    }

    modalVisible.value = false
    return true // 表示保存成功
  }, {
    errorHandler: productionErrorHandler,
    operation: isEditing.value ? 'updatePlan' : 'createPlan',
    showLoading: true,
    loadingRef: loading
  })

  /**
   * 产品变更处理
   */
  const handleProductChange = () => {
    if (formData.value.productId && formData.value.quantity) {
      calculateMaterials()
    } else {
      materialList.value = []
    }
  }

  /**
   * 关闭模态框
   */
  const closeModal = () => {
    modalVisible.value = false
    formData.value = {
      id: null,
      code: '',
      name: '',
      startDate: null,
      endDate: null,
      productId: null,
      quantity: 0,
      status: 'draft'
    }
    materialList.value = []
  }

  return {
    // 数据
    loading,
    modalVisible,
    modalTitle,
    isEditing,
    formData,
    productList,
    materialList,
    
    // 方法
    showCreateModal,
    showEditModal,
    generatePlanCode,
    calculateMaterials,
    savePlan,
    handleProductChange,
    closeModal
  }
}

/**
 * 生产计划操作管理
 */
export function useProductionPlanActions() {
  const loading = ref(false)

  /**
   * 删除计划
   */
  const deletePlan = withErrorHandling(async (plan) => {
    await productionApi.deleteProductionPlan(plan.id)
    ElMessage.success('删除成功')
    return true
  }, {
    errorHandler: productionErrorHandler,
    operation: 'deletePlan',
    showLoading: true,
    loadingRef: loading
  })

  /**
   * 更新计划状态
   */
  const updatePlanStatus = withErrorHandling(async (planId, status) => {
    await productionApi.updateProductionPlanStatus(planId, { status })
    ElMessage.success('状态更新成功')
    return true
  }, {
    errorHandler: productionErrorHandler,
    operation: 'updatePlanStatus',
    showLoading: true,
    loadingRef: loading
  })

  /**
   * 导出计划数据
   */
  const exportPlans = withErrorHandling(async (searchParams = {}) => {
    const response = await productionApi.exportProductionData(searchParams)
    
    // 处理文件下载
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', '生产计划数据.xlsx')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
    
    ElMessage.success('导出成功')
  }, {
    errorHandler: productionErrorHandler,
    operation: 'exportPlans'
  })

  return {
    loading,
    deletePlan,
    updatePlanStatus,
    exportPlans
  }
}

export default {
  useProductionPlanList,
  useProductionPlanForm,
  useProductionPlanActions
}
