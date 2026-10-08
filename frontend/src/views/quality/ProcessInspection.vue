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
              v-if="['pending', 'in_progress'].includes(scope.row.status) && (scope.row.punchCount || 0) >= 1 && canInspect"
              size="small"
              type="success"
              @click="handleJudge(scope.row)"
            >
              判定
            </el-button>
            <el-button
              v-if="['failed', 'partial'].includes(scope.row.status)"
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
          :page-sizes="PAGE_SIZE_OPTIONS"
          :small="false"
          :disabled="false"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="Math.max(pagination.total, 0)"
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

    <AppDialog v-model="judgeDialogVisible" title="过程检验逐项判定" width="1000px">
      <el-alert title="逐项记录实测值和判定；合格、不合格数量决定本批次流转。" type="info" :closable="false" />
      <InspectionSamplingFields v-model="inspectionSampling" :quantity="judgeForm.quantity" />
      <el-table :data="judgeForm.items" border>
        <el-table-column prop="itemName" label="检验项目" min-width="130" />
        <el-table-column prop="standard" label="标准" min-width="140" />
        <el-table-column prop="method" label="测量方法" min-width="100" />
        <el-table-column label="实测值" min-width="150"><template #default="{ row }">
          <el-input v-model="row.actualValue" placeholder="请输入实际测量/观察值" @change="judgeMeasurement(row)" />
        </template></el-table-column>
        <el-table-column label="判定" min-width="120"><template #default="{ row }">
          <el-select v-model="row.result" placeholder="请选择"><el-option label="合格" value="passed" /><el-option label="不合格" value="failed" /></el-select>
        </template></el-table-column>
      </el-table>
      <el-form label-width="100px" class="mt-md">
        <el-form-item label="检验数量">{{ judgeForm.quantity }}</el-form-item>
        <el-form-item label="合格数量"><el-input-number v-model="judgeForm.qualifiedQuantity" :min="0" :max="Number(judgeForm.quantity)" /></el-form-item>
        <el-form-item label="不合格数量">{{ Number(judgeForm.quantity) - Number(judgeForm.qualifiedQuantity) }}</el-form-item>
        <el-form-item label="备注"><el-input v-model="judgeForm.note" type="textarea" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="judgeDialogVisible = false">取消</el-button><el-button type="primary" :loading="judgeSubmitting" @click="submitJudge">提交检验结果</el-button></template>
    </AppDialog>
  </div>
</template>

<script setup>
import InspectionSamplingFields from './components/InspectionSamplingFields.vue'
import { inspectionSamplingFields, inspectionSamplingPayload, validateInspectionSampling } from '@/utils/inspectionSampling'
const inspectionSampling = ref(inspectionSamplingFields())
import { useInspectionDeepLink } from '@/composables/useInspectionDeepLink'
import { useRouter } from 'vue-router'
const router = useRouter()
import { PAGE_SIZE_OPTIONS } from '@/config/pagination'
import { getThemeDefaultPageSize } from '@/utils/themePageSize'
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
import { getApiErrorMessage } from '@/utils/errorHandler'
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
  pageSize: getThemeDefaultPageSize(10),
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
    const errorMessage = getApiErrorMessage(error, '打卡失败')
    if (error.response?.status === 429 || errorMessage.includes('10分钟')) {
      ElMessage.warning(errorMessage)
    } else {
      ElMessage.error(errorMessage)
    }
  }
}

// 独立录入各项实测和判断，提交时保留测量快照。
const judgeDialogVisible = ref(false)
const judgeSubmitting = ref(false)
const judgeForm = reactive({ id: null, quantity: 0, qualifiedQuantity: 0, unqualifiedQuantity: 0, items: [] })
const handleJudge = async (row) => {
  try {
    const response = await qualityApi.getProcessInspection(row.id)
    const detail = response?.data || response
    if (!detail?.items?.length) {
      ElMessage.warning('该检验单没有检验项目，请先配置检验模板/项目后再判定')
      return
    }
    inspectionSampling.value = inspectionSamplingFields(detail)
    Object.assign(judgeForm, detail, {
      id: row.id,
      qualifiedQuantity: Number(detail.qualifiedQuantity ?? detail.quantity ?? 0),
      unqualifiedQuantity: Number(detail.unqualifiedQuantity ?? 0),
      items: detail.items.map(item => ({ ...item, actualValue: item.actualValue ?? '', result: item.result || '' }))
    })
    judgeDialogVisible.value = true
  } catch (error) { ElMessage.error(getApiErrorMessage(error, '读取过程检验详情失败')) }
}
const judgeMeasurement = (item) => {
  if (item.type !== 'dimension' || item.dimensionValue == null || item.actualValue == null || String(item.actualValue).trim() === '') return
  const actual = Number(item.actualValue)
  if (!Number.isFinite(actual)) { item.result = ''; return }
  const nominal = Number(item.dimensionValue)
  item.result = actual >= nominal + Number(item.toleranceLower || 0) && actual <= nominal + Number(item.toleranceUpper || 0) ? 'passed' : 'failed'
}
const submitJudge = async () => {
  if (judgeSubmitting.value) return
  if (!judgeForm.items.length || judgeForm.items.some(item => !item.result || item.actualValue == null || String(item.actualValue).trim() === '')) {
    ElMessage.warning('请填写每个项目的实测值和判定结果')
    return
  }
  judgeForm.items.forEach(item => { if (item.result !== 'failed') judgeMeasurement(item) })
  const quantity = Number(judgeForm.quantity)
  const good = Number(judgeForm.qualifiedQuantity)
  const bad = quantity - good
  if (!(quantity > 0) || good < 0 || bad < 0) { ElMessage.warning('请填写有效的检验数量'); return }
  if (bad === 0 && judgeForm.items.some(item => item.result === 'failed')) {
    ElMessage.warning('存在不合格项目，请核实合格和不合格数量')
    return
  }
  const samplingError = validateInspectionSampling(inspectionSampling.value, quantity)
  if (samplingError) { ElMessage.warning(samplingError); return }
  judgeSubmitting.value = true
  try {
    await qualityApi.updateProcessInspection(judgeForm.id, {
      ...inspectionSamplingPayload(inspectionSampling.value, quantity),
      status: bad === 0 ? 'passed' : good > 0 ? 'partial' : 'failed',
      inspectorId: authStore.userId,
      inspectorName: authStore.realName || authStore.username,
      actualDate: dayjs().format('YYYY-MM-DD'),
      quantity, qualifiedQuantity: good, unqualifiedQuantity: bad,
      items: judgeForm.items.map(item => ({ ...item })),
      note: judgeForm.note || ''
    })
    ElMessage.success('过程检验结果已保存')
    judgeDialogVisible.value = false
    fetchData()
  } catch (error) { ElMessage.error(getApiErrorMessage(error, '保存过程检验失败')) }
  finally { judgeSubmitting.value = false }
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
  router.push({ path: '/quality/nonconforming', query: { inspection_id: row.id } })
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
useInspectionDeepLink(router, '/quality/process', handleJudge)
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
