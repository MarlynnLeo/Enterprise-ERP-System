<!--
/**
 * InventoryDashboard.vue
 * @description 库存数据概览
 * @date 2026-08-29
 * @version 2.0.0
 */
-->
<template>
  <div class="module-page overview-page inventory-dashboard">
    <PageHeader title="库存数据概览" subtitle="库存水位、出入库动态与预警信息">
      <template #actions>
        <span v-if="lastUpdated" class="last-updated">
          最后更新: {{ new Date(lastUpdated).toLocaleTimeString() }}
        </span>
      </template>
    </PageHeader>

    <!-- 统计卡片 -->
    <el-row :gutter="16" class="stats-row">
      <el-col :xs="24" :sm="12" :md="6" :lg="6">
        <el-card class="stat-card primary-card" shadow="hover">
          <div class="stat-value">{{ statistics.totalStock }}</div>
          <div class="stat-label">总库存种类</div>
          <div class="stat-secondary">
            <span class="stat-secondary-value">{{ formatCurrency(statistics.totalValue) }}</span>
            <span class="stat-secondary-label">总货值</span>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="12" :md="6" :lg="6">
        <el-card class="stat-card success-card" shadow="hover">
          <div class="stat-value">{{ statistics.inbound.count }}</div>
          <div class="stat-label">本月入库单</div>
          <div class="stat-secondary">
            <span class="stat-secondary-value">{{ formatQuantity(statistics.inbound.items) }}</span>
            <span class="stat-secondary-label">入库件数</span>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="12" :md="6" :lg="6">
        <el-card class="stat-card warning-card" shadow="hover">
          <div class="stat-value">{{ statistics.outbound.count }}</div>
          <div class="stat-label">本月出库单</div>
          <div class="stat-secondary">
            <span class="stat-secondary-value">{{ formatQuantity(statistics.outbound.items) }}</span>
            <span class="stat-secondary-label">出库件数</span>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="12" :md="6" :lg="6">
        <el-card class="stat-card danger-card" shadow="hover">
          <div class="stat-value">{{ statistics.alerts.low }}</div>
          <div class="stat-label">库存预警</div>
          <div class="stat-secondary">
            <span class="stat-secondary-value">{{ statistics.alerts.overstock }}</span>
            <span class="stat-secondary-label">超额库存</span>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 图表区域 -->
    <el-row :gutter="16" class="mt-md">
      <el-col :xs="24" :md="12">
        <el-card class="dashboard-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span>近 12 个月出入库趋势</span>
            </div>
          </template>
          <div class="chart-container">
            <canvas ref="inventoryTrendChart"></canvas>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="12">
        <el-card class="dashboard-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span>物料分类分布</span>
            </div>
          </template>
          <div class="chart-container">
            <canvas ref="categoryChart"></canvas>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 库存预警表格 -->
    <el-row class="mt-lg">
      <el-col :span="24">
        <el-card class="dashboard-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span>实时库存预警清单</span>
            </div>
          </template>
          <el-table
            :data="paginatedAlertItems"
            class="table-row-click w-full alert-table"
            v-loading="loading"
            border
            :max-height="400"
            :empty-text="alertItems.length === 0 ? '当前无库存预警物料' : '暂无数据'"
            @row-click="(row, column, event) => handleTableRowView(row, column, event, () => router.push(`/inventory/stock?materialCode=${row.code}`))"
          >
            <el-table-column label="物料编码" prop="code" min-width="120" />
            <el-table-column label="物料名称" prop="name" min-width="160" />
            <el-table-column label="规格型号" prop="specification" min-width="140" />
            <el-table-column label="当前库存" min-width="100">
              <template #default="scope">
                {{ formatQuantity(scope.row.quantity) }} {{ scope.row.unit || '' }}
              </template>
            </el-table-column>
            <el-table-column label="安全库存" min-width="100">
              <template #default="scope">
                {{ formatQuantity(scope.row.safetyStock) }} {{ scope.row.unit || '' }}
              </template>
            </el-table-column>
            <el-table-column label="库位" prop="location" min-width="120" />
            <el-table-column label="预警状态" min-width="100">
              <template #default="scope">
                <el-tag :type="getStatusTagType(scope.row)">
                  {{ getStatusText(scope.row) }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>

          <div class="pagination-container" v-if="alertItems.length > 0">
            <el-pagination
              v-model:current-page="alertCurrentPage"
              v-model:page-size="alertPageSize"
              :page-sizes="[5, 10, 20, 50]"
              layout="total, sizes, prev, pager, next"
              :total="alertItems.length"
              @size-change="handleAlertSizeChange"
              @current-change="handleAlertCurrentChange"
            />
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import Chart from '@/utils/chartCore'
import { inventoryApi } from '@/api'
import { parseDataObject } from '@/utils/responseParser'
import { formatCurrency, formatQuantity } from '@/utils/dashboardUtils'
import { handleTableRowView } from '@/utils/tableRowView'
import {
  chartColors,
  createLineChartConfig,
  createPieChartConfig
} from '@/utils/chartConfig'
import { alphaColor } from '@/utils/designTokens'

const router = useRouter()

const loading = ref(false)
const lastUpdated = ref(null)
const dashboardData = ref({})

const alertCurrentPage = ref(1)
const alertPageSize = ref(10)

const inventoryTrendChart = ref(null)
const categoryChart = ref(null)

let inventoryTrendInstance = null
let categoryInstance = null

const toNumber = value => {
  const num = Number.parseFloat(value)
  return Number.isNaN(num) ? 0 : num
}

const statistics = computed(() => {
  const raw = dashboardData.value?.statistics || {}
  return {
    totalStock: toNumber(raw.totalStock ?? raw.total_stock),
    totalValue: toNumber(raw.totalValue ?? raw.total_value),
    inbound: {
      count: toNumber(raw.inbound?.count ?? raw.inbound_count),
      items: toNumber(raw.inbound?.items ?? raw.inbound_items)
    },
    outbound: {
      count: toNumber(raw.outbound?.count ?? raw.outbound_count),
      items: toNumber(raw.outbound?.items ?? raw.outbound_items)
    },
    alerts: {
      low: toNumber(raw.alerts?.low ?? raw.low_stock_alerts),
      overstock: toNumber(raw.alerts?.overstock ?? raw.overstock_alerts)
    }
  }
})

const alertItems = computed(() => {
  const data = dashboardData.value || {}
  const items = data.alertItems || data.alertsList || []
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
      inbound: toNumber(row.inboundQty ?? row.inbound ?? row.inboundQuantity),
      outbound: toNumber(row.outboundQty ?? row.outbound ?? row.outboundQuantity)
    }
  })
})

const categoryDistribution = computed(() => {
  const source = dashboardData.value?.categoryDistribution || dashboardData.value?.category_distribution
  if (Array.isArray(source)) {
    return source.map(item => ({
      label: item.label || item.name || item.categoryName || '未分类',
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

function handleAlertSizeChange(size) {
  alertPageSize.value = size
  alertCurrentPage.value = 1
}

function handleAlertCurrentChange(page) {
  alertCurrentPage.value = page
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

  if (categoryChart.value) {
    const config = createPieChartConfig({
      tooltipFormatter: context => `${context.label}: ${formatQuantity(context.raw)}`
    })
    const hasCategoryData = categoryDistribution.value.length > 0
    const labels = hasCategoryData
      ? categoryDistribution.value.map(item => item.label)
      : ['暂无数据']
    const data = hasCategoryData
      ? categoryDistribution.value.map(item => item.value)
      : [1]
    const bgColors = hasCategoryData
      ? chartColors.gradient
      : [alphaColor('textPrimary', 0.08)]

    categoryInstance = new Chart(categoryChart.value.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: bgColors
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
/* 响应式调整 */

:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
