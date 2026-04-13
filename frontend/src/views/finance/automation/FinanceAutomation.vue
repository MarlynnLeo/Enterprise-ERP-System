<!--
/**
 * FinanceAutomation.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="finance-automation">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2>财务自动化管理</h2>
      <p>管理财务自动化任务的执行和监控</p>
    </div>

    <!-- 定时任务状态卡片 -->
    <el-card class="section-card" shadow="never">
      <template #header>
        <div class="section-header">
          <div class="section-title">
            <el-icon class="section-icon" color="#409EFF"><Refresh /></el-icon>
            <span>定时任务状态</span>
          </div>
          <el-button type="primary" link @click="refreshTaskStatus">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
        </div>
      </template>
      <div class="status-grid">
        <div class="status-card">
          <div class="status-card-header">
            <el-icon class="status-icon" :color="taskStatus.monthlyDepreciation?.running ? '#67C23A' : '#909399'">
              <Money />
            </el-icon>
            <span class="status-name">月度折旧计提</span>
          </div>
          <div class="status-card-body">
            <el-tag :type="taskStatus.monthlyDepreciation?.running ? 'success' : 'info'" size="small">
              {{ taskStatus.monthlyDepreciation?.running ? '运行中' : '已停止' }}
            </el-tag>
            <span class="status-schedule">每月1日 02:00</span>
          </div>
        </div>
        <div class="status-card">
          <div class="status-card-header">
            <el-icon class="status-icon" :color="taskStatus.periodEndReminder?.running ? '#67C23A' : '#909399'">
              <Document />
            </el-icon>
            <span class="status-name">期末结转提醒</span>
          </div>
          <div class="status-card-body">
            <el-tag :type="taskStatus.periodEndReminder?.running ? 'success' : 'info'" size="small">
              {{ taskStatus.periodEndReminder?.running ? '运行中' : '已停止' }}
            </el-tag>
            <span class="status-schedule">每月末 20:00</span>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 月度任务区域 -->
    <el-card class="section-card" shadow="never">
      <template #header>
        <div class="section-header">
          <div class="section-title">
            <el-icon class="section-icon" color="#E6A23C"><Calendar /></el-icon>
            <span>月度结转任务</span>
          </div>
        </div>
      </template>
      <el-row :gutter="24">
        <el-col :xs="24" :sm="12">
          <div class="task-card">
            <div class="task-card-header">
              <el-icon class="task-icon" color="#409EFF"><Money /></el-icon>
              <div class="task-info">
                <h4>折旧计提</h4>
                <p>计算固定资产月度折旧并生成分录</p>
              </div>
            </div>
            <div class="task-card-body">
              <el-form :model="depreciationForm" inline>
                <el-form-item label="月份" style="margin-bottom: 0;">
                  <el-date-picker
                    v-model="depreciationForm.month"
                    type="month"
                    placeholder="选择月份"
                    format="YYYY-MM"
                    value-format="YYYY-MM"
                    size="default"

                  />
                </el-form-item>
                <el-form-item style="margin-bottom: 0;">
                  <el-button
                    type="primary"
                    @click="executeDepreciation"
                    :loading="depreciationLoading"
                    :disabled="!depreciationForm.month"
                  >
                    执行
                  </el-button>
                </el-form-item>
              </el-form>
            </div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12">
          <div class="task-card">
            <div class="task-card-header">
              <el-icon class="task-icon" color="#67C23A"><Document /></el-icon>
              <div class="task-info">
                <h4>期末结转</h4>
                <p>结转损益类科目到本年利润</p>
              </div>
            </div>
            <div class="task-card-body">
              <el-form :model="periodEndForm" inline>
                <el-form-item label="期间" style="margin-bottom: 0;">
                  <el-select
                    v-model="periodEndForm.periodId"
                    placeholder="选择期间"
                    size="default"

                  >
                    <el-option
                      v-for="period in accountingPeriods"
                      :key="period.id"
                      :label="period.name"
                      :value="period.id"
                    />
                  </el-select>
                </el-form-item>
                <el-form-item style="margin-bottom: 0;">
                  <el-button
                    type="primary"
                    @click="executePeriodEnd"
                    :loading="periodEndLoading"
                    :disabled="!periodEndForm.periodId"
                  >
                    执行
                  </el-button>
                </el-form-item>
              </el-form>
            </div>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <!-- 年度结存区域 -->
    <el-card class="section-card" shadow="never">
      <template #header>
        <div class="section-header">
          <div class="section-title">
            <el-icon class="section-icon" color="#F56C6C"><Lock /></el-icon>
            <span>年度结存</span>
          </div>
        </div>
      </template>
      <el-row :gutter="24">
        <!-- 财务年度结转 -->
        <el-col :xs="24" :sm="12">
          <div class="task-card year-end-card">
            <div class="task-card-header">
              <el-icon class="task-icon" color="#E6A23C"><Calendar /></el-icon>
              <div class="task-info">
                <h4>财务年度结转</h4>
                <p>将本年利润结转至未分配利润</p>
              </div>
            </div>
            <div class="task-card-body">
              <el-form :model="yearEndForm" label-position="top">
                <el-form-item label="会计年度">
                  <el-select
                    v-model="yearEndForm.year"
                    placeholder="选择年度"
                    style="width: 100%;"
                    @change="loadYearEndStatus"
                  >
                    <el-option
                      v-for="year in availableYears"
                      :key="year"
                      :label="`${year}年度`"
                      :value="year"
                    />
                  </el-select>
                </el-form-item>
                <div v-if="financeYearStatus.year" class="status-info-box">
                  <div class="status-row">
                    <span class="status-label">期间关闭：</span>
                    <el-tag :type="financeYearStatus.allPeriodsClosed ? 'success' : 'warning'" size="small">
                      {{ financeYearStatus.closedCount }}/{{ financeYearStatus.totalCount }}
                    </el-tag>
                  </div>
                  <div class="status-row">
                    <span class="status-label">本年利润：</span>
                    <span :class="financeYearStatus.netProfit >= 0 ? 'text-success' : 'text-danger'">
                      {{ financeYearStatus.netProfit >= 0 ? '+' : '' }}{{ (financeYearStatus.netProfit || 0).toFixed(2) }}
                    </span>
                  </div>
                  <div class="status-row" v-if="financeYearStatus.isTransferred">
                    <el-tag type="success" size="small">已完成年度结转</el-tag>
                  </div>
                </div>
                <el-button
                  type="primary"
                  style="width: 100%;"
                  @click="executeFinanceYearEnd"
                  :loading="financeYearEndLoading"
                  :disabled="!yearEndForm.year || financeYearStatus.isTransferred || !financeYearStatus.allPeriodsClosed"
                >
                  <el-icon><VideoPlay /></el-icon>
                  执行年度结转
                </el-button>
              </el-form>
            </div>
          </div>
        </el-col>
        <!-- 仓库年度结存 -->
        <el-col :xs="24" :sm="12">
          <div class="task-card year-end-card">
            <div class="task-card-header">
              <el-icon class="task-icon" color="#409EFF"><Box /></el-icon>
              <div class="task-info">
                <h4>仓库年度结存</h4>
                <p>生成库存年终结存报表</p>
              </div>
            </div>
            <div class="task-card-body">
              <el-form :model="inventoryYearEndForm" label-position="top">
                <el-form-item label="会计年度">
                  <el-select
                    v-model="inventoryYearEndForm.year"
                    placeholder="选择年度"
                    style="width: 100%;"
                    @change="loadInventoryYearEndStatus"
                  >
                    <el-option
                      v-for="year in availableYears"
                      :key="year"
                      :label="`${year}年度`"
                      :value="year"
                    />
                  </el-select>
                </el-form-item>
                <div v-if="inventoryYearStatus.year" class="status-info-box">
                  <div class="status-row">
                    <span class="status-label">结存记录：</span>
                    <el-tag type="info" size="small">{{ inventoryYearStatus.totalRecords || 0 }} 条</el-tag>
                  </div>
                  <div class="status-row">
                    <span class="status-label">期末金额：</span>
                    <span class="text-success">
                      ¥{{ (inventoryYearStatus.summary?.closingValue || 0).toFixed(2) }}
                    </span>
                  </div>
                  <div class="status-row" v-if="inventoryYearStatus.isFrozen">
                    <el-tag type="danger" size="small">已冻结</el-tag>
                  </div>
                </div>
                <div class="button-group">
                  <el-button
                    type="primary"
                    @click="executeInventoryYearEnd"
                    :loading="inventoryYearEndLoading"
                    :disabled="!inventoryYearEndForm.year || inventoryYearStatus.isFrozen"
                  >
                    <el-icon><VideoPlay /></el-icon>
                    执行结存
                  </el-button>
                  <el-button
                    type="warning"
                    @click="freezeInventoryYearEnd"
                    :loading="inventoryFreezeLoading"
                    :disabled="!inventoryYearEndForm.year || !inventoryYearStatus.hasRecords || inventoryYearStatus.isFrozen"
                  >
                    <el-icon><Lock /></el-icon>
                    冻结
                  </el-button>
                </div>
              </el-form>
            </div>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <!-- 生产成本 -->
    <el-card class="section-card" shadow="never">
      <template #header>
        <div class="section-header">
          <div class="section-title">
            <el-icon class="section-icon" color="#909399"><Document /></el-icon>
            <span>生产成本分录</span>
          </div>
        </div>
      </template>
      <div class="production-cost-section">
        <el-alert
          title="此功能已集成到生产管理模块，生产任务完工时会自动生成成本分录"
          type="info"
          :closable="false"
          show-icon
          style="margin-bottom: 16px;"
        />
        <el-form :model="productionForm" inline>
          <el-form-item label="生产任务">
            <el-select
              v-model="productionForm.taskId"
              placeholder="选择已完成的生产任务"
              filterable

              @focus="loadProductionTasks"
            >
              <el-option
                v-for="task in productionTasks"
                :key="task.id"
                :label="`${task.code} - ${task.product_name || '未知产品'} (${task.quantity})`"
                :value="task.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button
              type="primary"
              @click="executeProductionCost"
              :loading="productionLoading"
              :disabled="!productionForm.taskId"
            >
              生成成本分录
            </el-button>
          </el-form-item>
        </el-form>
      </div>
    </el-card>

    <!-- 执行历史 -->
    <el-card class="section-card" shadow="never">
      <template #header>
        <div class="section-header">
          <div class="section-title">
            <el-icon class="section-icon" color="#909399"><Document /></el-icon>
            <span>执行历史</span>
          </div>
          <el-button type="primary" link @click="refreshHistory">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
        </div>
      </template>
      <el-table :data="executionHistory" style="width: 100%" :empty-text="'暂无执行记录'">
        <el-table-column prop="type" label="任务类型" width="150">
          <template #default="scope">
            <el-tag :type="getTaskTypeColor(scope.row.type)" size="small">
              {{ getTaskTypeName(scope.row.type) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="period" label="执行期间" width="150" />
        <el-table-column prop="status" label="状态" width="120">
          <template #default="scope">
            <el-tag :type="scope.row.status === 'success' ? 'success' : 'danger'" size="small">
              {{ scope.row.status === 'success' ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="result" label="执行结果" min-width="200" />
        <el-table-column prop="executedAt" label="执行时间" width="160" />
        <el-table-column prop="executedBy" label="执行人" width="100" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Money, Document, VideoPlay, Calendar, Box, Lock } from '@element-plus/icons-vue'
import { financeApi, api } from '@/services/api'
import { useAuthStore } from '@/stores/auth'

// 权限store
const authStore = useAuthStore()

// 响应式数据
const taskStatus = ref({})
const depreciationLoading = ref(false)
const periodEndLoading = ref(false)
const productionLoading = ref(false)
const financeYearEndLoading = ref(false)
const inventoryYearEndLoading = ref(false)
const inventoryFreezeLoading = ref(false)
const executionHistory = ref([])
const productionTasks = ref([])
const accountingPeriods = ref([
  { id: 1, name: '2025年第1期间' },
  { id: 2, name: '2025年第2期间' },
  { id: 3, name: '2025年第3期间' },
  { id: 4, name: '2025年第4期间' }
])

// 年度结存相关数据
const financeYearStatus = ref({})
const inventoryYearStatus = ref({})

// 可选年度列表
const availableYears = computed(() => {
  const currentYear = new Date().getFullYear()
  return [currentYear - 2, currentYear - 1, currentYear, currentYear + 1]
})

// 表单数据
const depreciationForm = reactive({
  month: ''
})

const periodEndForm = reactive({
  periodId: null
})

const productionForm = reactive({
  taskId: null
})

const yearEndForm = reactive({
  year: null
})

const inventoryYearEndForm = reactive({
  year: null
})

// 获取定时任务状态
const refreshTaskStatus = async () => {
  try {
    const response = await financeApi.automation.getTaskStatus()
    // 拦截器已解包，response.data 就是业务数据
    if (response?.data) {
      taskStatus.value = response.data
    }
  } catch (error) {
    console.error('获取任务状态失败:', error)
    ElMessage.error('获取任务状态失败')
  }
}

// 执行手动折旧计提
const executeDepreciation = async () => {
  if (!depreciationForm.month) {
    ElMessage.warning('请选择折旧月份')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定要执行 ${depreciationForm.month} 的折旧计提吗？`,
      '确认执行',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    depreciationLoading.value = true

    const response = await financeApi.automation.executeDepreciation(depreciationForm.month)

    // 拦截器已解包，response.data 就是业务数据
    if (response?.data) {
      const result = response.data
      ElMessage.success(`折旧计提执行成功！共计提 ${result.assetCount || 0} 项资产，总金额: ${(result.totalDepreciation || 0).toFixed(2)} 元`)

      // 添加到执行历史
      addToHistory('depreciation', depreciationForm.month, 'success',
        `共计提 ${result.assetCount || 0} 项资产，总金额: ${(result.totalDepreciation || 0).toFixed(2)} 元`)

      // 清空表单
      depreciationForm.month = ''
    } else {
      ElMessage.error('折旧计提执行失败')
    }
    
  } catch (error) {
    if (error !== 'cancel') {
      console.error('折旧计提执行失败:', error)
      ElMessage.error('折旧计提执行失败')
      addToHistory('depreciation', depreciationForm.month, 'failed', error.message || '执行失败')
    }
  } finally {
    depreciationLoading.value = false
  }
}

// 执行手动期末结转
const executePeriodEnd = async () => {
  if (!periodEndForm.periodId) {
    ElMessage.warning('请选择会计期间')
    return
  }

  try {
    const periodName = accountingPeriods.value.find(p => p.id === periodEndForm.periodId)?.name
    
    await ElMessageBox.confirm(
      `确定要执行 ${periodName} 的期末结转吗？`,
      '确认执行',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    periodEndLoading.value = true

    const response = await financeApi.automation.executePeriodEnd(periodEndForm.periodId)

    // 拦截器已解包，response.data 就是业务数据
    if (response?.data) {
      ElMessage.success('期末结转执行成功！')

      // 添加到执行历史
      addToHistory('periodEnd', periodName, 'success', '期末结转完成')

      // 清空表单
      periodEndForm.periodId = null
    } else {
      ElMessage.error('期末结转执行失败')
    }
    
  } catch (error) {
    if (error !== 'cancel') {
      console.error('期末结转执行失败:', error)
      ElMessage.error('期末结转执行失败')
      addToHistory('periodEnd', periodEndForm.periodId, 'failed', error.message || '执行失败')
    }
  } finally {
    periodEndLoading.value = false
  }
}

// 加载生产任务列表
const loadProductionTasks = async () => {
  try {
    // 从后端API获取已完成的生产任务
    const response = await api.get('/production/tasks', {
      params: {
        status: 'completed',
        pageSize: 50,
        page: 1
      }
    })

    // 拦截器已解包，response.data 就是业务数据 { items: [...], total, ... }
    const responseData = response?.data
    // 后端返回 items 数组
    const taskList = responseData?.items || responseData?.list || (Array.isArray(responseData) ? responseData : [])

    if (Array.isArray(taskList) && taskList.length > 0) {
      productionTasks.value = taskList.map(task => ({
        id: task.id,
        code: task.code || task.task_code,
        product_name: task.product_name || task.productName,
        quantity: task.quantity || task.planned_quantity,
        status: task.status
      }))
    } else {
      productionTasks.value = []
      ElMessage.info('暂无已完成的生产任务')
    }
  } catch (error) {
    console.error('加载生产任务失败:', error)
    ElMessage.warning('加载生产任务失败，可能没有已完成的任务')
    productionTasks.value = []
  }
}

// 执行生产成本分录生成
const executeProductionCost = async () => {
  try {
    const selectedTask = productionTasks.value.find(task => task.id === productionForm.taskId)
    if (!selectedTask) {
      ElMessage.error('请选择有效的生产任务')
      return
    }

    await ElMessageBox.confirm(
      `确认为生产任务 ${selectedTask.code} 生成成本分录吗？`,
      '确认执行',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    productionLoading.value = true

    const response = await financeApi.automation.executeProductionCost(productionForm.taskId)

    // 拦截器已解包，response.data 就是业务数据
    if (response?.data) {
      ElMessage.success('生产成本分录生成成功！')

      // 添加到执行历史
      addToHistory('production', selectedTask.code, 'success',
        `成本分录生成成功，总成本: ${response.data.totalCost || 0}元`)

      // 清空表单
      productionForm.taskId = null
    } else {
      ElMessage.error('生产成本分录生成失败')
    }

  } catch (error) {
    if (error !== 'cancel') {
      console.error('生产成本分录生成失败:', error)
      ElMessage.error('生产成本分录生成失败')
      addToHistory('production', productionForm.taskId, 'failed', error.message || '执行失败')
    }
  } finally {
    productionLoading.value = false
  }
}

// 添加到执行历史
const addToHistory = (type, period, status, result) => {
  executionHistory.value.unshift({
    type,
    period,
    status,
    result,
    executedAt: new Date().toLocaleString(),
    executedBy: '当前用户'
  })
}

// 获取任务类型名称
const getTaskTypeName = (type) => {
  const typeMap = {
    'depreciation': '折旧计提',
    'periodEnd': '期末结转',
    'production': '生产成本',
    'financeYearEnd': '财务年度结转',
    'inventoryYearEnd': '仓库年度结存',
    'inventoryYearFreeze': '仓库结存冻结'
  }
  return typeMap[type] || '未知类型'
}

// 获取任务类型颜色
const getTaskTypeColor = (type) => {
  const colorMap = {
    'depreciation': 'primary',
    'periodEnd': 'success',
    'production': 'warning',
    'financeYearEnd': 'danger',
    'inventoryYearEnd': 'info',
    'inventoryYearFreeze': 'warning'
  }
  return colorMap[type] || 'info'
}

// ==================== 年度结存相关方法 ====================

// 加载财务年度结转状态
const loadYearEndStatus = async () => {
  if (!yearEndForm.year) {
    financeYearStatus.value = {}
    return
  }

  try {
    const response = await api.get(`/finance-enhancement/period/year-end-status/${yearEndForm.year}`)
    if (response?.data) {
      financeYearStatus.value = response.data
    }
  } catch (error) {
    console.error('获取年度结转状态失败:', error)
    financeYearStatus.value = {}
  }
}

// 执行财务年度结转
const executeFinanceYearEnd = async () => {
  if (!yearEndForm.year) {
    ElMessage.warning('请选择会计年度')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定要执行 ${yearEndForm.year} 年度的财务结转吗？此操作将把本年利润结转到未分配利润。`,
      '确认执行年度结转',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    financeYearEndLoading.value = true

    const response = await api.post('/finance-enhancement/period/year-end-transfer', {
      year: yearEndForm.year
    })

    if (response?.data) {
      ElMessage.success(response.data.message || '年度结转执行成功！')
      addToHistory('financeYearEnd', `${yearEndForm.year}年度`, 'success', response.data.message)
      await loadYearEndStatus()
    } else {
      ElMessage.error('年度结转执行失败')
    }

  } catch (error) {
    if (error !== 'cancel') {
      console.error('年度结转执行失败:', error)
      ElMessage.error(error.response?.data?.message || '年度结转执行失败')
      addToHistory('financeYearEnd', `${yearEndForm.year}年度`, 'failed', error.message || '执行失败')
    }
  } finally {
    financeYearEndLoading.value = false
  }
}

// 加载仓库年度结存状态
const loadInventoryYearEndStatus = async () => {
  if (!inventoryYearEndForm.year) {
    inventoryYearStatus.value = {}
    return
  }

  try {
    const response = await api.get(`/inventory/year-end/status/${inventoryYearEndForm.year}`)
    if (response?.data) {
      inventoryYearStatus.value = response.data
    }
  } catch (error) {
    console.error('获取仓库年度结存状态失败:', error)
    inventoryYearStatus.value = {}
  }
}

// 执行仓库年度结存
const executeInventoryYearEnd = async () => {
  if (!inventoryYearEndForm.year) {
    ElMessage.warning('请选择会计年度')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定要执行 ${inventoryYearEndForm.year} 年度的库存结存吗？系统将统计全年库存收发存数据。`,
      '确认执行库存结存',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    inventoryYearEndLoading.value = true

    const response = await api.post('/inventory/year-end/execute', {
      year: inventoryYearEndForm.year
    })

    if (response?.data) {
      ElMessage.success(response.data.message || '库存结存执行成功！')
      addToHistory('inventoryYearEnd', `${inventoryYearEndForm.year}年度`, 'success', response.data.message)
      await loadInventoryYearEndStatus()
    } else {
      ElMessage.error('库存结存执行失败')
    }

  } catch (error) {
    if (error !== 'cancel') {
      console.error('库存结存执行失败:', error)
      ElMessage.error(error.response?.data?.message || '库存结存执行失败')
      addToHistory('inventoryYearEnd', `${inventoryYearEndForm.year}年度`, 'failed', error.message || '执行失败')
    }
  } finally {
    inventoryYearEndLoading.value = false
  }
}

// 冻结仓库年度结存
const freezeInventoryYearEnd = async () => {
  if (!inventoryYearEndForm.year) {
    ElMessage.warning('请选择会计年度')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定要冻结 ${inventoryYearEndForm.year} 年度的库存结存吗？冻结后数据将无法修改，并作为下年度期初余额。`,
      '确认冻结结存',
      {
        confirmButtonText: '确定冻结',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    inventoryFreezeLoading.value = true

    const response = await api.post('/inventory/year-end/freeze', {
      year: inventoryYearEndForm.year
    })

    if (response?.data) {
      ElMessage.success(response.data.message || '结存冻结成功！')
      addToHistory('inventoryYearFreeze', `${inventoryYearEndForm.year}年度`, 'success', '结存已冻结')
      await loadInventoryYearEndStatus()
    } else {
      ElMessage.error('结存冻结失败')
    }

  } catch (error) {
    if (error !== 'cancel') {
      console.error('结存冻结失败:', error)
      ElMessage.error(error.response?.data?.message || '结存冻结失败')
    }
  } finally {
    inventoryFreezeLoading.value = false
  }
}

// 刷新执行历史
const refreshHistory = async () => {
  try {
    const response = await api.get('/finance-enhancement/automation/history', {
      params: { page: 1, pageSize: 50 }
    })
    if (response?.data?.items) {
      executionHistory.value = response.data.items.map(item => ({
        ...item,
        executedAt: item.executedAt ? new Date(item.executedAt).toLocaleString() : ''
      }))
    }
  } catch (error) {
    console.error('获取执行历史失败:', error)
    // 如果获取失败，保持现有数据不变
  }
}

// 组件挂载时获取初始数据
onMounted(() => {
  refreshTaskStatus()
  refreshHistory()
})
</script>

<style scoped>
/* 页面容器 */
.finance-automation {
  padding: 16px;
}

/* 页面标题 */
.page-header {
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0 0 4px 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.page-header p {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}

/* 区块卡片 */
.section-card {
  margin-bottom: 16px;
  border-radius: 8px;
  border: none;
}

.section-card :deep(.el-card__header) {
  padding: 14px 20px;
  border-bottom: 1px solid #f0f0f0;
  background-color: var(--color-bg-light);
}

.section-card :deep(.el-card__body) {
  padding: 20px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.section-icon {
  font-size: 18px;
}

/* 状态网格 */
.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.status-card {
  padding: 16px;
  background: linear-gradient(135deg, #f8f9fa 0%, #fff 100%);
  border: 1px solid var(--color-border-lighter);
  border-radius: 8px;
}

.status-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.status-icon {
  font-size: 20px;
}

.status-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-regular);
}

.status-card-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.status-schedule {
  font-size: 12px;
  color: var(--color-text-secondary);
}

/* 任务卡片 */
.task-card {
  padding: 20px;
  background: #fff;
  border: 1px solid var(--color-border-lighter);
  border-radius: 8px;
  transition: box-shadow 0.2s;
}

.task-card:hover {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.task-card-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
}

.task-icon {
  font-size: 28px;
  flex-shrink: 0;
  margin-top: 2px;
}

.task-info h4 {
  margin: 0 0 4px 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.task-info p {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.task-card-body {
  padding-top: 4px;
}

/* 年度结存卡片 */
.year-end-card {
  min-height: 280px;
}

.year-end-card .task-card-body {
  padding-top: 8px;
}

.status-info-box {
  padding: 12px;
  background-color: #f8f9fa;
  border-radius: 6px;
  margin-bottom: 16px;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.status-row:last-child {
  margin-bottom: 0;
}

.status-row .status-label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.text-success {
  color: var(--color-success);
  font-weight: 600;
}

.text-danger {
  color: var(--color-danger);
  font-weight: 600;
}

/* 按钮组 */
.button-group {
  display: flex;
  gap: 10px;
}

.button-group .el-button {
  flex: 1;
}

/* 生产成本区域 */
.production-cost-section {
  padding: 4px 0;
}

/* 响应式布局 */
@media (max-width: 768px) {
  .finance-automation {
    padding: 12px;
  }

  .status-grid {
    grid-template-columns: 1fr;
  }

  .task-card {
    margin-bottom: 12px;
  }

  .year-end-card {
    min-height: auto;
  }
}

/* 表格样式优化 */
:deep(.el-table) {
  border-radius: 6px;
}

:deep(.el-table th) {
  background-color: var(--color-bg-light) !important;
  font-weight: 600;
}
</style>
