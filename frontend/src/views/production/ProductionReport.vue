<!--
/**
 * ProductionReport.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page production-report-container">
    <PageHeader title="生产报工管理" subtitle="管理生产报工记录">
      <template #actions>
        <el-button
          v-if="canCreate"
          type="primary"
          :icon="Plus"
          @click="showReportModal"
        >
          新增报工
        </el-button>
      </template>
    </PageHeader>

    <!-- 搜索区域 -->
    <FinanceQueryCard
      :model="searchForm"
      @search="handleSearch"
      @reset="handleReset"
    >
      <template #basic>
        <el-form-item label="物料名称">
          <el-select  v-model="searchForm.taskId" placeholder="选择生产任务" clearable>
            <el-option
              v-for="task in taskList"
              :key="task.id"
              :label="`${task.code} - ${task.productName}`"
              :value="task.id"
            />
          </el-select>
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item label="时间范围">
          <el-date-picker
            v-model="searchForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            @change="handleDateRangeChange"
          />
        </el-form-item>
      </template>
      <template #actions>
          <el-button type="warning" @click="handleExport">
            <el-icon><Download /></el-icon> 导 出
          </el-button>
      </template>
    </FinanceQueryCard>

    <!-- 统计信息 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ reportStats.total || 0 }}</div>
        <div class="stat-label">报工记录数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ reportStats.completed || 0 }}</div>
        <div class="stat-label">涉及任务数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ reportStats.inProgress || 0 }}</div>
        <div class="stat-label">完成总数量</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ reportStats.qualifiedRate || '0%' }}</div>
        <div class="stat-label">合格率</div>
      </el-card>
    </div>

    <!-- 表格区域 -->
    <el-card class="data-card">
      <el-tabs v-model="activeTab" class="report-tabs" @tab-click="handleTabChange">
        <el-tab-pane label="生产汇总" name="summary">
          <el-table
            :data="summaryData"
            border
            class="w-full"
            v-loading="loading"
            stripe
          >
            <template #empty>
              <EmptyState description="暂无报工数据，请先进行生产报工" />
            </template>
            <!-- 展开详情列 -->
            <el-table-column type="expand" width="50">
              <template #default="props">
                <div class="report-detail">
                  <el-descriptions :column="3" border>
                    <el-descriptions-item label="产品名称">{{ props.row.productName }}</el-descriptions-item>
                    <el-descriptions-item label="计划数量">{{ props.row.plannedQuantity }}</el-descriptions-item>
                    <el-descriptions-item label="完成数量">{{ props.row.actualQuantity }}</el-descriptions-item>
                    <el-descriptions-item label="合格数量">{{ props.row.qualifiedQuantity }}</el-descriptions-item>
                    <el-descriptions-item label="不合格数量">{{ props.row.unqualifiedQuantity }}</el-descriptions-item>
                    <el-descriptions-item label="合格率">{{ props.row.qualificationRate }}</el-descriptions-item>
                  </el-descriptions>
                </div>
              </template>
            </el-table-column>

            <el-table-column prop="productName" label="产品名称" min-width="180" />
            <el-table-column prop="plannedQuantity" label="计划数量" width="100" />
            <el-table-column prop="actualQuantity" label="完成数量" width="100" />
            <el-table-column prop="completionRate" label="完成率" width="100">
              <template #default="scope">
                {{ typeof scope.row.completionRate === 'number' ?
                  (scope.row.completionRate * 100).toFixed(2) + '%' :
                  scope.row.completionRate }}
              </template>
            </el-table-column>
            <el-table-column prop="qualifiedQuantity" label="合格数量" width="100" />
            <el-table-column prop="unqualifiedQuantity" label="不合格数量" width="100" />
            <el-table-column prop="qualificationRate" label="合格率" width="100" />
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="生产明细" name="detail">
          <el-table
            :data="detailData"
            border
            class="table-row-click w-full"
            v-loading="loading"
            stripe
          
      @row-click="(row, column, event) => handleTableRowView(row, column, event, () => viewReportDetail(row))">
            <template #empty>
              <EmptyState description="暂无报工数据，请先进行生产报工" />
            </template>
            <!-- 展开详情列 -->
            <el-table-column type="expand" width="50">
              <template #default="props">
                <div class="report-detail">
                  <el-descriptions :column="3" border size="small">
                    <el-descriptions-item label="任务编号">{{ props.row.taskCode }}</el-descriptions-item>
                    <el-descriptions-item label="产品名称">{{ props.row.productName }}</el-descriptions-item>
                    <el-descriptions-item label="工序名称">{{ props.row.processName }}</el-descriptions-item>
                    <el-descriptions-item label="报工日期">{{ props.row.reportDate }}</el-descriptions-item>
                    <el-descriptions-item label="计划数量">{{ props.row.plannedQuantity }}</el-descriptions-item>
                    <el-descriptions-item label="完成数量">{{ props.row.completedQuantity }}</el-descriptions-item>
                    <el-descriptions-item label="合格数量">{{ props.row.qualifiedQuantity }}</el-descriptions-item>
                    <el-descriptions-item label="不合格数量">{{ props.row.unqualifiedQuantity }}</el-descriptions-item>
                    <el-descriptions-item label="合格率">
                      {{ calculateQualifiedRate(props.row.qualifiedQuantity, props.row.completedQuantity) }}
                    </el-descriptions-item>
                    <el-descriptions-item label="工时">{{ props.row.workHours }}小时</el-descriptions-item>
                    <el-descriptions-item label="报工人">{{ props.row.reporter }}</el-descriptions-item>
                    <el-descriptions-item label="备注" :span="3">{{ props.row.remarks || '无' }}</el-descriptions-item>
                  </el-descriptions>
                </div>
              </template>
            </el-table-column>

            <el-table-column prop="taskCode" label="任务编号" min-width="150" />
            <el-table-column prop="productName" label="产品名称" min-width="180" />
            <el-table-column prop="processName" label="工序名称" min-width="150" />
            <el-table-column prop="reportDate" label="报工日期" width="120" />
            <el-table-column prop="completedQuantity" label="完成数量" width="100" />
            <el-table-column prop="qualifiedQuantity" label="合格数量" width="100" />
            <el-table-column label="合格率" width="100">
              <template #default="scope">
                {{ calculateQualifiedRate(scope.row.qualifiedQuantity, scope.row.completedQuantity) }}
              </template>
            </el-table-column>
            <el-table-column prop="reporter" label="报工人" width="120" />
            <el-table-column label="操作" min-width="300" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header"
      >
              <template #default="scope">
                
                <el-button
                  v-if="canUpdate"
                  size="small"
                  type="warning"
                  @click="handleEditReport(scope.row)"
                >
                  编辑
                </el-button>
                <el-button
                  v-if="canDelete"
                  size="small"
                  type="danger"
                  @click="handleDeleteReport(scope.row)"
                >
                  删除
                </el-button>
              </template>
            </el-table-column>
          </el-table>

          <!-- 分页 -->
          <div class="pagination-container">
            <el-pagination
              @size-change="handleSizeChange"
              @current-change="handleCurrentChange"
              :current-page="currentPage"
              :page-sizes="[10, 20, 50, 100]"
              :page-size="pageSize"
              :small="false"
              :disabled="false"
              :background="true"
              layout="total, sizes, prev, pager, next, jumper"
              :total="Math.max(total, 1)"
            >
            </el-pagination>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 报工详情弹窗 -->
    <AppDialog
      v-model="detailVisible"
      title="报工详情"
      mode="view"
      content-width="wide"
    >
      <el-descriptions :column="2" border size="medium">
        <el-descriptions-item label="任务编号" label-align="right" width="120px">{{ reportDetail.taskCode }}</el-descriptions-item>
        <el-descriptions-item label="产品名称" label-align="right" width="120px">{{ reportDetail.productName }}</el-descriptions-item>
        <el-descriptions-item label="工序名称" label-align="right">{{ reportDetail.processName }}</el-descriptions-item>
        <el-descriptions-item label="报工日期" label-align="right">{{ reportDetail.reportDate }}</el-descriptions-item>
        <el-descriptions-item label="计划数量" label-align="right">{{ reportDetail.plannedQuantity }}</el-descriptions-item>
        <el-descriptions-item label="完成数量" label-align="right">{{ reportDetail.completedQuantity }}</el-descriptions-item>
        <el-descriptions-item label="合格数量" label-align="right">{{ reportDetail.qualifiedQuantity }}</el-descriptions-item>
        <el-descriptions-item label="不合格数量" label-align="right">{{ reportDetail.unqualifiedQuantity }}</el-descriptions-item>
        <el-descriptions-item label="合格率" label-align="right">
          {{ calculateQualifiedRate(reportDetail.qualifiedQuantity, reportDetail.completedQuantity) }}
        </el-descriptions-item>
        <el-descriptions-item label="工时" label-align="right">{{ reportDetail.workHours }}小时</el-descriptions-item>
        <el-descriptions-item label="报工人" label-align="right">{{ reportDetail.reporter }}</el-descriptions-item>
      </el-descriptions>

      <el-divider>备注信息</el-divider>
      <div class="remarks-content">
        <div style="white-space: pre-line;">{{ reportDetail.remarks || '无' }}</div>
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="detailVisible = false">关闭</el-button>
          <el-button v-permission="'production:reports:view'" type="primary" @click="printReport" v-if="reportDetail.id">打印报工单</el-button>
        </span>
      </template>
    </AppDialog>

    <!-- 新增/编辑报工弹窗 -->
    <AppDialog
      v-model="reportModalVisible"
      :title="formData.id ? '编辑生产报工' : '新增生产报工'"
      mode="form"
      width="700px"
    >
      <el-form
        ref="formRef"
        :model="formData"
        :rules="rules"
        label-width="100px"
        label-position="right"
        class="report-form"
        @keydown="reportFormKeydown"
      >
        <el-divider content-position="left">基本信息</el-divider>
        <el-row :gutter="20">
          <el-col :span="24">
            <el-form-item label="生产任务" prop="taskId">
              <el-select
                v-model="formData.taskId"
                placeholder="选择生产任务"
                class="w-full"
                filterable
                @change="handleTaskFormChange"
              >
                <el-option
                  v-for="task in taskList"
                  :key="task.id"
                  :label="`${task.code} - ${task.productName}`"
                  :value="task.id"
                >
                  <div style="display: flex; justify-content: space-between; align-items: center; width: 100%">
                    <span class="font-weight-700">{{ task.code }}</span>
                    <span class="text-muted text-md">{{ task.productName }}</span>
                  </div>
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <!-- 任务报工统计信息 -->
        <el-row :gutter="20" v-if="formData.taskId && !formData.id">
          <el-col :span="24">
            <el-alert type="info" :closable="false" class="task-stats-alert">
              <template #title>
                <div class="task-stats-info">
                  <span>计划数量: <b>{{ taskReportStats.plan_quantity }}</b></span>
                  <el-divider direction="vertical" />
                  <span>已报工: <b>{{ taskReportStats.reported_quantity }}</b></span>
                  <el-divider direction="vertical" />
                  <span>剩余: <b class="text-warning">{{ taskReportStats.remaining_quantity }}</b></span>
                  <el-divider direction="vertical" />
                  <span>完成率: <b>{{ taskReportStats.completion_rate }}</b></span>
                  <el-divider direction="vertical" />
                  <span>合格率: <b>{{ taskReportStats.qualification_rate }}</b></span>
                </div>
              </template>
            </el-alert>
          </el-col>
        </el-row>

        <!-- 工序选择（如果有工序） -->
        <el-row :gutter="20" v-if="processList.length > 0">
          <el-col :span="24">
            <el-form-item label="生产工序">
              <el-select
                v-model="formData.processId"
                placeholder="选择工序（可选）"
                class="w-full"
                clearable
                @change="handleProcessChange"
              >
                <el-option
                  v-for="process in processList"
                  :key="process.id"
                  :label="`${process.sequence}. ${process.processName}`"
                  :value="process.id"
                >
                  <div class="flex-between">
                    <span>{{ process.sequence }}. {{ process.processName }}</span>
                    <el-tag size="small" :type="process.status === 'completed' ? 'success' : (process.status === 'in_progress' ? 'warning' : 'info')">
                      {{ process.status === 'completed' ? '已完成' : (process.status === 'in_progress' ? '进行中' : '待开始') }}
                    </el-tag>
                  </div>
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="报工日期" prop="reportDate">
              <el-date-picker
                v-model="formData.reportDate"
                type="date"
                placeholder="选择报工日期"
                class="w-full"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="报工人" prop="reporter">
              <el-input v-model="formData.reporter" placeholder="请输入报工人" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">数量信息</el-divider>

        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="计划数量" prop="plannedQuantity">
              <el-input v-model="formData.plannedQuantity" disabled />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="完成数量" prop="completedQuantity">
              <el-input
                v-model="formData.completedQuantity"
                inputmode="decimal"
                placeholder="请输入完成数量"
                class="w-full"
                @input="handleQuantityChange"
              />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="合格数量" prop="qualifiedQuantity">
              <el-input
                v-model="formData.qualifiedQuantity"
                inputmode="decimal"
                placeholder="请输入合格数量"
                class="w-full"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="24">
            <el-form-item label="不合格数量" prop="unqualifiedQuantity">
              <el-input v-model="unqualifiedQuantity" disabled />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">其他信息</el-divider>

        <el-row :gutter="20">
          <el-col :span="24">
            <el-form-item label="工时(小时)" prop="workHours">
              <el-input
                v-model="formData.workHours"
                inputmode="decimal"
                placeholder="请输入工时"
                class="w-full"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="24">
            <el-form-item label="备注" prop="remarks">
              <el-input
                v-model="formData.remarks"
                type="textarea"
                placeholder="请输入备注信息"
                :rows="4"
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="reportModalVisible = false">取 消</el-button>
          <el-button type="primary" @click="handleReportSubmit">提 交</el-button>
        </span>
      </template>
        </AppDialog>
  </div>
</template>

<script setup>
import { handleTableRowView } from '@/utils/tableRowView'
import { ref, onMounted, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download, Plus } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { parseListData, parseResponseData } from '@/utils/responseParser'
import { productionApi } from '@/api/production'
import { useAuthStore } from '@/stores/auth'
import { useFormKeyboardNav } from '@/composables/useFormKeyboardNav'
import printService from '@/services/printService'

// 权限store
const authStore = useAuthStore()

// ✅ 键盘导航：Enter 跳转下一字段，最后一个字段 Enter 提交
const { onFormKeydown: reportFormKeydown } = useFormKeyboardNav(() => handleReportSubmit())

const canCreate = computed(() => authStore.hasPermission('production:reports:create'));
const canUpdate = computed(() => authStore.hasPermission('production:reports:update'));
const canDelete = computed(() => authStore.hasPermission('production:reports:delete'));
// 数据定义
const loading = ref(false)
const activeTab = ref('summary')
const searchForm = ref({
  dateRange: [dayjs().subtract(30, 'day').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')],
  taskId: undefined
})

// 表格数据
const summaryData = ref([])
const detailData = ref([])
const taskList = ref([])
const processList = ref([])  // 工序列表

// 分页
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)

// 统计数据
const reportStats = ref({
  total: 0,
  completed: 0,
  inProgress: 0,
  qualifiedRate: '0%'
})

// 任务报工统计信息
const taskReportStats = ref({
  plan_quantity: 0,
  reported_quantity: 0,
  remaining_quantity: 0,
  qualified_quantity: 0,
  defective_quantity: 0,
  report_count: 0,
  completion_rate: '0%',
  qualification_rate: '0%'
})

// 表单相关
const formRef = ref()
const formData = ref({
  taskId: undefined,
  processId: undefined,  // 新增工序ID
  processName: '',       // 工序名称
  reportDate: dayjs().format('YYYY-MM-DD'),
  plannedQuantity: 0,
  completedQuantity: 0,
  qualifiedQuantity: 0,
  workHours: 8,
  reporter: '',
  remarks: ''
})

// 不合格数量计算属性
const unqualifiedQuantity = computed(() => {
  const completedQuantity = Number(formData.value.completedQuantity)
  const qualifiedQuantity = Number(formData.value.qualifiedQuantity)
  if (!Number.isFinite(completedQuantity) || !Number.isFinite(qualifiedQuantity)) return 0
  return completedQuantity - qualifiedQuantity
})

// 详情弹窗
const detailVisible = ref(false)
const reportDetail = ref({})

// 新增报工弹窗
const reportModalVisible = ref(false)

// 表单验证规则
const validateNonNegativeNumber = (_rule, value, callback) => {
  if (value === '' || value === null || value === undefined) {
    callback(new Error('请输入数量'))
    return
  }

  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) {
    callback(new Error('请输入大于或等于 0 的数字'))
    return
  }

  callback()
}

const rules = {
  taskId: [{ required: true, message: '请选择生产任务', trigger: 'change' }],
  reportDate: [{ required: true, message: '请选择报工日期', trigger: 'change' }],
  completedQuantity: [{ validator: validateNonNegativeNumber, trigger: 'blur' }],
  qualifiedQuantity: [{ validator: validateNonNegativeNumber, trigger: 'blur' }],
  workHours: [{ validator: validateNonNegativeNumber, trigger: 'blur' }],
  reporter: [{ required: true, message: '请输入报工人', trigger: 'blur' }]
}

// 获取任务列表
const fetchTaskList = async () => {
  try {
    // 报工只允许选择已发料或生产中的任务，避免绕过发料/开工流转
    const response = await productionApi.getProductionTasks({ status: 'in_progress' })
    // 使用统一解析器
    taskList.value = parseListData(response, { enableLog: false })
  } catch (error) {
    console.error('获取生产任务列表失败:', error)
    ElMessage.error('获取生产任务列表失败')
  }
}

// 获取汇总数据
const fetchSummaryData = async () => {
  if (!searchForm.value.dateRange || searchForm.value.dateRange.length !== 2) {
    return
  }

  loading.value = true
  try {
    const [startDate, endDate] = searchForm.value.dateRange
    const params = {
      startDate,
      endDate,
      taskId: searchForm.value.taskId
    }

    const response = await productionApi.getProductionReportSummary(params)
    const rawData = parseListData(response, { enableLog: false })

    // 处理汇总数据，添加计算字段
    summaryData.value = rawData.map(item => {
      const totalQuantity = item.totalQuantity || 0
      const totalQualified = item.totalQualified || 0
      const totalDefective = item.totalDefective || 0

      return {
        taskCode: item.taskCode,
        productName: item.productName,
        plannedQuantity: totalQuantity,
        actualQuantity: totalQuantity,
        completedQuantity: totalQuantity,
        qualifiedQuantity: totalQualified,
        unqualifiedQuantity: totalDefective,
        completionRate: 1.0, // 已报工的都算完成
        qualificationRate: totalQuantity > 0 ? ((totalQualified / totalQuantity) * 100).toFixed(2) + '%' : '0%'
      }
    })

    // 计算统计数据
    await calculateReportStats()
  } catch (error) {
    console.error('获取生产汇总数据失败:', error)
    // 不显示错误提示，静默处理
    summaryData.value = []
    reportStats.value = {
      total: 0,
      completed: 0,
      inProgress: 0,
      qualifiedRate: '0%'
    }
  }
  loading.value = false
}

// 获取明细数据
const fetchDetailData = async () => {
  if (!searchForm.value.dateRange || searchForm.value.dateRange.length !== 2) {
    return
  }

  loading.value = true
  try {
    const [startDate, endDate] = searchForm.value.dateRange
    const params = {
      startDate,
      endDate,
      taskId: searchForm.value.taskId,
      page: currentPage.value,
      pageSize: pageSize.value
    }

    const response = await productionApi.getProductionReportDetail(params)
    const responseData = parseResponseData(response, {})
    const rawItems = parseListData(response, { enableLog: false })
    detailData.value = rawItems.map(item => ({
      id: item.id,
      task_id: item.taskId,
      process_id: item.processId,
      taskCode: item.taskCode,
      productName: item.productName,
      processName: item.processName || '-',
      reportDate: dayjs(item.reportTime).format('YYYY-MM-DD'),
      plannedQuantity: item.reportQuantity || 0,
      completedQuantity: item.completedQuantity || 0,
      qualifiedQuantity: item.qualifiedQuantity || 0,
      unqualifiedQuantity: item.unqualifiedQuantity || item.defectiveQuantity || 0,
      workHours: item.workHours || 0,
      reporter: item.operatorName || '-',
      remarks: item.remarks || '',
      report_time: item.reportTime,
      operator_name: item.operatorName,
      report_quantity: item.reportQuantity,
      qualified_quantity: item.qualifiedQuantity,
      work_hours: item.workHours
    }))
    total.value = Number(responseData.total) || rawItems.length

    await calculateReportStats()
  } catch (error) {
    console.error('获取报工明细失败:', error)
    detailData.value = []
    total.value = 0
    reportStats.value = {
      total: 0,
      completed: 0,
      inProgress: 0,
      qualifiedRate: '0%'
    }
  }
  loading.value = false
}

// 计算报工统计数据（使用后端API）
const calculateReportStats = async () => {
  try {
    if (!searchForm.value.dateRange || searchForm.value.dateRange.length !== 2) {
      reportStats.value = {
        total: 0,
        completed: 0,
        inProgress: 0,
        qualifiedRate: '0%'
      }
      return
    }

    const [startDate, endDate] = searchForm.value.dateRange
    const params = { startDate, endDate }

    const response = await productionApi.getProductionReportStatistics(params)
    const stats = parseResponseData(response, {})

    reportStats.value = {
      total: stats.total || 0,
      completed: stats.taskCount || 0,
      inProgress: stats.totalCompleted || 0,  // 显示完成数量
      qualifiedRate: stats.qualifiedRate || '0%'
    }
  } catch (error) {
    console.error('获取统计数据失败:', error)
    // 静默处理错误，不影响页面显示
    reportStats.value = {
      total: 0,
      completed: 0,
      inProgress: 0,
      qualifiedRate: '0%'
    }
  }
}

// 计算合格率
const calculateQualifiedRate = (qualified, total) => {
  if (!total || total === 0) return '0%'
  return ((qualified / total) * 100).toFixed(2) + '%'
}

// 导出报表
const handleExport = async () => {
  if (!searchForm.value.dateRange || searchForm.value.dateRange.length !== 2) {
    ElMessage.warning('请选择日期范围')
    return
  }

  try {
    const [startDate, endDate] = searchForm.value.dateRange
    const params = {
      startDate,
      endDate,
      taskId: searchForm.value.taskId
    }

    const response = await productionApi.exportProductionReports(params)

    const blob = new Blob([response.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
    const link = document.createElement('a')
    link.href = window.URL.createObjectURL(blob)
    link.download = `生产报工_${params.startDate}_${params.endDate}.xlsx`
    link.click()

    ElMessage.success('导出报表成功')
  } catch (error) {
    console.error('导出报表失败:', error)
    ElMessage.error('导出报表失败')
  }
}

// 查看报工详情
const viewReportDetail = (record) => {
  reportDetail.value = record
  detailVisible.value = true
}

// 编辑报工
const handleEditReport = (record) => {
  const taskId = record.taskId ?? record.taskId
  const taskExists = taskList.value.some(task => String(task.id) === String(taskId))

  // 历史报工对应的任务可能已完成，不在“生产中”任务列表内；补入只读回显项，
  // 避免 el-select 找不到选项时直接显示数据库 ID。
  if (!taskExists && taskId != null) {
    taskList.value.unshift({
      id: taskId,
      code: record.taskCode || `任务 ${taskId}`,
      productName: record.productName || ''
    })
  }

  // 填充表单数据
  formData.value = {
    id: record.id,
    taskId,
    processId: record.processId ?? record.processId,
    processName: record.processName || '',
    reportDate: dayjs(record.reportTime || record.reportDate).format('YYYY-MM-DD'),
    plannedQuantity: record.reportQuantity ?? record.plannedQuantity ?? 0,
    completedQuantity: record.completedQuantity ?? record.completedQuantity ?? 0,
    qualifiedQuantity: record.qualifiedQuantity ?? record.qualifiedQuantity ?? 0,
    workHours: record.workHours ?? record.workHours ?? 8,
    reporter: record.operatorName || record.reporter || '',
    remarks: record.remarks || ''
  }

  reportModalVisible.value = true
}

// 删除报工
const handleDeleteReport = async (record) => {
  try {
    await ElMessageBox.confirm('确认删除此报工记录吗？删除后无法恢复。', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })

    await productionApi.deleteProductionReport(record.id)
    ElMessage.success('删除成功')

    // 刷新数据
    fetchData()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除报工记录失败:', error)
      ElMessage.error('删除失败: ' + (error.response?.data?.message || error.message))
    }
  }
}

// 显示新增报工弹窗
const showReportModal = () => {
  // 报工人默认填充当前登录用户
  const currentUser = authStore.user
  formData.value = {
    taskId: undefined,
    reportDate: dayjs().format('YYYY-MM-DD'),
    plannedQuantity: 0,
    completedQuantity: 0,
    qualifiedQuantity: 0,
    workHours: 8,
    reporter: currentUser?.realName || currentUser?.username || '',
    remarks: ''
  }

  reportModalVisible.value = true
}

// 任务变更处理
const handleTaskFormChange = async (taskId) => {
  // 获取选中的任务信息
  const selectedTask = taskList.value.find(t => t.id === taskId)
  if (selectedTask) {
    formData.value.plannedQuantity = selectedTask.quantity || 0

    // 获取任务的报工统计
    try {
      const statsRes = await productionApi.getTaskReportStats(taskId)
      const stats = parseResponseData(statsRes, {})
      taskReportStats.value = stats

      // 设置默认完成数量为剩余数量
      const remaining = stats.remaining_quantity || selectedTask.quantity || 0
      formData.value.completedQuantity = remaining
      formData.value.qualifiedQuantity = remaining
    } catch (error) {
      console.error('获取任务报工统计失败:', error)
      formData.value.completedQuantity = selectedTask.quantity || 0
      formData.value.qualifiedQuantity = selectedTask.quantity || 0
      taskReportStats.value = {
        plan_quantity: selectedTask.quantity || 0,
        reported_quantity: 0,
        remaining_quantity: selectedTask.quantity || 0,
        qualified_quantity: 0,
        defective_quantity: 0,
        report_count: 0,
        completion_rate: '0%',
        qualification_rate: '0%'
      }
    }

    // 获取工序列表
    try {
      const processRes = await productionApi.getTaskProcesses(taskId)
      processList.value = parseResponseData(processRes, [])
      // 清空工序选择
      formData.value.processId = undefined
      formData.value.processName = ''
    } catch (error) {
      console.error('获取工序列表失败:', error)
      processList.value = []
    }
  }
}

// 工序变更处理
const handleProcessChange = (processId) => {
  const selectedProcess = processList.value.find(p => p.id === processId)
  if (selectedProcess) {
    formData.value.processName = selectedProcess.processName
  }
}

// 完成数量变更处理
const handleQuantityChange = (value) => {
  const completedQuantity = Number(value)
  if (!Number.isFinite(completedQuantity)) return

  // 如果合格数量大于新的完成数量，则修改合格数量
  if (Number(formData.value.qualifiedQuantity) > completedQuantity) {
    formData.value.qualifiedQuantity = value
  }
}

// 提交报工
const handleReportSubmit = async () => {
  try {
    await formRef.value.validate()

    const completedQuantity = Number(formData.value.completedQuantity)
    const qualifiedQuantity = Number(formData.value.qualifiedQuantity)
    const plannedQuantity = Number(formData.value.plannedQuantity)
    const workHours = Number(formData.value.workHours)

    // 检查完成数量和合格数量
    if (completedQuantity > plannedQuantity) {
      ElMessage.warning('完成数量不能大于计划数量')
      return
    }

    if (qualifiedQuantity > completedQuantity) {
      ElMessage.warning('合格数量不能大于完成数量')
      return
    }

    // 准备提交数据（使用下划线命名，与后端API一致）
    const reportData = {
      task_id: formData.value.taskId,
      process_id: formData.value.processId,
      process_name: formData.value.processName,
      operator_name: formData.value.reporter,
      report_time: formData.value.reportDate,
      report_quantity: completedQuantity,
      completed_quantity: completedQuantity,
      qualified_quantity: qualifiedQuantity,
      defective_quantity: completedQuantity - qualifiedQuantity,
      unqualified_quantity: completedQuantity - qualifiedQuantity,
      work_hours: workHours,
      remarks: formData.value.remarks
    }

    // 判断是新增还是编辑
    if (formData.value.id) {
      // 编辑模式
      await productionApi.updateProductionReport(formData.value.id, reportData)
      ElMessage.success('报工更新成功')
    } else {
      // 新增模式
      await productionApi.createProductionReport(reportData)
      ElMessage.success('报工提交成功')
    }

    reportModalVisible.value = false

    // 刷新数据
    fetchData()
  } catch (error) {
    console.error('报工提交失败:', error)
    ElMessage.error('操作失败: ' + (error.response?.data?.message || error.message))
  }
}

// 事件处理
const handleDateRangeChange = () => {
  // 日期范围变化时重置页码
  currentPage.value = 1
}

const handleSearch = () => {
  currentPage.value = 1
  fetchData()
}

const handleReset = () => {
  searchForm.value = {
    dateRange: [dayjs().subtract(30, 'day').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')],
    taskId: undefined
  }
  handleSearch()
}

const handleSizeChange = (val) => {
  pageSize.value = val
  fetchDetailData()
}

const handleCurrentChange = (val) => {
  currentPage.value = val
  fetchDetailData()
}

const handleTabChange = (tab) => {
  activeTab.value = tab
  fetchData()
}

// 获取数据
const fetchData = () => {
  if (activeTab.value === 'summary') {
    fetchSummaryData()
  } else {
    fetchDetailData()
  }
}

// 生命周期
onMounted(() => {
  fetchTaskList()
  fetchData()
})

// 监听
watch(() => searchForm.value.dateRange, () => {
  if (searchForm.value.dateRange && searchForm.value.dateRange.length === 2) {
    currentPage.value = 1
  }
})

// 添加打印报工单方法 - 使用打印模板系统
const printReport = async () => {
  const reportData = reportDetail.value;

  try {
    const html = await printService.generateByDefaultTemplate('production', 'production_task', {
      task_no: reportData.taskCode || '-',
      product_name: reportData.productName || '-',
      process_name: reportData.processName || '-',
      responsible_person: reportData.reporter || '-',
      report_date: reportData.reportDate || '-',
      planned_quantity: reportData.plannedQuantity || 0,
      completed_quantity: reportData.completedQuantity || 0,
      qualified_quantity: reportData.qualifiedQuantity || 0,
      unqualified_quantity: reportData.unqualifiedQuantity || 0,
      work_hours: reportData.workHours || 0,
      remark: reportData.remarks || '-',
      print_time: new Date().toLocaleString(),
      items: []
    });

    printService.previewDocument(html);
  } catch (error) {
    console.error('打印失败:', error);
    ElMessage.error('打印失败');
  }
}

</script>

<style scoped>
.header-card {
  margin-bottom: 20px;
}

.title-section h2 {
  margin: 0 0 5px 0;
  font-size: 20px;
  color: var(--color-text-primary);
}

.subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.report-tabs {
  margin-bottom: var(--spacing-base);
}

.report-detail {
  padding: 20px;
  background-color: var(--color-bg-hover);
}

.report-form .el-form-item {
  margin-bottom: 18px;
}

.remarks-content {
  padding: 10px;
  min-height: 60px;
  background-color: var(--color-bg-hover);
  border-radius: var(--radius-sm);
}

/* 操作列样式 - 与库存出库页面保持一致 */
.el-table .el-button + .el-button {
  margin-left: 8px;
}

/* 任务报工统计信息样式 */
.task-stats-alert {
  margin-bottom: 16px;
}

.task-stats-info {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.task-stats-info span {
  font-size: 13px;
}

.task-stats-info b {
  color: var(--color-primary);
}


:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
