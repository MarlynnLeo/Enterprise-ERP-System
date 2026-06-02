<template>
  <div class="inventory-dashboard">
    <div class="page-header">
      <div>
        <h2>库存数据概览</h2>
        <span v-if="lastUpdated" class="last-updated">
          最后更新 {{ lastUpdated.toLocaleTimeString() }}
        </span>
      </div>
      <el-button :icon="Refresh" :loading="loading" @click="loadData">刷新</el-button>
    </div>

    <el-row :gutter="16" class="stats-cards">
      <el-col
        v-for="card in statCards"
        :key="card.label"
        :xs="24"
        :sm="12"
        :md="6"
      >
        <el-card class="stat-card" :class="card.className" shadow="never">
          <span class="icon-container">
            <el-icon><component :is="card.icon" /></el-icon>
          </span>
          <div class="stat-content">
            <div class="stat-title">{{ card.label }}</div>
            <div class="stat-value">{{ card.value }}</div>
            <div class="stat-secondary">{{ card.subLabel }} {{ card.subValue }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="content-row">
      <el-col :xs="24" :lg="12">
        <el-card shadow="never" class="panel-card">
          <template #header>
            <div class="card-header">近 12 个月出入库趋势</div>
          </template>
          <div class="trend-list">
            <div v-for="item in monthlyTrend" :key="item.key" class="trend-item">
              <span class="trend-label">{{ item.label }}</span>
              <div class="trend-bars">
                <div
                  class="trend-bar inbound"
                  :style="{ width: `${getTrendPercent(item.inbound)}%` }"
                />
                <div
                  class="trend-bar outbound"
                  :style="{ width: `${getTrendPercent(item.outbound)}%` }"
                />
              </div>
              <span class="trend-value">
                入 {{ formatQuantity(item.inbound) }} / 出 {{ formatQuantity(item.outbound) }}
              </span>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="12">
        <el-card shadow="never" class="panel-card">
          <template #header>
            <div class="card-header">库存分类占比</div>
          </template>
          <div class="bar-list">
            <div v-for="item in categoryDistribution" :key="item.label" class="bar-item">
              <div class="bar-meta">
                <span>{{ item.label }}</span>
                <span>{{ formatQuantity(item.value) }}</span>
              </div>
              <el-progress
                :percentage="getCategoryPercent(item.value)"
                :stroke-width="8"
                :show-text="false"
              />
            </div>
            <el-empty v-if="categoryDistribution.length === 0" description="暂无分类数据" />
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="content-row">
      <el-col :xs="24" :lg="10">
        <el-card shadow="never" class="panel-card">
          <template #header>
            <div class="card-header">仓库金额分布</div>
          </template>
          <div class="bar-list">
            <div v-for="item in warehouseValues" :key="item.label" class="bar-item">
              <div class="bar-meta">
                <span>{{ item.label }}</span>
                <span>{{ formatCurrency(item.value) }}</span>
              </div>
              <el-progress
                :percentage="getWarehousePercent(item.value)"
                :stroke-width="8"
                :show-text="false"
              />
            </div>
            <el-empty v-if="warehouseValues.length === 0" description="暂无仓库金额数据" />
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="14">
        <el-card shadow="never" class="panel-card">
          <template #header>
            <div class="card-header card-header-with-search">
              <span>库存预警清单</span>
              <el-input
                v-model="search"
                :prefix-icon="Search"
                placeholder="搜索物料、规格、库位"
                clearable
                class="search-input"
              />
            </div>
          </template>

          <el-table
            v-loading="loading"
            :data="pagedAlertItems"
            border
            class="w-full"
            :empty-text="filteredAlertItems.length === 0 ? '暂无预警物料' : '暂无匹配数据'"
            max-height="420"
          >
            <el-table-column label="物料编码" prop="code" min-width="120" show-overflow-tooltip />
            <el-table-column label="物料名称" prop="name" min-width="160" show-overflow-tooltip />
            <el-table-column label="规格型号" prop="specification" min-width="130" show-overflow-tooltip />
            <el-table-column label="库存数量" min-width="100" align="right">
              <template #default="{ row }">
                <span :class="{ 'text-danger': isCriticalStock(row), 'text-warning': row.type === 'low' }">
                  {{ formatQuantity(row.quantity) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="单位" prop="unit" width="80" />
            <el-table-column label="安全库存" prop="safetyStock" min-width="100" align="right" />
            <el-table-column label="最大库存" prop="maxStock" min-width="100" align="right" />
            <el-table-column label="库存状态" min-width="110">
              <template #default="{ row }">
                <el-tag :type="getStatusTagType(row)">
                  {{ getStatusText(row) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="所在库位" prop="location" min-width="120" show-overflow-tooltip />
            <el-table-column
              label="操作"
              width="96"
              fixed="right"
              align="left"
              header-align="left"
              class-name="operation-column"
              header-class-name="operation-column-header"
            >
              <template #default="{ row }">
                <el-button type="primary" link size="small" @click="viewMaterial(row)">
                  查看
                  <el-icon class="el-icon--right"><ArrowRight /></el-icon>
                </el-button>
              </template>
            </el-table-column>
          </el-table>

          <div v-if="filteredAlertItems.length > 0" class="pagination-container">
            <el-pagination
              v-model:current-page="currentPage"
              v-model:page-size="pageSize"
              :page-sizes="[5, 10, 20, 50]"
              layout="total, sizes, prev, pager, next"
              :total="filteredAlertItems.length"
            />
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  ArrowRight,
  Box,
  Download,
  Refresh,
  Search,
  Upload,
  WarningFilled
} from '@element-plus/icons-vue'
import { inventoryApi } from '@/api'
import { parseDataObject } from '@/utils/responseParser'
import { formatCurrency, formatQuantity } from '@/utils/dashboardUtils'

const router = useRouter()
const loading = ref(false)
const lastUpdated = ref(null)
const search = ref('')
const currentPage = ref(1)
const pageSize = ref(10)
const dashboardData = ref({})
const stockStatistics = ref({})

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

const statCards = computed(() => [
  {
    label: '总库存量',
    value: formatQuantity(statistics.value.totalStock),
    subLabel: '总价值',
    subValue: formatCurrency(statistics.value.totalValue),
    icon: Box,
    className: 'primary-card'
  },
  {
    label: '本月入库',
    value: statistics.value.inbound.count,
    subLabel: '物料数',
    subValue: formatQuantity(statistics.value.inbound.items),
    icon: Download,
    className: 'success-card'
  },
  {
    label: '本月出库',
    value: statistics.value.outbound.count,
    subLabel: '物料数',
    subValue: formatQuantity(statistics.value.outbound.items),
    icon: Upload,
    className: 'info-card'
  },
  {
    label: '库存预警',
    value: statistics.value.alerts.low,
    subLabel: '超额库存',
    subValue: formatQuantity(statistics.value.alerts.overstock),
    icon: WarningFilled,
    className: 'warning-card'
  }
])

const alertItems = computed(() => {
  const data = dashboardData.value || {}
  const items = data.alertItems || data.alert_items || data.alertsList || []
  return Array.isArray(items) ? items : []
})

const filteredAlertItems = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  if (!keyword) return alertItems.value

  return alertItems.value.filter(item => {
    return [item.code, item.name, item.specification, item.location]
      .some(value => String(value || '').toLowerCase().includes(keyword))
  })
})

const pagedAlertItems = computed(() => {
  const startIndex = (currentPage.value - 1) * pageSize.value
  return filteredAlertItems.value.slice(startIndex, startIndex + pageSize.value)
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

const maxTrendValue = computed(() => {
  return Math.max(
    1,
    ...monthlyTrend.value.flatMap(item => [item.inbound, item.outbound])
  )
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

const categoryTotal = computed(() => {
  return categoryDistribution.value.reduce((total, item) => total + item.value, 0)
})

const warehouseValues = computed(() => {
  const data = dashboardData.value || {}
  const stats = stockStatistics.value || {}
  const source = data.warehouseValues
    || data.totalValueByLocation
    || data.locationValues
    || stats.totalValueByLocation
    || stats.warehouseValues
    || []

  return Array.isArray(source)
    ? source.map(item => ({
      label: item.label || item.name || item.location_name || '未命名仓库',
      value: toNumber(item.value ?? item.totalValue ?? item.amount)
    }))
    : []
})

const warehouseTotal = computed(() => {
  return warehouseValues.value.reduce((total, item) => total + item.value, 0)
})

watch(search, () => {
  currentPage.value = 1
})

const getTrendPercent = value => Math.max(4, Math.round((toNumber(value) / maxTrendValue.value) * 100))

const getCategoryPercent = value => {
  if (categoryTotal.value <= 0) return 0
  return Math.round((toNumber(value) / categoryTotal.value) * 100)
}

const getWarehousePercent = value => {
  if (warehouseTotal.value <= 0) return 0
  return Math.round((toNumber(value) / warehouseTotal.value) * 100)
}

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

const loadData = async () => {
  loading.value = true
  try {
    const response = await inventoryApi.getDashboardSummary()
    dashboardData.value = parseDataObject(response, { enableLog: false }) || {}

    try {
      const stockResponse = await inventoryApi.getStockStatistics()
      stockStatistics.value = parseDataObject(stockResponse, { enableLog: false }) || {}
    } catch (error) {
      console.warn('获取库存金额分布失败:', error)
      stockStatistics.value = {}
    }

    lastUpdated.value = new Date()
  } catch (error) {
    console.error('获取库存看板数据失败:', error)
    ElMessage.error(error.message || '获取库存看板数据失败')
  } finally {
    loading.value = false
  }
}

const viewMaterial = item => {
  router.push({
    path: '/basedata/materials',
    query: item.code ? { search: item.code } : undefined
  })
}

onMounted(loadData)
</script>

<style scoped>
.inventory-dashboard {
  padding: 10px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.page-header h2 {
  margin: 0;
  font-size: 22px;
  color: var(--color-text-primary);
}

.last-updated {
  display: inline-block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.stats-cards {
  margin-bottom: 16px;
}

.content-row {
  margin-bottom: 16px;
}

.panel-card {
  height: 100%;
  border-radius: var(--radius-md, 8px);
}

.card-header,
.card-header-with-search {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-weight: 600;
}

.search-input {
  width: min(280px, 45vw);
}

.trend-list,
.bar-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 280px;
}

.trend-item {
  display: grid;
  grid-template-columns: 44px minmax(120px, 1fr) 140px;
  align-items: center;
  gap: 10px;
  min-height: 28px;
}

.trend-label,
.trend-value,
.bar-meta {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.trend-bars {
  display: grid;
  gap: 4px;
}

.trend-bar {
  height: 7px;
  border-radius: 999px;
}

.trend-bar.inbound {
  background: var(--color-success);
}

.trend-bar.outbound {
  background: var(--color-warning);
}

.bar-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bar-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.pagination-container {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.text-danger {
  color: var(--color-danger);
  font-weight: 600;
}

.text-warning {
  color: var(--color-warning);
  font-weight: 600;
}

@media (max-width: 768px) {
  .page-header,
  .card-header-with-search {
    align-items: flex-start;
    flex-direction: column;
  }

  .search-input {
    width: 100%;
  }

  .trend-item {
    grid-template-columns: 40px minmax(100px, 1fr);
  }

  .trend-value {
    grid-column: 2;
  }
}
</style>
