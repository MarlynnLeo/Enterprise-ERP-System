<!--
/**
 * ProductionReport.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="production-report-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>生产报工管理</h2>
          <p class="subtitle">管理生产报工记录</p>
        </div>
        <el-button
          v-if="canCreate"
          type="primary"
          :icon="Plus"
          @click="showReportModal"
        >
          新增报工
        </el-button>
      </div>
    </el-card>
    
    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
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
        <el-form-item label="生产任务">
          <el-select  v-model="searchForm.taskId" placeholder="选择生产任务" clearable>
            <el-option 
              v-for="task in taskList" 
              :key="task.id" 
              :label="`${task.code} - ${task.productName}`" 
              :value="task.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">
            <el-icon><Search /></el-icon> 查 询
          </el-button>
          <el-button type="warning" @click="handleExport">
            <el-icon><Download /></el-icon> 导 出
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>
    
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
            style="width: 100%"
            v-loading="loading"
            stripe
          >
            <template #empty>
              <el-empty description="暂无报工数据，请先进行生产报工" />
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
            <el-table-column prop="plannedQuantity" label="计划数量" width="100" align="center" />
            <el-table-column prop="actualQuantity" label="完成数量" width="100" align="center" />
            <el-table-column prop="completionRate" label="完成率" width="100" align="center">
              <template #default="scope">
                {{ typeof scope.row.completionRate === 'number' ? 
                  (scope.row.completionRate * 100).toFixed(2) + '%' : 
                  scope.row.completionRate }}
              </template>
            </el-table-column>
            <el-table-column prop="qualifiedQuantity" label="合格数量" width="100" align="center" />
            <el-table-column prop="unqualifiedQuantity" label="不合格数量" width="100" align="center" />
            <el-table-column prop="qualificationRate" label="合格率" width="100" align="center" />
          </el-table>
        </el-tab-pane>
        
        <el-tab-pane label="生产明细" name="detail">
          <el-table
            :data="detailData"
            border
            style="width: 100%"
            v-loading="loading"
            stripe
          >
            <template #empty>
              <el-empty description="暂无报工数据，请先进行生产报工" />
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
            <el-table-column prop="reportDate" label="报工日期" width="120" align="center" />
            <el-table-column prop="completedQuantity" label="完成数量" width="100" align="center" />
            <el-table-column prop="qualifiedQuantity" label="合格数量" width="100" align="center" />
            <el-table-column label="合格率" width="100" align="center">
              <template #default="scope">
                {{ calculateQualifiedRate(scope.row.qualifiedQuantity, scope.row.completedQuantity) }}
              </template>
            </el-table-column>
            <el-table-column prop="reporter" label="报工人" width="120" />
            <el-table-column label="操作" min-width="200" fixed="right" align="center">
              <template #default="scope">
                <el-button
                  v-if="canView"
                  size="small"
                  type="primary"
                  @click="viewReportDetail(scope.row)"
                >
                  查看
                </el-button>
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
    <el-dialog
      v-model="detailVisible"
      title="报工详情"
      width="650px"
      destroy-on-close
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
    </el-dialog>
    
    <!-- 新增/编辑报工弹窗 -->
    <el-dialog
      v-model="reportModalVisible"
      :title="formData.id ? '编辑生产报工' : '新增生产报工'"
      width="700px"
      destroy-on-close
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
                style="width: 100%"
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
                    <span style="font-weight: bold">{{ task.code }}</span>
                    <span style="color: var(--color-text-muted); font-size: 13px">{{ task.productName }}</span>
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
                  <span>剩余: <b style="color: #E6A23C">{{ taskReportStats.remaining_quantity }}</b></span>
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
                style="width: 100%"
                clearable
                @change="handleProcessChange"
              >
                <el-option
                  v-for="process in processList"
                  :key="process.id"
                  :label="`${process.sequence}. ${process.process_name}`"
                  :value="process.id"
                >
                  <div style="display: flex; justify-content: space-between; align-items: center">
                    <span>{{ process.sequence }}. {{ process.process_name }}</span>
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
                style="width: 100%"
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
              <el-input-number 
                v-model="formData.completedQuantity" 
                :min="0" 
                :max="formData.plannedQuantity"
                style="width: 100%"
                @change="handleQuantityChange"
              />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="合格数量" prop="qualifiedQuantity">
              <el-input-number 
                v-model="formData.qualifiedQuantity" 
                :min="0" 
                :max="formData.completedQuantity"
                style="width: 100%"
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
              <el-input-number
                v-model="formData.workHours"
                :min="0"
                :precision="1"
                :step="0.5"
                style="width: 100%"
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
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Download, Plus } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import axios from '@/services/api'
import { parseListData } from '@/utils/responseParser'
import { productionApi } from '@/api/production'
import { useAuthStore } from '@/stores/auth'
import { useFormKeyboardNav } from '@/composables/useFormKeyboardNav'
import { writeSafeHtmlDocument } from '@/utils/htmlSecurity'

// 权限store
const authStore = useAuthStore()

// ✅ 键盘导航：Enter 跳转下一字段，最后一个字段 Enter 提交
const { onFormKeydown: reportFormKeydown } = useFormKeyboardNav(() => handleReportSubmit())

// 权限计算属性（修复：之前未定义导致运行时 TypeError）
const canView = computed(() => authStore.hasPermission('production:productionreport:read'));
const canCreate = computed(() => authStore.hasPermission('production:productionreport:create'));
const canUpdate = computed(() => authStore.hasPermission('production:productionreport:update'));
const canDelete = computed(() => authStore.hasPermission('production:productionreport:delete'));
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
  return formData.value.completedQuantity - formData.value.qualifiedQuantity
})

// 详情弹窗
const detailVisible = ref(false)
const reportDetail = ref({})

// 新增报工弹窗
const reportModalVisible = ref(false)

// 表单验证规则
const rules = {
  taskId: [{ required: true, message: '请选择生产任务', trigger: 'change' }],
  reportDate: [{ required: true, message: '请选择报工日期', trigger: 'change' }],
  completedQuantity: [{ required: true, message: '请输入完成数量', trigger: 'blur' }],
  qualifiedQuantity: [{ required: true, message: '请输入合格数量', trigger: 'blur' }],
  workHours: [{ required: true, message: '请输入工时', trigger: 'blur' }],
  reporter: [{ required: true, message: '请输入报工人', trigger: 'blur' }]
}

// 获取任务列表
const fetchTaskList = async () => {
  try {
    // 报工可选择分配中、生产中和已发料的任务
    const response = await axios.get('/production/tasks', {
      params: { status: 'in_progress,allocated,material_issued' }
    })
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

    const response = await axios.get('/production/reports/summary', { params })
    const rawData = response.data || []

    // 处理汇总数据，添加计算字段
    summaryData.value = rawData.map(item => {
      const totalQuantity = item.total_quantity || 0
      const totalQualified = item.total_qualified || 0
      const totalDefective = item.total_defective || 0

      return {
        taskCode: item.task_code,
        productName: item.product_name,
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

    const response = await axios.get('/production/reports/detail', { params })
    if (response.data) {
      // 使用统一解析器处理明细数据
      const rawItems = parseListData(response, { enableLog: false })
      detailData.value = rawItems.map(item => ({
        id: item.id,
        task_id: item.task_id,
        process_id: item.process_id,
        taskCode: item.task_code,
        productName: item.product_name,
        processName: item.process_name || '-',
        reportDate: dayjs(item.report_time).format('YYYY-MM-DD'),
        plannedQuantity: item.report_quantity || 0,
        completedQuantity: item.completed_quantity || 0,
        qualifiedQuantity: item.qualified_quantity || 0,
        unqualifiedQuantity: item.unqualified_quantity || item.defective_quantity || 0,
        workHours: item.work_hours || 0,
        reporter: item.operator_name || '-',
        remarks: item.remarks || '',
        report_time: item.report_time,
        operator_name: item.operator_name,
        report_quantity: item.report_quantity,
        qualified_quantity: item.qualified_quantity,
        work_hours: item.work_hours
      }))
      total.value = response.data.total || 0
    }

    // 计算统计数据
    await calculateReportStats()
  } catch (error) {
    console.error('获取生产明细数据失败:', error)
    // 不显示错误提示，静默处理
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
    const stats = response.data?.data || response.data || {}

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
    
    const response = await axios.get('/production/reports/export', {
      params,
      responseType: 'blob'
    })
    
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
  // 填充表单数据
  formData.value = {
    id: record.id,
    taskId: record.task_id,
    processId: record.process_id,
    processName: record.process_name || record.processName || '',
    reportDate: dayjs(record.report_time).format('YYYY-MM-DD'),
    plannedQuantity: record.report_quantity || 0,
    completedQuantity: record.completed_quantity || 0,
    qualifiedQuantity: record.qualified_quantity || 0,
    workHours: record.work_hours || 8,
    reporter: record.operator_name || '',
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

    await axios.delete(`/production/reports/${record.id}`)
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
    reporter: currentUser?.real_name || currentUser?.username || '',
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
      const stats = statsRes.data?.data || statsRes.data || {}
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
      processList.value = processRes.data?.data || processRes.data || []
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
    formData.value.processName = selectedProcess.process_name
  }
}

// 完成数量变更处理
const handleQuantityChange = (value) => {
  // 如果合格数量大于新的完成数量，则修改合格数量
  if (formData.value.qualifiedQuantity > value) {
    formData.value.qualifiedQuantity = value
  }
}

// 提交报工
const handleReportSubmit = async () => {
  try {
    await formRef.value.validate()

    // 检查完成数量和合格数量
    if (formData.value.completedQuantity > formData.value.plannedQuantity) {
      ElMessage.warning('完成数量不能大于计划数量')
      return
    }

    if (formData.value.qualifiedQuantity > formData.value.completedQuantity) {
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
      report_quantity: formData.value.completedQuantity,
      completed_quantity: formData.value.completedQuantity,
      qualified_quantity: formData.value.qualifiedQuantity,
      defective_quantity: formData.value.completedQuantity - formData.value.qualifiedQuantity,
      unqualified_quantity: formData.value.completedQuantity - formData.value.qualifiedQuantity,
      work_hours: formData.value.workHours,
      remarks: formData.value.remarks
    }

    // 判断是新增还是编辑
    if (formData.value.id) {
      // 编辑模式
      await axios.put(`/production/reports/${formData.value.id}`, reportData)
      ElMessage.success('报工更新成功')
    } else {
      // 新增模式
      await axios.post('/production/reports', reportData)
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
    // 获取打印模板
    let templateContent = '';
    try {
      const response = await axios.get('/print/templates', {
        params: {
          template_type: 'production_task',
          is_default: 1,
          status: 1
        }
      });
      
      const templates = response.data?.list || response.data?.data || response.data || [];
      const template = Array.isArray(templates) ? templates[0] : null;
      
      if (template && template.content) {
        templateContent = template.content;
      }
    } catch (templateError) {
      console.error('获取打印模板失败:', templateError);
    }
    
    // 如果没有找到模板，提示用户配置
    if (!templateContent) {
      ElMessage.warning('未找到生产报工打印模板，请在系统管理-打印管理中配置 production_task 类型模板');
      return;
    }
    
    {
      // 替换模板变量
      const printData = {
        taskCode: reportData.taskCode || '-',
        productName: reportData.productName || '-',
        processName: reportData.processName || '-',
        reporter: reportData.reporter || '-',
        reportDate: reportData.reportDate || '-',
        plannedQuantity: reportData.plannedQuantity || 0,
        completedQuantity: reportData.completedQuantity || 0,
        qualifiedQuantity: reportData.qualifiedQuantity || 0,
        unqualifiedQuantity: reportData.unqualifiedQuantity || 0,
        workHours: reportData.workHours || 0,
        remarks: reportData.remarks || '-',
        print_date: new Date().toLocaleDateString(),
        print_time: new Date().toLocaleTimeString()
      };
      
      Object.keys(printData).forEach(key => {
        const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
        templateContent = templateContent.replace(regex, printData[key]);
      });
    }
    
    const printWindow = window.open('', '_blank');
    writeSafeHtmlDocument(printWindow, templateContent);
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

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
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
  background-color: #f9f9f9;
}

.report-form .el-form-item {
  margin-bottom: 18px;
}

.remarks-content {
  padding: 10px;
  min-height: 60px;
  background-color: #f9f9f9;
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
