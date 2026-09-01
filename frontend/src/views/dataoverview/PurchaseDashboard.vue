<!--
/**
 * PurchaseDashboard.vue
 * @description 采购数据概览
 * @date 2026-08-29
 * @version 2.0.0
 */
-->
<template>
  <div class="module-page overview-page purchase-dashboard">
    <PageHeader title="采购数据概览" subtitle="采购订单、入库与应付关键指标">
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
          <div class="stat-value">{{ statistics.requisitions.completed }}</div>
          <div class="stat-label">采购申请</div>
          <div class="stat-secondary">
            <span class="stat-secondary-value">{{ statistics.requisitions.pending }}</span>
            <span class="stat-secondary-label">待审批</span>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="12" :md="6" :lg="6">
        <el-card class="stat-card success-card" shadow="hover">
          <div class="stat-value">{{ statistics.orders.total }}</div>
          <div class="stat-label">采购订单</div>
          <div class="stat-secondary">
            <span class="stat-secondary-value">{{ statistics.orders.pending }}</span>
            <span class="stat-secondary-label">待处理</span>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="12" :md="6" :lg="6">
        <el-card class="stat-card info-card" shadow="hover">
          <div class="stat-value">{{ statistics.receipts.total }}</div>
          <div class="stat-label">采购收货</div>
          <div class="stat-secondary">
            <span class="stat-secondary-value">{{ statistics.receipts.pending }}</span>
            <span class="stat-secondary-label">待处理</span>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="12" :md="6" :lg="6">
        <el-card class="stat-card warning-card" shadow="hover">
          <div class="stat-value">{{ statistics.returns.total }}</div>
          <div class="stat-label">采购退货</div>
          <div class="stat-secondary">
            <span class="stat-secondary-value">{{ statistics.returns.pending }}</span>
            <span class="stat-secondary-label">待处理</span>
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
              <span>月度采购趋势</span>
              <el-radio-group v-model="timeRange" size="small">
                <el-radio-button value="6">近6月</el-radio-button>
                <el-radio-button value="12">近12月</el-radio-button>
              </el-radio-group>
            </div>
          </template>
          <div class="chart-container">
            <canvas ref="purchaseTrend"></canvas>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="12">
        <el-card class="dashboard-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span>采购类别分布</span>
            </div>
          </template>
          <div class="chart-container">
            <canvas ref="categoryDistribution"></canvas>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 最近采购订单 (对齐 /purchase/orders) -->
    <el-row class="mt-lg">
      <el-col :span="24">
        <el-card class="dashboard-card" shadow="hover">
          <template #header>
            <div class="card-header-with-search">
              <span>最近采购订单</span>
              <el-input
                v-model="search"
                placeholder="搜索订单号 / 供应商 / 状态"
                class="search-input"
                :prefix-icon="Search"
                clearable
              />
            </div>
          </template>

          <el-table
            :data="filteredPurchaseOrders"
            class="table-row-click w-full"
            v-loading="loading"
            border
            :max-height="400"
            :empty-text="purchaseOrders.length === 0 ? '暂无采购订单' : '没有匹配的数据'"
            @row-click="(row, column, event) => handleTableRowView(row, column, event, () => viewOrder(row.id))"
          >
            <el-table-column prop="orderNo" label="订单编号" min-width="140" show-overflow-tooltip />
            <el-table-column label="订单日期" min-width="120">
              <template #default="scope">
                {{ formatDate(scope.row.orderDate) }}
              </template>
            </el-table-column>
            <el-table-column prop="supplierName" label="供应商" min-width="200" show-overflow-tooltip />
            <el-table-column label="订单金额" min-width="120">
              <template #default="scope">
                {{ formatCurrency(scope.row.totalAmount) }}
              </template>
            </el-table-column>
            <el-table-column label="状态" min-width="100">
              <template #default="scope">
                <el-tag :type="getStatusType(scope.row.status)">
                  {{ getStatusText(scope.row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="requisitionNumber" label="关联申请单" min-width="140" show-overflow-tooltip>
              <template #default="scope">
                <span v-if="scope.row.requisitionNumber">{{ scope.row.requisitionNumber }}</span>
                <span v-else-if="scope.row.requisitionId">申请单-{{ scope.row.requisitionId }}</span>
                <span v-else class="text-muted">-</span>
              </template>
            </el-table-column>
            <el-table-column label="预计到货" min-width="120">
              <template #default="scope">
                {{ formatDate(scope.row.expectedDeliveryDate) || '-' }}
              </template>
            </el-table-column>
          </el-table>

          <div class="pagination-container" v-if="purchaseOrders.length > 0">
            <el-pagination
              v-model:current-page="currentPage"
              v-model:page-size="pageSize"
              :page-sizes="[5, 10, 20, 50]"
              layout="total, sizes, prev, pager, next"
              :total="filteredTotal"
              @size-change="handleSizeChange"
              @current-change="handleCurrentChange"
            />
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import Chart from '@/utils/chartCore'
import { purchaseApi } from '@/api'
import { formatCurrency, formatQuantity } from '@/utils/dashboardUtils'
import { formatDate } from '@/utils/helpers/dateUtils'
import { handleTableRowView } from '@/utils/tableRowView'
import { parseDataObject, parseListData } from '@/utils/responseParser'
import {
  getCommonStatusColor,
  getCommonStatusText,
  getPurchaseStatusColor,
  getPurchaseStatusText
} from '@/constants/systemConstants'
import {
  chartColors,
  createLineChartConfig,
  createPieChartConfig
} from '@/utils/chartConfig'

const router = useRouter()

// 状态定义
const loading = ref(false)
const lastUpdated = ref(null)
const timeRange = ref('6') // '6' | '12'

// 原始数据
const rawStats = ref({})
const rawTrend = ref([])
const rawCategories = ref([])
const purchaseOrders = ref([])
const search = ref('')
const currentPage = ref(1)
const pageSize = ref(10)

// Canvas 引用与图表实例
const purchaseTrend = ref(null)
const categoryDistribution = ref(null)
let purchaseTrendInstance = null
let categoryInstance = null

const toNumber = value => {
  const num = Number.parseFloat(value)
  return Number.isNaN(num) ? 0 : num
}

// 统计数据计算属性
const statistics = computed(() => {
  const data = rawStats.value || {}
  const statsData = data.statistics || data
  const requisitions = statsData.requisitions || {}
  const orders = statsData.orders || {}
  const receipts = statsData.receipts || {}
  const returns = statsData.returns || {}

  return {
    requisitions: {
      total: toNumber(requisitions.total),
      pending: toNumber(requisitions.pending),
      completed: toNumber(requisitions.completedThisMonth ?? requisitions.completed)
    },
    orders: {
      total: toNumber(orders.total),
      pending: toNumber(orders.pending)
    },
    receipts: {
      total: toNumber(receipts.total),
      pending: toNumber(receipts.pending)
    },
    returns: {
      total: toNumber(returns.total),
      pending: toNumber(returns.pending)
    }
  }
})

// 筛选采购订单
const allFilteredOrders = computed(() => {
  let orders = Array.isArray(purchaseOrders.value) ? purchaseOrders.value : []
  if (search.value) {
    const q = search.value.trim().toLowerCase()
    orders = orders.filter(order =>
      (order.orderNo && order.orderNo.toLowerCase().includes(q)) ||
      (order.supplierName && order.supplierName.toLowerCase().includes(q)) ||
      (order.status && order.status.toLowerCase().includes(q)) ||
      (getStatusText(order.status) && getStatusText(order.status).toLowerCase().includes(q)) ||
      (order.requisitionNumber && order.requisitionNumber.toLowerCase().includes(q))
    )
  }
  return orders
})

const filteredTotal = computed(() => allFilteredOrders.value.length)

const filteredPurchaseOrders = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return allFilteredOrders.value.slice(start, start + pageSize.value)
})

// 分页处理
function handleSizeChange(size) {
  pageSize.value = size
  currentPage.value = 1
}
function handleCurrentChange(page) {
  currentPage.value = page
}

// 状态解析
function getStatusType(status) {
  if (!status) return 'info'
  return getPurchaseStatusColor(status) || getCommonStatusColor(status) || 'info'
}

function getStatusText(status) {
  if (!status) return '-'
  return getPurchaseStatusText(status) || getCommonStatusText(status) || status
}

// 跳转采购订单详情
function viewOrder(id) {
  if (!id) return
  router.push({
    path: '/purchase/orders',
    query: { id }
  })
}

// 销毁图表
function destroyCharts() {
  purchaseTrendInstance?.destroy()
  categoryInstance?.destroy()
  purchaseTrendInstance = null
  categoryInstance = null
}

// 渲染月度采购趋势图
function renderPurchaseTrendChart() {
  if (!purchaseTrend.value) return
  purchaseTrendInstance?.destroy()
  purchaseTrendInstance = null

  const ctx = purchaseTrend.value.getContext('2d')
  if (!ctx) return

  let trendList = Array.isArray(rawTrend.value) ? rawTrend.value : []
  const monthsCount = Number(timeRange.value) || 6
  if (trendList.length > monthsCount) {
    trendList = trendList.slice(-monthsCount)
  }

  let labels = []
  let reqData = []
  let orderData = []

  if (trendList.length > 0) {
    labels = trendList.map(item => {
      const parts = String(item.month || '').split('-')
      if (parts.length === 2) {
        return `${Number(parts[1])}月`
      }
      return item.month || ''
    })
    reqData = trendList.map(item => toNumber(item.requisitionCount ?? item.requisitions ?? item.requisition_count))
    orderData = trendList.map(item => toNumber(item.orderCount ?? item.orders ?? item.order_count))
  } else {
    labels = ['暂无数据']
    reqData = [0]
    orderData = [0]
  }

  const config = createLineChartConfig({
    yAxisTitle: '单据数量',
    tooltipFormatter: context => `${context.dataset.label}: ${formatQuantity(context.raw)} 单`
  })

  purchaseTrendInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '采购申请',
          data: reqData,
          borderColor: chartColors.primary[0],
          backgroundColor: chartColors.primary[4],
          tension: 0.4,
          fill: false
        },
        {
          label: '采购订单',
          data: orderData,
          borderColor: chartColors.success[0],
          backgroundColor: chartColors.success[4],
          tension: 0.4,
          fill: false
        }
      ]
    },
    options: config
  })
}

// 渲染采购类别分布图
function renderCategoryChart() {
  if (!categoryDistribution.value) return
  categoryInstance?.destroy()
  categoryInstance = null

  const ctx = categoryDistribution.value.getContext('2d')
  if (!ctx) return

  const catList = Array.isArray(rawCategories.value) ? rawCategories.value : []
  const labels = catList.length > 0 ? catList.map(item => item.categoryName || item.name || '未分类') : ['暂无数据']
  const data = catList.length > 0 ? catList.map(item => toNumber(item.totalAmount ?? item.amount ?? item.value)) : [0]

  const config = createPieChartConfig({
    tooltipFormatter: context => `${context.label}: ${formatCurrency(context.raw)}`
  })

  categoryInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: chartColors.gradient,
          borderWidth: 0
        }
      ]
    },
    options: {
      ...config,
      cutout: '62%'
    }
  })
}

// 渲染所有图表
async function renderCharts() {
  await nextTick()
  renderPurchaseTrendChart()
  renderCategoryChart()
}

// 加载采购概览与订单数据
async function loadData() {
  loading.value = true
  try {
    const [statsRes, ordersRes] = await Promise.allSettled([
      purchaseApi.getDashboardStatistics ? purchaseApi.getDashboardStatistics() : purchaseApi.getStatistics(),
      purchaseApi.getOrders({
        page: 1,
        pageSize: 50,
        sort: 'created_at',
        order: 'desc'
      })
    ])

    if (statsRes.status === 'fulfilled' && statsRes.value) {
      const data = parseDataObject(statsRes.value) || {}
      rawStats.value = data
      rawTrend.value = Array.isArray(data.trendData) ? data.trendData : []
      rawCategories.value = Array.isArray(data.categoryDistribution) ? data.categoryDistribution : []
    }

    if (ordersRes.status === 'fulfilled' && ordersRes.value) {
      const list = parseListData(ordersRes.value, { enableLog: false })
      purchaseOrders.value = list.map(order => ({
        id: order.id,
        orderNo: order.orderNo || order.orderNumber || `PO${order.id}`,
        orderDate: order.orderDate || order.createdAt,
        expectedDeliveryDate: order.expectedDeliveryDate,
        supplierName: order.supplierName || (order.supplier && order.supplier.name) || order.supplier || '未知供应商',
        totalAmount: toNumber(order.totalAmount),
        status: order.status || 'draft',
        requisitionId: order.requisitionId,
        requisitionNumber: order.requisitionNumber,
        contractCode: order.contractCode
      }))
    }

    lastUpdated.value = new Date()
    await renderCharts()
  } catch (error) {
    console.error('加载采购概览数据失败:', error)
  } finally {
    loading.value = false
  }
}

// 监听时间范围切换
watch(timeRange, () => {
  renderPurchaseTrendChart()
})

onMounted(async () => {
  await loadData()
})

onBeforeUnmount(() => {
  destroyCharts()
})
</script>

<style scoped>
/* 响应式调整 */

:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
