<template>
  <div class="app-container">
    <!-- 头部区域 -->
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>期末结转</h2>
          <p class="subtitle">期末损益结转与会计期间关账</p>
        </div>
      </div>
    </el-card>

    <el-card class="box-card mb-4">
      <el-steps :active="activeStep" finish-status="success" simple style="margin-bottom: 20px">
        <el-step title="选择期间" />
        <el-step title="结转预览" />
        <el-step title="执行结转" />
      </el-steps>

      <!-- 步骤1: 选择期间 -->
      <div v-if="activeStep === 0" class="step-content">
        <el-form :inline="true" class="search-form demo-form-inline">
          <el-form-item label="待结转期间">
            <el-select v-model="selectedPeriodId" placeholder="选择会计期间">
              <el-option
                v-for="period in openPeriods"
                :key="period.id"
                :label="period.period_name"
                :value="period.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="fetchPreview" :disabled="!selectedPeriodId">
              下一步
            </el-button>
          </el-form-item>
        </el-form>
        
        <el-alert
          title="说明"
          type="info"
          :closable="false"
          class="mt-4"
          description="期末结转将把所有损益类科目（收入、费用、成本）的余额转入本年利润科目。结转后，该会计期间将被关闭。"
        />
      </div>

      <!-- 步骤2: 结转预览 -->
      <div v-if="activeStep === 1" class="step-content">
        <div v-if="previewData">
          <el-alert
            v-if="!previewData.canClose"
            title="无法结转：存在未过账凭证"
            type="error"
            :closable="false"
            show-icon
            class="mb-4"
          >
            本期还有 {{ previewData.unpostedCount }} 张未过账凭证，请先完成过账。
          </el-alert>

          <el-descriptions title="结转摘要" :column="3" border class="mb-4">
            <el-descriptions-item label="会计期间">{{ previewData.period.period_name }}</el-descriptions-item>
            <el-descriptions-item label="总收入">{{ formatCurrency(previewData.summary.totalIncome) }}</el-descriptions-item>
            <el-descriptions-item label="总费用">{{ formatCurrency(previewData.summary.totalExpense) }}</el-descriptions-item>
            <el-descriptions-item label="本期净利润">
              <span :class="previewData.summary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'">
                {{ formatCurrency(previewData.summary.netProfit) }}
              </span>
            </el-descriptions-item>
          </el-descriptions>

          <el-table :data="previewData.closingItems" border style="width: 100%" height="400">
            <el-table-column prop="account_code" label="科目编码" width="120" />
            <el-table-column prop="account_name" label="科目名称" width="200" />
            <el-table-column prop="account_type" label="类型" width="100" />
            <el-table-column prop="total_debit" label="借方发生" align="right">
              <template #default="{ row }">
                {{ formatCurrency(row.total_debit) }}
              </template>
            </el-table-column>
            <el-table-column prop="total_credit" label="贷方发生" align="right">
              <template #default="{ row }">
                {{ formatCurrency(row.total_credit) }}
              </template>
            </el-table-column>
            <el-table-column prop="closing_amount" label="结转金额" align="right">
              <template #default="{ row }">
                {{ formatCurrency(row.closing_amount) }}
              </template>
            </el-table-column>
            <el-table-column prop="closing_direction" label="结转方向" width="100" align="center">
              <template #default="{ row }">
                <el-tag :type="row.closing_direction === '借方' ? 'success' : 'warning'">
                  {{ row.closing_direction }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>

          <div class="mt-4 flex justify-end">
            <el-button @click="activeStep = 0">上一步</el-button>
            <el-button 
              type="primary" 
              @click="executeClosing" 
              :disabled="!previewData.canClose"
              :loading="closingLoading"
            >
              确认并执行结转
            </el-button>
          </div>
        </div>
      </div>

      <!-- 步骤3: 完成 -->
      <div v-if="activeStep >= 2" class="step-content text-center py-8">
        <el-result
          icon="success"
          title="期末结转完成"
          sub-title="损益科目已结转至本年利润，会计期间已关闭"
        >
          <template #extra>
            <el-button type="primary" @click="resetWizard">返回</el-button>
            <el-button @click="showHistory = true">查看历史记录</el-button>
          </template>
        </el-result>
      </div>
    </el-card>

    <!-- 结转历史记录 -->
    <el-card class="box-card">
      <template #header>
        <div class="card-header">
          <span>结转历史记录</span>
        </div>
      </template>
      <div class="filter-container mb-4">
        <el-select v-model="historyPeriodId" placeholder="选择会计期间" clearable @change="fetchHistory">
          <el-option
            v-for="item in periods"
            :key="item.id"
            :label="item.period_name"
            :value="item.id"
          />
        </el-select>
      </div>
      <el-table :data="historyList" border style="width: 100%">
        <el-table-column prop="entry_number" label="凭证编号" width="180" />
        <el-table-column prop="entry_date" label="结转日期" width="120">
          <template #default="{ row }">
            {{ formatDate(row.entry_date) }}
          </template>
        </el-table-column>
        <el-table-column prop="description" label="摘要" />
        <el-table-column prop="operator_name" label="操作人" width="120" />
        <el-table-column prop="created_at" label="操作时间" width="180">
          <template #default="{ row }">
            {{ formatDateTime(row.created_at) }}
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import request from '@/utils/request'
import { formatCurrency, formatDate, formatDateTime } from '@/utils/format'
import { ElMessage, ElMessageBox } from 'element-plus'

const activeStep = ref(0)
const periods = ref([])
const selectedPeriodId = ref('')
const previewData = ref(null)
const closingLoading = ref(false)
const historyList = ref([])
const historyPeriodId = ref('')

// 计算未关闭的期间
const openPeriods = computed(() => {
  return periods.value.filter(p => !p.is_closed)
})

// 获取会计期间列表
const fetchPeriods = async () => {
  try {
    const res = await request.get('/finance/periods')
    periods.value = res.data.periods

    // 智能默认期间：优先匹配当前系统月份对应的期间
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    const currentPeriodKeyword = `${currentYear}年${currentMonth}月`

    if (openPeriods.value.length > 0) {
      // 1. 优先找当前月份的未关闭期间
      let bestPeriod = openPeriods.value.find(
        p => p.period_name && p.period_name.includes(currentPeriodKeyword)
      )

      // 2. 若当前月份已关闭，则取下一个按时间排序最早的未关闭月度期间
      if (!bestPeriod) {
        bestPeriod = openPeriods.value
          .filter(p => p.period_name && /年\d+月$/.test(p.period_name))
          .sort((a, b) => a.id - b.id)[0]
      }

      // 3. 最终 fallback：取第一个未关闭期间
      if (!bestPeriod) {
        bestPeriod = openPeriods.value[0]
      }

      selectedPeriodId.value = bestPeriod.id
    }

    // 加载最近期间的历史记录
    if (periods.value.length > 0) {
      historyPeriodId.value = periods.value[0].id
      fetchHistory()
    }
  } catch (error) {
    console.error('获取会计期间失败', error)
  }
}

// 获取结转预览
const fetchPreview = async () => {
  if (!selectedPeriodId.value) return
  
  try {
    const res = await request.get(`/finance/gl/closing/preview/${selectedPeriodId.value}`)
    previewData.value = res.data
    activeStep.value = 1
  } catch (error) {
    console.error('获取预览失败', error)
    ElMessage.error(error.message || '获取预览失败')
  }
}

// 执行结转
const executeClosing = async () => {
  try {
    await ElMessageBox.confirm(
      '确定要执行期末结转吗？此操作将生成结转凭证并关闭当前会计期间，且不可撤销（除非重新开启期间）。',
      '确认结转',
      {
        confirmButtonText: '确定执行',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    closingLoading.value = true
    const res = await request.post(`/finance/gl/closing/execute/${selectedPeriodId.value}`)
    
    // 显示成功消息（ResponseHandler返回格式：{success, message, data}）
    ElMessage.success(res.message || '期末结转执行成功')
    
    // 更新步骤到完成状态（设置为3使所有步骤显示为完成）
    activeStep.value = 3
    
    // 刷新期间状态和历史
    await fetchPeriods()
    await fetchHistory()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('结转失败', error)
      ElMessage.error(error.message || '结转失败')
    }
  } finally {
    closingLoading.value = false
  }
}

// 获取历史记录
const fetchHistory = async () => {
  if (!historyPeriodId.value) return
  
  try {
    const res = await request.get(`/finance/gl/closing/history/${historyPeriodId.value}`)
    historyList.value = res.data.entries
  } catch (error) {
    console.error('获取历史记录失败', error)
  }
}

const resetWizard = () => {
  activeStep.value = 0
  selectedPeriodId.value = ''
  previewData.value = null
  // 重新选择一个未关闭的期间
  if (openPeriods.value.length > 0) {
    selectedPeriodId.value = openPeriods.value[0].id
  }
}

onMounted(() => {
  fetchPeriods()
})
</script>

<style scoped>
.app-container {
  padding: 20px;
}

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

.mb-4 {
  margin-bottom: 16px;
}
.mt-4 {
  margin-top: 16px;
}
.py-8 {
  padding-top: 2rem;
  padding-bottom: 2rem;
}
.text-center {
  text-align: center;
}
.flex {
  display: flex;
}
.justify-end {
  justify-content: flex-end;
}
.text-green-600 {
  color: #059669;
}
.text-red-600 {
  color: #dc2626;
}
</style>
