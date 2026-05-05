<template>
  <div class="app-container">
    <!-- 头部区域 -->
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>预算执行分析</h2>
          <p class="subtitle">预算执行进度与差异分析</p>
        </div>
      </div>
    </el-card>

    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" class="search-form">
        <el-form-item label="选择预算">
          <el-select v-model="selectedBudgetId" placeholder="请选择预算方案" @change="fetchAnalysis">
            <el-option
              v-for="item in budgetList"
              :key="item.id"
              :label="item.budget_name"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchAnalysis" :disabled="!selectedBudgetId">
            <el-icon><Search /></el-icon> 分析
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <div v-if="analysisData" v-loading="loading">
      <!-- 概览卡片 -->
      <el-row :gutter="20" class="mb-4">
        <el-col :span="6">
          <el-card shadow="hover">
            <template #header>
              <div class="card-header">总预算</div>
            </template>
            <div class="card-value">{{ formatCurrency(summary.total_budget) }}</div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card shadow="hover">
            <template #header>
              <div class="card-header">实际执行</div>
            </template>
            <div class="card-value text-blue">{{ formatCurrency(summary.total_actual) }}</div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card shadow="hover">
            <template #header>
              <div class="card-header">预算结余</div>
            </template>
            <div class="card-value" :class="summary.total_variance >= 0 ? 'text-green' : 'text-red'">
              {{ formatCurrency(summary.total_variance) }}
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card shadow="hover">
            <template #header>
              <div class="card-header">总体执行率</div>
            </template>
            <div class="card-value">
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
            </div>
          </el-card>
        </el-col>
      </el-row>

      <!-- 图表区域 -->
      <el-card class="mb-4" shadow="hover">
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
      <el-card shadow="hover">
        <template #header>
          <div class="card-header">
            <span>执行明细表</span>
          </div>
        </template>
        <el-table :data="analysisData.details" border style="width: 100%" stripe>
          <el-table-column prop="account_code" label="科目编码" width="120" sortable />
          <el-table-column prop="account_name" label="预算科目" min-width="150" />
          <el-table-column prop="budget_amount" label="预算金额" align="right" width="150">
            <template #default="{ row }">
              {{ formatCurrency(row.budget_amount) }}
            </template>
          </el-table-column>
          <el-table-column prop="actual_amount" label="实际金额" align="right" width="150">
            <template #default="{ row }">
              {{ formatCurrency(row.actual_amount) }}
            </template>
          </el-table-column>
          <el-table-column prop="variance" label="差异 (结余)" align="right" width="150">
            <template #default="{ row }">
              <span :class="row.variance >= 0 ? 'text-green' : 'text-red'">
                {{ formatCurrency(row.variance) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="执行进度" width="200">
            <template #default="{ row }">
              <el-progress 
                :percentage="Math.min(row.execution_rate, 100)" 
                :status="getProgressStatus(row.execution_rate)"
                :format="() => row.execution_rate.toFixed(1) + '%'"
              />
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="getStatusType(row.status)">
                {{ getStatusLabel(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>

    <el-empty v-else description="请选择一个预算方案以查看分析" />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '@/services/axiosInstance'
import { formatCurrency } from '@/utils/format'
import { Search } from '@element-plus/icons-vue'
import Chart from 'chart.js/auto'

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
    const res = await api.get('/finance/budgets')
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
    const res = await api.get(`/finance/budgets/${selectedBudgetId.value}/analysis`)
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
      labels: sortedDetails.map(item => item.account_name),
      datasets: [
        {
          label: '预算金额',
          data: sortedDetails.map(item => item.budget_amount),
          backgroundColor: 'rgba(54, 162, 235, 0.5)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 1
        },
        {
          label: '实际金额',
          data: sortedDetails.map(item => item.actual_amount),
          backgroundColor: 'rgba(255, 99, 132, 0.5)',
          borderColor: 'rgba(255, 99, 132, 1)',
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

.search-card {
  margin-bottom: 20px;
}

.search-form .el-form-item {
  margin-bottom: 0;
}

.mb-4 {
  margin-bottom: 20px;
}
.card-header {
  font-weight: bold;
}
.card-value {
  font-size: 24px;
  font-weight: bold;
  text-align: center;
  padding: 10px 0;
}
.text-blue { color: var(--color-primary); }
.text-green { color: var(--color-success); }
.text-red { color: var(--color-danger); }

.chart-container {
  position: relative;
  height: 400px;
  width: 100%;
}
.percentage-value {
  display: block;
  font-size: 20px;
}
</style>
