<template>
  <div class="inventory-dashboard">
    <el-card class="header-card">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h2>库存数据概览</h2>
        <div>
          <span v-if="lastUpdated" class="last-updated">
            最后更新: {{ lastUpdated.toLocaleTimeString() }}
          </span>
        </div>
      </div>
    </el-card>
    <!-- 统计卡片 -->
    <el-row :gutter="20" class="mt-20">
      <el-col :xs="24" :sm="12" :md="6" :lg="6" class="mb-20">
        <el-card class="stat-card primary-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-title">总库存量</div>
            <div class="stat-info">
              <div class="stat-main">
                <div class="stat-value">{{ formatQuantity(statistics.totalStock) }}</div>
                <div class="stat-label">库存总量</div>
              </div>
              <div class="stat-secondary">
                <div class="stat-secondary-value">{{ formatCurrency(statistics.totalValue) }}</div>
                <div class="stat-secondary-label">总价值</div>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6" :lg="6" class="mb-20">
        <el-card class="stat-card success-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-title">本月入库</div>
            <div class="stat-info">
              <div class="stat-main">
                <div class="stat-value">{{ statistics.inbound.count }}</div>
                <div class="stat-label">入库单数</div>
              </div>
              <div class="stat-secondary">
                <div class="stat-secondary-value">{{ formatQuantity(statistics.inbound.items) }}</div>
                <div class="stat-secondary-label">物料数</div>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6" :lg="6" class="mb-20">
        <el-card class="stat-card info-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-title">本月出库</div>
            <div class="stat-info">
              <div class="stat-main">
                <div class="stat-value">{{ statistics.outbound.count }}</div>
                <div class="stat-label">出库单数</div>
              </div>
              <div class="stat-secondary">
                <div class="stat-secondary-value">{{ formatQuantity(statistics.outbound.items) }}</div>
                <div class="stat-secondary-label">物料数</div>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6" :lg="6" class="mb-20">
        <el-card class="stat-card warning-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-title">库存预警</div>
            <div class="stat-info">
              <div class="stat-main">
                <div class="stat-value">{{ statistics.alerts.low }}</div>
                <div class="stat-label">低库存</div>
              </div>
              <div class="stat-secondary">
                <div class="stat-secondary-value">{{ formatQuantity(statistics.alerts.overstock) }}</div>
                <div class="stat-secondary-label">超额库存</div>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
    <!-- 图表区域 -->
    <el-row :gutter="20" class="mt-20">
      <el-col :xs="24" :md="12" class="mb-20">
        <el-card class="dashboard-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span>近 12 个月出入库趋势</span>
            </div>
          </template>
          <div class="chart-container">
            <canvas ref="inventoryTrendChart" height="300"></canvas>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="12" class="mb-20">
        <el-card class="dashboard-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span>库存分类占比</span>
            </div>
          </template>
          <div class="chart-container">
            <canvas v-if="categoryDistribution.length > 0" ref="categoryChart" height="300"></canvas>
            <el-empty v-else description="暂无分类数据" />
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row class="mt-20">
      <el-col :span="24" class="mb-20">
        <el-card class="dashboard-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span>库存预警概览</span>
              <el-tag v-if="alertItems.length > 0" type="danger" size="small" effect="plain">
                {{ alertItems.length }} 项预警
              </el-tag>
            </div>
          </template>

          <div class="alert-overview">

            <el-table
              v-if="alertItems.length > 0"
              :data="paginatedAlertItems"
              border
              :max-height="400"
              empty-text="暂无预警物料"
              class="alert-table"
            >
              <el-table-column label="物料名称" prop="name" min-width="160">
                <template #default="scope">
                  <div class="alert-cell-name">
                    <strong>{{ scope.row.name || '-' }}</strong>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="物料编码" prop="code" min-width="140">
                <template #default="scope">
                  {{ scope.row.code || '-' }}
                </template>
              </el-table-column>
              <el-table-column label="存放位置" prop="location" min-width="120">
                <template #default="scope">
                  {{ scope.row.location || '-' }}
                </template>
              </el-table-column>
              <el-table-column label="当前库存" min-width="100" align="right">
                <template #default="scope">
                  <span :class="{ 'text-danger': isCriticalStock(scope.row), 'text-warning': scope.row.type === 'low' }">
                    {{ formatQuantity(scope.row.quantity) }}
                  </span>
                  <span class="unit-text">{{ scope.row.unit || '' }}</span>
                </template>
              </el-table-column>
              <el-table-column label="预警状态" min-width="100" align="center">
                <template #default="scope">
                  <el-tag :type="getStatusTagType(scope.row)" size="small">{{ getStatusText(scope.row) }}</el-tag>
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-else description="暂无预警物料" />

            <div class="pagination-container" v-if="alertItems.length > alertPageSize">
              <el-pagination
                v-model:current-page="alertCurrentPage"
                v-model:page-size="alertPageSize"
                :page-sizes="[5, 10, 20]"
                layout="total, sizes, prev, pager, next"
                :total="alertItems.length"
              />
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import Chart from '@/utils/chartCore'
import { inventoryApi } from '@/api'
import { parseDataObject } from '@/utils/responseParser'
import { formatCurrency, formatQuantity } from '@/utils/dashboardUtils'
import {
  chartColors,
  createLineChartConfig,
  createPieChartConfig
} from '@/utils/chartConfig'

const loading = ref(false)
const lastUpdated = ref(null)
const dashboardData = ref({})
const inventoryTrendChart = ref(null)
const categoryChart = ref(null)

let inventoryTrendInstance = null
let categoryInstance = null

// 预警列表分页
const alertCurrentPage = ref(1)
const alertPageSize = ref(10)

const toNumber = value => Number.parseFloat(value) || 0

const statistics = computed(() => {
  const stats = dashboardData.value?.statistics || {}
  return {
    totalStock: toNumber(stats.totalStock ?? dashboardData.value?.totalStock),
    totalValue: toNumber(stats.totalValue ?? dashboardData.value?.totalValue),
    inbound: {
      count: toNumber(stats.inbound?.count),
      items: toNumber(stats.inbound?.items)
    },
    outbound: {
      count: toNumber(stats.outbound?.count),
      items: toNumber(stats.outbound?.items)
    },
    alerts: {
      low: toNumber(stats.alerts?.low),
      overstock: toNumber(stats.alerts?.overstock)
    }
  }
})

const alertItems = computed(() => {
  const data = dashboardData.value || {}
  const items = data.alertItems || data.alert_items || data.alertsList || []
  return Array.isArray(items) ? items : []
})

const monthKeys = computed(() => {
  const today = new Date()
  const keys = []
  for (let index = 11; index >= 0; index -= 1) {
    const date = new Date(today.getFullYear(), today.getMonth() - index, 1)
    keys.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: `${date.getMonth() + 1}月`
    })
  }
  return keys
})

const monthlyTrend = computed(() => {
  const rows = Array.isArray(dashboardData.value?.monthlyTrend)
    ? dashboardData.value.monthlyTrend
    : []

  return monthKeys.value.map(month => {
    const row = rows.find(item => item.month === month.key || item.month === month.label) || {}
    return {
      ...month,
      inbound: toNumber(row.inbound_qty ?? row.inbound ?? row.inboundQuantity),
      outbound: toNumber(row.outbound_qty ?? row.outbound ?? row.outboundQuantity)
    }
  })
})

const categoryDistribution = computed(() => {
  const source = dashboardData.value?.categoryDistribution || dashboardData.value?.category_distribution
  if (Array.isArray(source)) {
    return source.map(item => ({
      label: item.label || item.name || item.category_name || '未分类',
      value: toNumber(item.value ?? item.quantity ?? item.count)
    }))
  }
  if (source?.labels && source?.values) {
    return source.labels.map((label, index) => ({
      label,
      value: toNumber(source.values[index])
    }))
  }
  return []
})

const paginatedAlertItems = computed(() => {
  const start = (alertCurrentPage.value - 1) * alertPageSize.value
  return alertItems.value.slice(start, start + alertPageSize.value)
})


const isCriticalStock = item => item.type === 'critical' || toNumber(item.quantity) <= 0

const getStatusTagType = item => {
  if (isCriticalStock(item)) return 'danger'
  if (item.type === 'low') return 'warning'
  if (item.type === 'overstock') return 'info'
  return 'success'
}

const getStatusText = item => {
  if (item.status) return item.status
  if (isCriticalStock(item)) return '零库存'
  if (item.type === 'low') return '低库存'
  if (item.type === 'overstock') return '超额库存'
  return '正常'
}

const destroyCharts = () => {
  inventoryTrendInstance?.destroy()
  categoryInstance?.destroy()
  inventoryTrendInstance = null
  categoryInstance = null
}

const renderCharts = async () => {
  await nextTick()
  destroyCharts()

  if (inventoryTrendChart.value) {
    const config = createLineChartConfig({
      tooltipFormatter: context => {
        return `${context.dataset.label}: ${formatQuantity(context.raw)}`
      },
      fill: true
    })

    inventoryTrendInstance = new Chart(inventoryTrendChart.value.getContext('2d'), {
      type: 'line',
      data: {
        labels: monthlyTrend.value.map(item => item.label),
        datasets: [
          {
            label: '入库',
            data: monthlyTrend.value.map(item => item.inbound),
            borderColor: chartColors.success[0],
            backgroundColor: chartColors.success[4],
            tension: 0.4,
            fill: true
          },
          {
            label: '出库',
            data: monthlyTrend.value.map(item => item.outbound),
            borderColor: chartColors.warning[0],
            backgroundColor: chartColors.warning[4],
            tension: 0.4,
            fill: true
          }
        ]
      },
      options: config
    })
  }

  if (categoryChart.value && categoryDistribution.value.length > 0) {
    const config = createPieChartConfig({
      tooltipFormatter: context => `${context.label}: ${formatQuantity(context.raw)}`
    })
    categoryInstance = new Chart(categoryChart.value.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: categoryDistribution.value.map(item => item.label),
        datasets: [
          {
            data: categoryDistribution.value.map(item => item.value),
            backgroundColor: chartColors.gradient
          }
        ]
      },
      options: {
        ...config,
        cutout: '62%'
      }
    })
  }


}

const loadData = async () => {
  loading.value = true
  try {
    const response = await inventoryApi.getDashboardSummary()
    dashboardData.value = parseDataObject(response, { enableLog: false }) || {}
    lastUpdated.value = new Date()
    await renderCharts()
  } catch (error) {
    console.error('获取库存看板数据失败:', error)
    ElMessage.error(error.message || '获取库存看板数据失败')
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
onBeforeUnmount(destroyCharts)
</script>

<style scoped>
.inventory-dashboard {
  padding: 10px;
}
.header-card {
  margin-bottom: var(--spacing-lg);
}
.header-card h2 {
  margin: 0;
  font-size: 22px;
  color: var(--el-text-color-primary);
}
.last-updated {
  margin-left: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.mt-20 {
  margin-top: var(--spacing-lg);
}
.mb-20 {
  margin-bottom: var(--spacing-lg);
}
.primary-card {
  border-top: 4px solid var(--el-color-primary);
}
.success-card {
  border-top: 4px solid var(--el-color-success);
}
.info-card {
  border-top: 4px solid var(--el-color-info);
}
.warning-card {
  border-top: 4px solid var(--el-color-warning);
}
.stat-content {
  flex-grow: 1;
  padding: 10px 0;
}
.stat-title {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 15px;
  color: var(--el-text-color-primary);
}
.stat-info {
  display: flex;
  justify-content: space-between;
}
.stat-main {
  text-align: left;
}
.stat-secondary {
  text-align: right;
}
.stat-secondary-value {
  font-size: 20px;
  font-weight: 500;
  line-height: 1.2;
  color: var(--el-text-color-primary);
}
.stat-secondary-label {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}
.card-footer {
  padding-top: 10px;
  border-top: 1px solid var(--el-border-color-lighter);
}
/* 图表区域 */
.dashboard-card {
  height: 100%;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.card-header span {
  font-size: 16px;
  font-weight: bold;
}
.chart-container {
  width: 100%;
  height: 300px;
  position: relative;
}
.chart-container :deep(.el-empty) {
  height: 100%;
}
.alert-overview {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.alert-table {
  margin-top: 4px;
}
.alert-cell-name strong {
  font-size: 14px;
  color: var(--el-text-color-primary);
}
.unit-text {
  margin-left: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.pagination-container {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}
.text-danger {
  color: var(--el-color-danger) !important;
  font-weight: bold;
}
.text-warning {
  color: var(--el-color-warning) !important;
  font-weight: bold;
}
/* 响应式调整 */
@media (max-width: 768px) {
  .stat-value {
    font-size: 22px;
  }
  .stat-secondary-value {
    font-size: 18px;
  }
}
</style>
