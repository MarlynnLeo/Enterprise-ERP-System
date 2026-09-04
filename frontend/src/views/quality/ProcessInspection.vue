<!--
/**
 * ProcessInspection.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page inspection-container">
    <PageHeader title="过程检验管理" subtitle="过程检验任务与结果管理">
      <template #actions>
        <el-button v-permission="'quality:settings:view'" type="primary" @click="showRulesDialog = true">
              <el-icon><Setting /></el-icon>检验规则
            </el-button>
      </template>
    </PageHeader>

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

    <FinanceQueryCard :model="searchForm" @search="handleSearch" @reset="handleRefresh">
      <template #basic>
        <el-form-item label="关键词">
          <el-input v-model="searchKeyword" placeholder="检验单号/工单号/产品名称" clearable @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="检验状态">
          <el-select v-model="statusFilter" placeholder="检验状态" clearable class="form-control-md">
            <el-option label="待检验" value="pending" />
            <el-option label="合格" value="passed" />
            <el-option label="不合格" value="failed" />
            <el-option label="返工" value="rework" />
          </el-select>
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item label="时间范围">
          <el-date-picker v-model="dateRange" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYY-MM-DD" />
        </el-form-item>
      </template>
      <template #actions>
        <el-button type="primary" v-if="canCreate" @click="handleCreate">
          <el-icon><Plus /></el-icon>新增
        </el-button>
      </template>
    </FinanceQueryCard>

    <el-card class="data-card">
      <!-- 检验单列表 -->
      <el-table
        :data="inspectionList"
        border
        class="table-row-click w-full"
        v-loading="loading"
      
      @row-click="(row, column, event) => handleTableRowView(row, column, event, () => handleView(row))">
        <el-table-column prop="inspectionNo" label="检验单号" min-width="140" />
        <el-table-column prop="referenceNo" label="工单号" min-width="150" />
        <el-table-column prop="processName" label="工序名称" min-width="150" />
        <el-table-column prop="itemName" label="产品名称" min-width="180">
          <template #default="scope">
            {{ scope.row.productName || scope.row.itemName || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="batchNo" label="批次号" min-width="190" />
        <el-table-column prop="quantity" label="检验数量" min-width="100">
          <template #default="scope">
            {{ scope.row.quantity }} {{ scope.row.unit }}
          </template>
        </el-table-column>
        <el-table-column prop="plannedDate" label="检验日期" min-width="120">
          <template #default="scope">
            {{ formatDate(scope.row.plannedDate) }}
          </template>
        </el-table-column>
        <el-table-column prop="inspectorName" label="检验员" min-width="100" />
        <el-table-column prop="status" label="检验状态" min-width="100">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">
              {{ getStatusText(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" min-width="320" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header"
      >
          <template #default="scope">
            
            <el-button
              v-if="!['passed', 'failed', 'partial', 'conditional'].includes(scope.row.status) && !['completed', 'warehousing'].includes(scope.row.taskStatus) && canInspect"
              size="small"
              type="warning"
              @click="handlePunchIn(scope.row)"
            >
              巡检
            </el-button>
            <el-button
              v-if="scope.row.status === 'pending' && (scope.row.punchCount || 0) >= 1 && canInspect"
              size="small"
              type="success"
              @click="handleJudge(scope.row)"
            >
              判定
            </el-button>
            <el-button
              v-if="scope.row.status === 'failed'"
              size="small"
              type="primary"
              @click="handleDropdownCommand('rework', scope.row)"
              v-permission="'quality:inspections:update'">
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
    <AppDialog
      v-model="createDialogVisible"
      title="新建过程检验单"
      mode="form"
      width="650px"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="生产工单" prop="productionOrderNo">
          <el-select
            v-model="form.productionOrderNo"
            placeholder="选择生产工单"
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
              <EmptyState description="暂无生产工单数据" />
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
          <el-button v-permission="'quality:inspections:create'" type="primary" @click="submitForm">确认</el-button>
        </span>
      </template>
        </AppDialog>

    <!-- 查看检验单详情弹窗 -->
    <AppDialog
      v-model="viewDialogVisible"
      title="检验单详情"
      mode="view"
      content-width="wide"
      :detail-navigation="processInspectionViewNavigation"
    >
      <div v-loading="viewLoading" class="detail-container">
        <!-- 基本信息 -->
        <el-descriptions title="基本信息" :column="2" border>
          <el-descriptions-item label="检验单号">{{ viewData.inspectionNo }}</el-descriptions-item>
          <el-descriptions-item label="工单号">{{ viewData.referenceNo }}</el-descriptions-item>
          <el-descriptions-item label="产品名称">{{ viewData.productName || viewData.itemName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="工序名称">{{ viewData.processName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="检验数量">{{ viewData.quantity }} {{ viewData.unit }}</el-descriptions-item>
          <el-descriptions-item label="计划日期">
            {{ viewData.plannedDate ? dayjs(viewData.plannedDate).format('YYYY-MM-DD') : '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="巡检次数">
            <el-tag type="success">{{ viewData.punchCount || 0 }}次</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="检验员">{{ viewData.inspectorName || '-' }}</el-descriptions-item>
        </el-descriptions>

        <!-- 打卡记录 -->
        <div class="punch-records-section" style="margin-top: 24px;">
          <h3>巡检打卡记录</h3>
          <el-timeline v-if="punchRecords.length > 0">
            <el-timeline-item
              v-for="(record, index) in punchRecords"
              :key="index"
              :timestamp="dayjs(record.punchTime).format('YYYY-MM-DD HH:mm:ss')"
              placement="top"
              :type="record.punchType === 'patrol' ? 'warning' : 'primary'"
            >
              <el-card>
                <h4>{{ record.inspectorName }} - {{ record.punchType === 'patrol' ? '巡检打卡' : '开始检验' }}</h4>
                <p v-if="record.remark">{{ record.remark }}</p>
              </el-card>
            </el-timeline-item>
          </el-timeline>
          <EmptyState v-else description="暂无打卡记录" />
        </div>
        <div v-if="viewData.attachments && viewData.attachments.length > 0" class="attachments-section" style="margin-top: 24px;">
          <h3>附件</h3>
          <AttachmentUpload :model-value="viewData.attachments" readonly />
        </div>
      </div>
    </AppDialog>


    <!-- 过程检验规则配置弹窗 -->
    <RulesDialog v-model:visible="showRulesDialog" />

  </div>
</template>

<script setup>
import { handleTableRowView } from '@/utils/tableRowView'
import { ref, reactive, onMounted, defineAsyncComponent, computed } from 'vue'
import { Plus, Setting } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus/es/components/message/index'
import dayjs from 'dayjs'
import { useAuthStore } from '@/stores/auth'
import { formatDate } from '@/utils/helpers/dateUtils'
import { qualityApi } from '@/api/quality'
import { productionApi } from '@/api/production'
import printService from '@/services/printService'
import { parseResponseData } from '@/utils/responseParser'
import { useListDetailNavigation } from '@/composables/useListDetailNavigation'
import FinanceQueryCard from '@/components/common/FinanceQueryCard.vue'
import AttachmentUpload from '@/components/AttachmentUpload.vue'

// 异步加载规则和打卡弹窗组件
const RulesDialog = defineAsyncComponent(() => import('./components/ProcessInspectionRulesDialog.vue'))

// 权限store
const authStore = useAuthStore()

// 权限计算
const canCreate = computed(() => authStore.hasPermission('quality:inspections:create') || authStore.isAdmin)
const canInspect = computed(() => authStore.hasPermission('quality:inspections:update') || authStore.isAdmin)

// 搜索相关
const searchKeyword = ref('')
const statusFilter = ref('')
const dateRange = ref([])
const searchForm = computed(() => ({ keyword: searchKeyword.value, status: statusFilter.value, dateRange: dateRange.value }))

// 表格数据相关
const loading = ref(false)
const inspectionList = ref([])
const {
  previousItem: previousViewInspection,
  nextItem: nextViewInspection,
  hasPrevious: hasPreviousViewInspection,
  hasNext: hasNextViewInspection,
  setCurrentItem: setCurrentViewInspection
} = useListDetailNavigation(inspectionList)

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
    const responseData = parseResponseData(response, {})
    inspectionList.value = responseData.rows || responseData.items || responseData.list || []
    pagination.total = Number(responseData.total) || 0

    // 更新统计数据
    await updateStats()
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
const updateStats = async () => {
  try {
    const response = await qualityApi.getProcessInspectionStats()
    const data = parseResponseData(response, {})
    inspectionStats.value.total = Number(data.total) || 0
    inspectionStats.value.pending = Number(data.pending) || 0
    inspectionStats.value.passed = Number(data.passed) || 0
    inspectionStats.value.failed = Number(data.failed) || 0
    inspectionStats.value.rework = Number(data.rework) || 0
  } catch (error) {
    console.error('获取过程检验统计失败:', error)
    inspectionStats.value.total = inspectionList.value.length
    inspectionStats.value.pending = inspectionList.value.filter(item => item.status === 'pending').length
    inspectionStats.value.passed = inspectionList.value.filter(item => item.status === 'passed').length
    inspectionStats.value.failed = inspectionList.value.filter(item => item.status === 'failed').length
    inspectionStats.value.rework = inspectionList.value.filter(item => item.status === 'rework').length
  }
}

// 获取生产工单选项与工序基础数据
const fetchPurchaseOrders = async (query = '') => {
  orderLoading.value = true
  try {
    // 1. 获取生产任务列表
    const tasksResponse = await productionApi.getProductionTasks({
      pageSize: 50,
      search: query,
      status: 'in_progress' // 只获取进行中的任务
    })

    const tasksData = parseResponseData(tasksResponse, {})
    const tasksList = tasksData.list || tasksData.rows || tasksData.items || []

    // 转换为工单选项格式（camel SSOT）
    purchaseOrderOptions.value = tasksList.map(task => ({
      id: task.id,
      orderNo: task.code || task.taskCode || task.orderNo,
      productId: task.productId,
      productName: task.productName,
      productCode: task.productCode,
      unit: task.unit || task.unitName,
      unitId: task.unitId
    }))

    // 2. 独立安全获取初始工序数据（解耦容错，避免工序异常影响工单）
    try {
      const processesResponse = await productionApi.getProductionProcesses({
        pageSize: 50
      })
      const processesData = parseResponseData(processesResponse, {})
      allProcesses.value = processesData.list || processesData.rows || processesData.items || []
    } catch (procErr) {
      console.warn('获取工序初始列表失败，将在选择工单时动态按需加载:', procErr)
      allProcesses.value = []
    }
  } catch (error) {
    console.error('获取生产工单列表失败:', error)
    if (error.response?.status !== 404 && error.response?.status !== 403) {
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
const handleOrderChange = async (orderNo) => {
  const order = purchaseOrderOptions.value.find(item => item.orderNo === orderNo)
  if (!order) {
    processOptions.value = []
    return
  }

  form.productName = order.productName
  form.unit = order.unit

  // 1. 优先按工单 taskId 精确获取该任务的工序列表
  if (order.id) {
    try {
      const res = await productionApi.getProductionProcesses({
        taskId: order.id,
        pageSize: 100
      })
      const data = parseResponseData(res, {})
      const taskProcesses = data.list || data.rows || data.items || []
      if (taskProcesses.length > 0) {
        processOptions.value = taskProcesses.map(process => ({
          id: process.id || process.processId,
          name: process.processName || process.name,
          taskId: process.taskId,
          productId: process.productId
        }))
        return
      }
    } catch (err) {
      console.warn('按任务获取工序失败，使用本地筛选兜底:', err)
    }
  }

  // 2. 本地兜底筛选：根据产品ID或任务ID匹配工序
  if (allProcesses.value.length > 0) {
    if (order.productId) {
      processOptions.value = allProcesses.value.filter(
        process => (process.productId === order.productId)
          || (process.taskId && process.taskId === order.id)
      ).map(process => ({
        id: process.id || process.processId,
        name: process.processName || process.name,
        taskId: process.taskId,
        productId: process.productId
      }))
    } else {
      processOptions.value = allProcesses.value.map(process => ({
        id: process.id || process.processId,
        name: process.processName || process.name,
        taskId: process.taskId,
        productId: process.productId
      }))
    }
  } else {
    processOptions.value = []
  }
}

import { getQualityStatusText, getQualityStatusColor } from '@/constants/systemConstants'

// 获取状态类型（统一调用配置中心）
const getStatusType = (status) => {
  return getQualityStatusColor(status)
}

// 获取状态文本（统一调用配置中心）
const getStatusText = (status) => {
  return getQualityStatusText(status)
}

// 搜索
const handleSearch = () => {
  pagination.currentPage = 1
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

    const selectedOrder = purchaseOrderOptions.value.find(item => item.orderNo === form.productionOrderNo)
    const selectedProcess = processOptions.value.find(p => p.id === form.processId)

    // 构建提交数据（纯 camel，后端 qualityInspectionMap.fromApi）
    const submitData = {
      inspectionType: 'process',
      referenceId: selectedOrder?.id || null,
      referenceNo: form.productionOrderNo,
      taskId: selectedOrder?.id || null,
      productId: selectedOrder?.productId || null,
      productCode: selectedOrder?.productCode || '',
      batchNo: form.batchNo,
      productName: form.productName,
      quantity: form.quantity,
      unit: form.unit,
      unitId: selectedOrder?.unitId || null,
      plannedDate: form.plannedDate,
      processId: selectedProcess?.id || null,
      processName: selectedProcess?.name || '',
      note: form.remark || form.note
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
  setCurrentViewInspection(row)
  viewDialogVisible.value = true
  viewLoading.value = true

  try {
    const detailRes = await qualityApi.getProcessInspection(row.id)
    const detail = parseResponseData(detailRes, null)
    if (detail && typeof detail === 'object') viewData.value = { ...viewData.value, ...detail }
    const res = await qualityApi.getProcessInspectionPunchList({
      inspection_id: row.id,
      page: 1,
      pageSize: 50
    })
    punchRecords.value = res.data?.list || []
  } catch (error) {
    console.error('获取打卡记录失败:', error)
    ElMessage.error('获取打卡记录失败')
  } finally {
    viewLoading.value = false
  }
}

const handleViewPrevious = () => {
  if (previousViewInspection.value) handleView(previousViewInspection.value)
}

const handleViewNext = () => {
  if (nextViewInspection.value) handleView(nextViewInspection.value)
}

const processInspectionViewNavigation = computed(() => ({
  hasPrevious: hasPreviousViewInspection.value,
  hasNext: hasNextViewInspection.value,
  loading: viewLoading.value,
  previous: handleViewPrevious,
  next: handleViewNext
}))

// 打卡（10分钟内不允许重复打卡）
const handlePunchIn = async (row) => {
  try {
    await qualityApi.punchProcessInspection(row.id, {
      inspectorId: authStore.userId,
      inspectorName: authStore.realName || authStore.username
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

// 判定过程检验结果
const handleJudge = async (row) => {
  try {
    const { ElMessageBox } = await import('element-plus/es/components/message-box/index')
    const { value: result } = await ElMessageBox.confirm(
      `检验单 ${row.inspectionNo} 已巡检 ${row.punchCount || 0} 次，请判定结果：\n（将同步把所有检验项目判定为相同结果）`,
      '过程检验判定',
      {
        distinguishCancelAndClose: true,
        confirmButtonText: '合格',
        cancelButtonText: '不合格',
        confirmButtonClass: 'el-button--success',
        cancelButtonClass: 'el-button--danger',
        type: 'info'
      }
    ).then(() => ({ value: 'passed' }))
     .catch((action) => {
       if (action === 'cancel') return { value: 'failed' }
       throw action // close 直接退出
     })

    // 后端关闭检验单要求每个检验项目都有 result；快捷判定时一并提交项目结果
    let items = Array.isArray(row.items) ? row.items : []
    if (!items.length) {
      try {
        const detailRes = await qualityApi.getProcessInspection(row.id)
        const detail = detailRes?.data || detailRes || {}
        items = detail.items || []
      } catch (detailErr) {
        console.warn('获取检验项目失败，将仅提交状态:', detailErr)
      }
    }

    if (!items.length) {
      ElMessage.warning('该检验单没有检验项目，请先配置检验模板/项目后再判定')
      return
    }

    const itemResult = result === 'passed' ? 'passed' : 'failed'
    const payloadItems = items.map((item) => ({
      id: item.id,
      itemName: item.itemName || item.name || '检验项',
      standard: item.standard || item.specification || '',
      type: item.type || 'other',
      isCritical: item.isCritical === true || item.isCritical === 1 ? true : false,
      result: itemResult,
      actualValue: item.actualValue ?? item.measuredValue ?? null,
      dimensionValue: item.dimensionValue ?? null,
      toleranceUpper: item.toleranceUpper ?? null,
      toleranceLower: item.toleranceLower ?? null,
      measure1: item.measure1 ?? null,
      measure2: item.measure2 ?? null,
      measure3: item.measure3 ?? null,
      measure4: item.measure4 ?? null,
      measure5: item.measure5 ?? null,
      measure6: item.measure6 ?? null,
      remarks: item.remarks || item.remark || (result === 'passed' ? '快捷判定合格' : '快捷判定不合格'),
    }))

    await qualityApi.updateProcessInspection(row.id, {
      status: result,
      inspectorId: authStore.userId,
      inspectorName: authStore.realName || authStore.username,
      actualDate: dayjs().format('YYYY-MM-DD'),
      items: payloadItems,
    })

    ElMessage.success(result === 'passed' ? '已判定合格' : '已判定不合格')
    fetchData()
  } catch (err) {
    if (err === 'close') return // 关闭弹窗忽略
    console.error('判定失败:', err)
    const msg =
      err?.response?.data?.message ||
      err?.message ||
      (err?.response?.status === 404 ? '接口不存在或后端未启动，请检查服务后刷新重试' : '判定操作失败')
    ElMessage.error(msg)
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
    // 业务 camel；printService 自动展开 snake 模板占位
    const inspectionNo = row.inspectionNo || '-'
    const plannedDate = row.plannedDate ? dayjs(row.plannedDate).format('YYYY-MM-DD') : '-'
    const inspectionDate = row.actualDate ? dayjs(row.actualDate).format('YYYY-MM-DD') : '-'
    const printData = {
      inspectionNo,
      referenceNo: row.referenceNo || row.productionOrderNo || '-',
      processName: row.processName || '-',
      productName: row.productName || row.itemName || '-',
      batchNo: row.batchNo || '-',
      quantity: row.quantity || 0,
      unit: row.unit || '',
      plannedDate,
      inspectionDate,
      inspectorName: row.inspectorName || '-',
      status: getStatusText(row.status),
      punchCount: row.punchCount || 0,
      remarks: row.note || row.remarks || '',
      remark: row.note || row.remarks || '',
      printDate: new Date().toLocaleDateString(),
      printTime: new Date().toLocaleTimeString()
    }

    const html = await printService.generateByDefaultTemplate('quality', 'process_inspection', {
      ...printData,
      documentNo: inspectionNo,
      date: inspectionDate !== '-' ? inspectionDate : plannedDate,
      items: (row.items || []).map((item, index) => ({
        index: index + 1,
        itemCode: item.itemCode || item.code || '',
        itemName: item.itemName || item.name || '-',
        specification: item.standard || item.specification || '',
        quantity: item.actualValue || item.quantity || '',
        unitName: item.unit || '',
        result: item.result || item.status || '',
        remarks: item.remarks || item.remark || '',
        remark: item.remarks || item.remark || ''
      }))
    })

    printService.previewDocument(html)

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
  border-bottom: 1px dashed var(--color-border-lighter);
}

.criteria-item:last-child {
  border-bottom: none;
}


:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
