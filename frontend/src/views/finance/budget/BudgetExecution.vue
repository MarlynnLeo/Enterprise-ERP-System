<template>
  <div class="module-page budget-execution-page">
    <PageHeader title="预算执行" subtitle="预算执行进度与差异分析" />

    <FinanceQueryCard
      :loading="loading"
      @search="fetchAnalysis"
      @reset="resetSearch"
    >
      <template #basic>
        <el-form-item label="选择预算">
          <el-select v-model="selectedBudgetId" placeholder="请选择预算方案" clearable>
            <el-option
              v-for="item in budgetList"
              :key="item.id"
              :label="item.budgetName"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
      </template>
    </FinanceQueryCard>

    <div v-if="analysisData" v-loading="loading" class="analysis-body">
      <!-- 概览卡片 -->
      <el-row :gutter="16" class="stats-row">
        <el-col :xs="12" :sm="12" :md="6">
          <el-card shadow="hover" class="stat-card summary-card">
            <div class="stat-label">总预算</div>
            <div class="stat-value">{{ formatCurrency(summary.total_budget) }}</div>
          </el-card>
        </el-col>
        <el-col :xs="12" :sm="12" :md="6">
          <el-card shadow="hover" class="stat-card summary-card">
            <div class="stat-label">实际执行</div>
            <div class="stat-value text-primary">{{ formatCurrency(summary.total_actual) }}</div>
          </el-card>
        </el-col>
        <el-col :xs="12" :sm="12" :md="6">
          <el-card shadow="hover" class="stat-card summary-card">
            <div class="stat-label">预算结余</div>
            <div
              class="stat-value"
              :class="summary.total_variance >= 0 ? 'text-success' : 'text-danger'"
            >
              {{ formatCurrency(summary.total_variance) }}
            </div>
          </el-card>
        </el-col>
        <el-col :xs="12" :sm="12" :md="6">
          <el-card shadow="hover" class="stat-card summary-card summary-card--progress">
            <div class="stat-label">总体执行率</div>
            <el-progress
              type="dashboard"
              :percentage="Math.min(summary.total_execution_rate, 100)"
              :status="getProgressStatus(summary.total_execution_rate)"
              :width="80"
            >
              <template #default>
                <span class="percentage-value">{{ summary.total_execution_rate.toFixed(1) }}%</span>
              </template>
            </el-progress>
          </el-card>
        </el-col>
      </el-row>

      <!-- 图表区域 -->
      <el-card class="data-card" shadow="never">
        <template #header>
          <div class="card-header">
            <span>预算执行对比图</span>
          </div>
        </template>
        <div class="chart-container">
          <canvas id="budgetChart"></canvas>
        </div>
      </el-card>

      <!-- 详细表格 -->
      <el-card class="data-card" shadow="never">
        <template #header>
          <div class="card-header">
            <span>执行明细表</span>
          </div>
        </template>
        <el-table :data="analysisData.details" border class="w-full" stripe>
          <el-table-column prop="accountCode" label="科目编码" width="120" sortable />
          <el-table-column prop="accountName" label="预算科目" min-width="150" />
          <el-table-column prop="budgetAmount" label="预算金额" width="150">
            <template #default="{ row }">
              {{ formatCurrency(row.budgetAmount) }}
            </template>
          </el-table-column>
          <el-table-column prop="actualAmount" label="实际金额" width="150">
            <template #default="{ row }">
              {{ formatCurrency(row.actualAmount) }}
            </template>
          </el-table-column>
          <el-table-column prop="variance" label="差异 (结余)" width="150">
            <template #default="{ row }">
              <span :class="row.variance >= 0 ? 'text-green' : 'text-red'">
                {{ formatCurrency(row.variance) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="执行进度" width="200">
            <template #default="{ row }">
              <el-progress
                :percentage="Math.min(row.executionRate, 100)"
                :status="getProgressStatus(row.executionRate)"
                :format="() => row.executionRate.toFixed(1) + '%'"
              />
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="getStatusType(row.status)">
                {{ getStatusLabel(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>

    <EmptyState v-else description="请选择一个预算方案以查看分析" />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { financeApi } from '@/api/finance'
import { formatCurrency } from '@/utils/format'
import Chart from '@/utils/chartCore'
import { alphaColor, getCssTokenValue } from '@/utils/designTokens'

const route = useRoute()
const loading = ref(false)
const budgetList = ref([])
const selectedBudgetId = ref('')
const analysisData = ref(null)
const summary = ref({
  total_budget: 0,
  total_actual: 0,
  total_variance: 0,
  total_execution_rate: 0
})

let chartInstance = null

// 获取预算列表
const fetchBudgetList = async () => {
  try {
    const res = await financeApi.budgets.getList()
    budgetList.value = res.data.list || []

    // 如果路由带了预算ID，优先选中
    const routeId = route.params.id
    if (routeId) {
      selectedBudgetId.value = parseInt(routeId)
    } else if (budgetList.value.length > 0) {
      selectedBudgetId.value = budgetList.value[0].id
    }

    if (selectedBudgetId.value) {
      fetchAnalysis()
    }
  } catch (error) {
    console.error('获取预算列表失败', error)
  }
}

// 获取分析数据
const fetchAnalysis = async () => {
  if (!selectedBudgetId.value) return

  loading.value = true
  try {
    const res = await financeApi.budgets.getAnalysis(selectedBudgetId.value)
    analysisData.value = res.data
    summary.value = res.data.summary

    await nextTick()
    renderChart(res.data.details)
  } catch (error) {
    console.error('获取分析数据失败', error)
  } finally {
    loading.value = false
  }
}

const resetSearch = () => {
  selectedBudgetId.value = ''
  analysisData.value = null
  summary.value = {
    total_budget: 0,
    total_actual: 0,
    total_variance: 0,
    total_execution_rate: 0
  }
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }
}

// 渲染图表
const renderChart = (details) => {
  const ctx = document.getElementById('budgetChart')
  if (!ctx) return

  if (chartInstance) {
    chartInstance.destroy()
  }

  // 排序前10个金额最大的科目，避免图表过密
  const sortedDetails = [...details].sort((a, b) => b.budget_amount - a.budget_amount).slice(0, 15)

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sortedDetails.map(item => item.accountName),
      datasets: [
        {
          label: '预算金额',
          data: sortedDetails.map(item => item.budgetAmount),
          backgroundColor: alphaColor('primary', 0.5),
          borderColor: getCssTokenValue('primary'),
          borderWidth: 1
        },
        {
          label: '实际金额',
          data: sortedDetails.map(item => item.actualAmount),
          backgroundColor: alphaColor('danger', 0.5),
          borderColor: getCssTokenValue('danger'),
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
        },
        title: {
          display: true,
          text: '重点科目预算执行对比 (Top 15)'
        }
      },
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  })
}

// 辅助函数
const getProgressStatus = (rate) => {
  if (rate > 100) return 'exception'
  if (rate > 90) return 'warning'
  return 'success'
}

const getStatusType = (status) => {
  switch (status) {
    case 'over_budget': return 'danger'
    case 'warning': return 'warning'
    case 'normal': return 'success'
    default: return 'info'
  }
}

const getStatusLabel = (status) => {
  switch (status) {
    case 'over_budget': return '超支'
    case 'warning': return '预警'
    case 'normal': return '正常'
    default: return '未知'
  }
}

onMounted(() => {
  fetchBudgetList()
})

onUnmounted(() => {
  if (chartInstance) {
    chartInstance.destroy()
  }
})
</script>

<style scoped>
/* 根节点交给 .module-page；卡片间距由 data-card / stats-row 约定 */

.analysis-body {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.summary-card {
  height: 100%;
  text-align: center;
}

.summary-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 110px;
  gap: 8px;
}

.summary-card--progress :deep(.el-card__body) {
  min-height: 140px;
}

.stat-label {
  font-size: 13px;
  color: var(--color-text-secondary, var(--el-text-color-secondary));
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text-primary, var(--el-text-color-primary));
  line-height: 1.2;
}

.text-primary {
  color: var(--color-primary);
}

.text-success {
  color: var(--color-success);
}

.text-danger {
  color: var(--color-danger);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
}

.chart-container {
  position: relative;
  height: 400px;
  width: 100%;
}

.percentage-value {
  display: block;
  font-size: 18px;
  font-weight: 600;
}
</style>
