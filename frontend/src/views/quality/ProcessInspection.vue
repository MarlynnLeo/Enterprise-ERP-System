<!--
/**
 * ProcessInspection.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="inspection-container">
    <!-- 统计卡片 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ inspectionStats.total }}</div>
        <div class="stat-label">全部检验单</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ inspectionStats.pending }}</div>
        <div class="stat-label">待检验</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ inspectionStats.passed }}</div>
        <div class="stat-label">合格</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ inspectionStats.failed }}</div>
        <div class="stat-label">不合格</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ inspectionStats.rework }}</div>
        <div class="stat-label">返工</div>
      </el-card>
    </div>

    <el-card class="box-card">
      <template #header>
        <div class="card-header">
          <span>过程检验管理</span>
          <div class="header-actions">
            <el-button type="primary" @click="showRulesDialog = true">
              <el-icon><Setting /></el-icon>检验规则
            </el-button>
          </div>
        </div>
      </template>
      
      <!-- 搜索表单 -->
      <div class="search-container">
        <el-row :gutter="16">
          <el-col :span="6">
            <el-input 
              v-model="searchKeyword"
              placeholder="请输入检验单号/工单号/产品名称"
              @keyup.enter="handleSearch"
              clearable >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
          </el-col>
          
          <el-col :span="4">
            <el-select v-model="statusFilter" placeholder="检验状态" clearable @change="handleSearch" style="width: 100%">
              <el-option label="待检验" value="pending" />
              <el-option label="合格" value="passed" />
              <el-option label="不合格" value="failed" />
              <el-option label="返工" value="rework" />
            </el-select>
          </el-col>
          
          <el-col :span="8">
            <el-date-picker
              v-model="dateRange"
              type="daterange"
              range-separator="至"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              @change="handleSearch"
              style="width: 100%"
            />
          </el-col>
          
          <el-col :span="6">
            <div class="search-buttons">
              <el-button type="primary" @click="handleSearch">
                <el-icon><Search /></el-icon>查询
              </el-button>
              <el-button @click="handleRefresh">
                <el-icon><Refresh /></el-icon>重置
              </el-button>
              <el-button type="primary" v-if="canCreate" @click="handleCreate">
                <el-icon><Plus /></el-icon>新增
              </el-button>
            </div>
          </el-col>
        </el-row>
      </div>

      <!-- 检验单列表 -->
      <el-table
        :data="inspectionList"
        border
        style="width: 100%; margin-top: 16px;"
        v-loading="loading"
      >
        <el-table-column prop="inspection_no" label="检验单号" min-width="140" />
        <el-table-column prop="reference_no" label="工单号" min-width="150" />
        <el-table-column prop="process_name" label="工序名称" min-width="150" />
        <el-table-column prop="product_name" label="产品名称" min-width="180">
          <template #default="scope">
            {{ scope.row.product_name || scope.row.item_name }}
          </template>
        </el-table-column>
        <el-table-column prop="batch_no" label="批次号" min-width="180" />
        <el-table-column prop="quantity" label="检验数量" min-width="100">
          <template #default="scope">
            {{ scope.row.quantity }} {{ scope.row.unit }}
          </template>
        </el-table-column>
        <el-table-column prop="planned_date" label="检验日期" min-width="120">
          <template #default="scope">
            {{ formatDate(scope.row.planned_date) }}
          </template>
        </el-table-column>
        <el-table-column prop="inspector_name" label="检验员" min-width="120" />
        <el-table-column prop="status" label="检验状态" min-width="100">
          <template #default="scope">
            <el-tag v-if="scope.row.status === 'pending'" type="success">
              巡检{{ scope.row.punch_count || 0 }}次
            </el-tag>
            <template v-else>
              <el-tag
                :type="getStatusType(scope.row.status)"
              >
                {{ getStatusText(scope.row.status) }}
              </el-tag>
              <div v-if="scope.row.punch_count && scope.row.punch_count > 0" style="margin-top: 4px; font-size: 12px; color: #606266;">
                巡检{{ scope.row.punch_count }}次
              </div>
            </template>
          </template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" min-width="200">
          <template #default="scope">
            <el-button 
              size="small" 
              @click="handleView(scope.row)"
            >
              查看
            </el-button>
            <el-button
              v-if="!['passed', 'failed', 'conditional'].includes(scope.row.status) && !['completed', 'warehousing'].includes(scope.row.task_status) && canInspect"
              size="small"
              type="warning"
              @click="handlePunchIn(scope.row)"
            >
              巡检
            </el-button>
            <el-button
              v-if="scope.row.status === 'failed'"
              size="small"
              type="primary"
              @click="handleDropdownCommand('rework', scope.row)"
            
              v-permission="'quality:process'">
              返工
            </el-button>
            <el-button
              v-if="scope.row.status !== 'pending'"
              size="small"
              type="success"
              @click="handleDropdownCommand('print', scope.row)"
            >
              打印
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      
      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="pagination.currentPage"
          v-model:page-size="pagination.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :small="false"
          :disabled="false"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="Math.max(pagination.total, 1)"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>
    
    <!-- 新建检验单弹窗 -->
    <el-dialog
      v-model="createDialogVisible"
      title="新建过程检验单"
      width="650px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="采购单号" prop="purchaseOrderNo">
          <el-select 
            v-model="form.purchaseOrderNo" 
            placeholder="选择采购单号"
            filterable
            :loading="orderLoading"
            :remote-method="fetchPurchaseOrders"
            @change="handleOrderChange"
          >
            <el-option 
              v-for="order in purchaseOrderOptions" 
              :key="order.id" 
              :label="order.orderNo" 
              :value="order.orderNo" 
            />
            <template #empty>
              <el-empty description="暂无采购单数据" />
            </template>
          </el-select>
        </el-form-item>
        
        <el-form-item label="产品名称" prop="productName">
          <el-input v-model="form.productName" disabled />
        </el-form-item>
        
        <el-form-item label="工序" prop="processId">
          <el-select 
            v-model="form.processId" 
            placeholder="选择工序"
            filterable
          >
            <el-option 
              v-for="process in processOptions" 
              :key="process.id" 
              :label="process.name" 
              :value="process.id" 
            />
          </el-select>
        </el-form-item>
        
        <el-form-item label="批次号" prop="batchNo">
          <el-input v-model="form.batchNo" placeholder="请输入批次号" />
        </el-form-item>
        
        <el-form-item label="检验数量" prop="quantity">
          <el-input-number v-model="form.quantity" :min="1" />
          <span class="unit-text">{{ form.unit }}</span>
        </el-form-item>
        
        <el-form-item label="计划检验日期" prop="plannedDate">
          <el-date-picker 
            v-model="form.plannedDate"
            type="date"
            placeholder="选择计划检验日期"
          />
        </el-form-item>
        
        <el-form-item label="备注" prop="note">
          <el-input
            v-model="form.note"
            type="textarea"
            placeholder="请输入备注信息"
            :rows="3"
          />
        </el-form-item>
      </el-form>
      
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="createDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitForm">确认</el-button>
        </span>
      </template>
    </el-dialog>
    
    <!-- 查看检验单详情弹窗 -->
    <el-dialog
      v-model="viewDialogVisible"
      title="检验单详情"
      width="800px"
    >
      <div v-loading="viewLoading" class="detail-container">
        <!-- 基本信息 -->
        <el-descriptions title="基本信息" :column="2" border>
          <el-descriptions-item label="检验单号">{{ viewData.inspection_no }}</el-descriptions-item>
          <el-descriptions-item label="工单号">{{ viewData.reference_no }}</el-descriptions-item>
          <el-descriptions-item label="产品名称">{{ viewData.product_name || viewData.item_name }}</el-descriptions-item>
          <el-descriptions-item label="工序名称">{{ viewData.process_name }}</el-descriptions-item>
          <el-descriptions-item label="检验数量">{{ viewData.quantity }} {{ viewData.unit }}</el-descriptions-item>
          <el-descriptions-item label="计划日期">
            {{ viewData.planned_date ? dayjs(viewData.planned_date).format('YYYY-MM-DD') : '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="巡检次数">
            <el-tag type="success">{{ viewData.punch_count || 0 }}次</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="检验员">{{ viewData.inspector_name || '-' }}</el-descriptions-item>
        </el-descriptions>

        <!-- 打卡记录 -->
        <div class="punch-records-section" style="margin-top: 24px;">
          <h3>巡检打卡记录</h3>
          <el-timeline v-if="punchRecords.length > 0">
            <el-timeline-item
              v-for="(record, index) in punchRecords"
              :key="index"
              :timestamp="dayjs(record.punch_time).format('YYYY-MM-DD HH:mm:ss')"
              placement="top"
              :type="record.punch_type === 'patrol' ? 'warning' : 'primary'"
            >
              <el-card>
                <h4>{{ record.inspector_name }} - {{ record.punch_type === 'patrol' ? '巡检打卡' : '开始检验' }}</h4>
                <p v-if="record.remark">{{ record.remark }}</p>
              </el-card>
            </el-timeline-item>
          </el-timeline>
          <el-empty v-else description="暂无打卡记录" />
        </div>
      </div>
    </el-dialog>
    


    <!-- 过程检验规则配置弹窗 -->
    <RulesDialog v-model:visible="showRulesDialog" />


  </div>
</template>

<script setup>
import { ref, reactive, onMounted, defineAsyncComponent, computed } from 'vue'
import { Search, Refresh, Plus, Setting } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import { useAuthStore } from '@/stores/auth'
import { formatDate } from '@/utils/helpers/dateUtils'
import { qualityApi } from '@/api/quality'
import { productionApi } from '@/api/production'

// 异步加载规则和打卡弹窗组件
const RulesDialog = defineAsyncComponent(() => import('./components/ProcessInspectionRulesDialog.vue'))

// 权限store
const authStore = useAuthStore()

// 权限计算
const canCreate = computed(() => authStore.hasPermission('quality:process:create') || authStore.isAdmin)
const canInspect = computed(() => authStore.hasPermission('quality:process:inspect') || authStore.isAdmin)

// 搜索相关
const searchKeyword = ref('')
const statusFilter = ref('')
const dateRange = ref([])

// 表格数据相关
const loading = ref(false)
const inspectionList = ref([])

// 分页对象
const pagination = reactive({
  currentPage: 1,
  pageSize: 10,
  total: 0
})

// 弹窗控制
const showRulesDialog = ref(false)

// 创建检验单相关
const createDialogVisible = ref(false)
const viewDialogVisible = ref(false)

const formRef = ref(null)
const form = reactive({
  productionOrderNo: '',
  productName: '',
  processId: '',
  processName: '',
  batchNo: '',
  quantity: 1,
  unit: '',
  plannedDate: new Date(),
  remark: ''
})

// 表单验证规则
const rules = {
  productionOrderNo: [{ required: true, message: '请选择生产工单号', trigger: 'change' }],
  processId: [{ required: true, message: '请选择工序', trigger: 'change' }],
  batchNo: [{ required: true, message: '请输入批次号', trigger: 'blur' }],
  quantity: [{ required: true, message: '请输入检验数量', trigger: 'blur' }],
  plannedDate: [{ required: true, message: '请选择计划检验日期', trigger: 'change' }]
}

// 工单选项和工序选项
const purchaseOrderOptions = ref([])
const processOptions = ref([])
const orderLoading = ref(false)

// 添加检验单统计数据
const inspectionStats = ref({
  total: 0,
  pending: 0,
  passed: 0,
  failed: 0,
  rework: 0
})

// 初始化
onMounted(() => {
  fetchData()
  fetchPurchaseOrders()
})

// 获取检验单列表
const fetchData = async () => {
  loading.value = true

  try {
    const params = {
      page: pagination.currentPage,
      pageSize: pagination.pageSize,
      keyword: searchKeyword.value,
      status: statusFilter.value,
      startDate: dateRange.value && dateRange.value[0] ? dateRange.value[0] : '',
      endDate: dateRange.value && dateRange.value[1] ? dateRange.value[1] : ''
    }

    const response = await qualityApi.getProcessInspections(params)

    // 解析响应数据
    const responseData = response.data?.data || response.data || {}
    inspectionList.value = responseData.rows || responseData.items || responseData.list || []
    pagination.total = Number(responseData.total) || 0

    // 更新统计数据
    updateStats()
  } catch (error) {
    console.error('获取过程检验列表失败:', error)
    ElMessage.error('获取过程检验列表失败')
    inspectionList.value = []
    pagination.total = 0
  } finally {
    loading.value = false
  }
}

// 更新统计数据
const updateStats = () => {
  inspectionStats.total = inspectionList.value.length
  inspectionStats.pending = inspectionList.value.filter(item => item.status === 'pending').length
  inspectionStats.passed = inspectionList.value.filter(item => item.status === 'passed').length
  inspectionStats.failed = inspectionList.value.filter(item => item.status === 'failed').length
  inspectionStats.rework = inspectionList.value.filter(item => item.status === 'rework').length
}


// 获取生产工单选项
const fetchPurchaseOrders = async () => {
  orderLoading.value = true
  try {
    // 获取生产任务列表
    const tasksResponse = await productionApi.getProductionTasks({
      pageSize: 1000,
      status: 'in_progress' // 只获取进行中的任务
    })

    const tasksData = tasksResponse.data?.data || tasksResponse.data || {}
    const tasksList = tasksData.list || tasksData.rows || tasksData.items || []

    // 转换为工单选项格式
    purchaseOrderOptions.value = tasksList.map(task => ({
      order_no: task.code || task.task_no || task.order_no,
      product_id: task.product_id,
      product_name: task.product_name || task.productName,
      product_code: task.product_code || task.productCode,
      unit: task.unit
    }))

    // 获取工序数据
    const processesResponse = await productionApi.getProductionProcesses({
      pageSize: 1000
    })

    const processesData = processesResponse.data?.data || processesResponse.data || {}
    allProcesses.value = processesData.list || processesData.rows || processesData.items || []
  } catch (error) {
    console.error('获取生产工单列表失败:', error)
    if (error.response?.status !== 404) {
      ElMessage.error('获取生产工单列表失败')
    }
    purchaseOrderOptions.value = []
  } finally {
    orderLoading.value = false
  }
}

// 所有工序数据
const allProcesses = ref([])

// 根据生产工单获取工序选项
const handleOrderChange = (orderNo) => {
  const order = purchaseOrderOptions.value.find(item => item.order_no === orderNo)
  if (order) {
    form.productName = order.product_name
    form.unit = order.unit

    // 根据产品ID筛选工序
    if (order.product_id && allProcesses.value.length > 0) {
      processOptions.value = allProcesses.value.filter(
        process => (process.product_id === order.product_id) || (process.task_id && process.task_id === order.id)
      ).map(process => ({
        id: process.id || process.process_id,
        name: process.process_name || process.name
      }))
    } else {
      // 如果没有工序数据，显示所有工序
      processOptions.value = allProcesses.value.map(process => ({
        id: process.id || process.process_id,
        name: process.process_name || process.name
      }))
    }
  }
}

// 获取状态类型（用于tag颜色）
const getStatusType = (status) => {
  const statusMap = {
    pending: 'info',
    passed: 'success',
    failed: 'danger',
    rework: 'warning'
  }
  return statusMap[status] || 'info'
}

// 获取状态文本
const getStatusText = (status) => {
  const statusMap = {
    pending: '待检验',
    passed: '合格',
    failed: '不合格',
    rework: '返工'
  }
  return statusMap[status] || '未知'
}

// 搜索
const handleSearch = () => {
  currentPage.value = 1
  fetchData()
}

// 刷新
const handleRefresh = () => {
  searchKeyword.value = ''
  statusFilter.value = ''
  dateRange.value = []
  pagination.currentPage = 1
  pagination.pageSize = 10
  fetchData()
}

// 分页相关
const handleSizeChange = (val) => {
  pagination.pageSize = val
  pagination.currentPage = 1
  fetchData()
}

const handleCurrentChange = (val) => {
  pagination.currentPage = val
  fetchData()
}

// 新建检验单
const handleCreate = () => {
  // 重置表单
  Object.keys(form).forEach(key => {
    if (key === 'quantity') {
      form[key] = 1
    } else if (key === 'plannedDate') {
      form[key] = new Date()
    } else {
      form[key] = ''
    }
  })
  
  createDialogVisible.value = true
}

// 提交表单
const submitForm = async () => {
  if (!formRef.value) return

  try {
    await formRef.value.validate()

    // 构建提交数据
    const submitData = {
      inspection_type: 'process',
      reference_no: form.productionOrderNo,
      batch_no: form.batchNo,
      product_name: form.productName,
      quantity: form.quantity,
      unit: form.unit,
      planned_date: form.plannedDate,
      process_name: processOptions.value.find(p => p.id === form.processId)?.name || '',
      remark: form.remark
    }

    await qualityApi.createProcessInspection(submitData)

    ElMessage.success('检验单创建成功')
    createDialogVisible.value = false
    fetchData()
  } catch (error) {
    console.error('创建检验单失败:', error)
    ElMessage.error('创建检验单失败')
  }
}

const viewData = ref({})
const punchRecords = ref([])
const viewLoading = ref(false)

// 查看详情
const handleView = async (row) => {
  viewData.value = { ...row }
  viewDialogVisible.value = true
  viewLoading.value = true
  
  try {
    const res = await qualityApi.getProcessInspectionPunchList({
      inspection_id: row.id,
      page: 1,
      pageSize: 100
    })
    punchRecords.value = res.data?.list || []
  } catch (error) {
    console.error('获取打卡记录失败:', error)
    ElMessage.error('获取打卡记录失败')
  } finally {
    viewLoading.value = false
  }
}

// 打卡（10分钟内不允许重复打卡）
const handlePunchIn = async (row) => {
  try {
    await qualityApi.punchProcessInspection(row.id, {
      inspector_id: authStore.userId,
      inspector_name: authStore.realName || authStore.username
      // punch_time removed: backend uses NOW()
    })
    ElMessage.success('打卡成功')
    fetchData() // 刷新列表
  } catch (error) {
    console.error('打卡失败:', error)
    // 处理10分钟限制的错误提示
    const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message || '打卡失败'
    if (error.response?.status === 429 || errorMessage.includes('10分钟')) {
      ElMessage.warning(errorMessage)
    } else {
      ElMessage.error(errorMessage)
    }
  }
}

// 处理下拉菜单命令
const handleDropdownCommand = (command, row) => {
  if (command === 'rework') {
    handleRework(row)
  } else if (command === 'print') {
    handlePrint(row)
  }
}

// 返工
const handleRework = (row) => {
  ElMessage.info(`对检验单进行返工: ${row.inspectionNo}`)
}

// 打印报告
const handlePrint = async (row) => {
  try {
    // 从打印模板系统获取模板
    const { api } = await import('@/services/api')
    
    // 获取过程检验单模板
    let templateContent = ''
    try {
      const response = await api.get('/print/templates', {
        params: {
          template_type: 'process_inspection',
          is_default: 1,
          status: 1
        }
      })
      
      const templates = response.data?.list || response.data?.data || response.data || []
      const template = Array.isArray(templates) ? templates[0] : null
      
      if (template && template.content) {
        templateContent = template.content
      }
    } catch (templateError) {
      console.error('获取打印模板失败:', templateError)
      ElMessage.error('获取打印模板失败，请在系统管理-打印管理中配置过程检验单模板')
      return
    }
    
    // 如果没有获取到模板，提示用户配置
    if (!templateContent) {
      ElMessage.warning('未找到过程检验单打印模板，请在系统管理-打印管理中配置')
      return
    }
    
    // 准备打印数据
    const printData = {
      inspection_no: row.inspection_no || row.inspectionNo || '-',
      reference_no: row.reference_no || row.productionOrderNo || '-',
      process_name: row.process_name || row.processName || '-',
      product_name: row.product_name || row.productName || row.item_name || '-',
      batch_no: row.batch_no || row.batchNo || '-',
      quantity: row.quantity || 0,
      unit: row.unit || '',
      planned_date: row.planned_date ? dayjs(row.planned_date).format('YYYY-MM-DD') : '-',
      inspection_date: row.inspection_date ? dayjs(row.inspection_date).format('YYYY-MM-DD') : '-',
      inspector_name: row.inspector_name || '-',
      status: getStatusText(row.status),
      punch_count: row.punch_count || 0,
      remark: row.remark || '',
      print_date: new Date().toLocaleDateString(),
      print_time: new Date().toLocaleTimeString()
    }
    
    // 渲染模板
    let renderedContent = templateContent
    Object.keys(printData).forEach(key => {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g')
      renderedContent = renderedContent.replace(regex, printData[key])
    })
    
    // 创建打印窗口
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      ElMessage.error('无法打开打印窗口,请检查浏览器弹窗设置')
      return
    }

    printWindow.document.write(renderedContent)
    printWindow.document.close()

    // 等待内容加载后打印
    printWindow.onload = () => {
      printWindow.print()
      printWindow.close()
    }

    ElMessage.success('打印预览已打开')
  } catch (error) {
    console.error('打印失败:', error)
    ElMessage.error('打印失败')
  }
}
</script>

<style scoped>

.search-container {
  margin-bottom: var(--spacing-base);
}

.search-buttons {
  display: flex;
  gap: 8px;
}

/* 使用全局样式 common-styles.css 中的 .statistics-row 和 .stat-card */






.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.unit-text {
  margin-left: 8px;
}

.inspection-criteria {
  margin-top: var(--spacing-base);
}

.criteria-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.criteria-item {
  margin-bottom: 15px;
  padding-bottom: 15px;
  border-bottom: 1px dashed #eee;
}

.criteria-item:last-child {
  border-bottom: none;
}


/* 详情对话框长文本处理 - 自动添加 */
:deep(.el-descriptions__content) {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style> 