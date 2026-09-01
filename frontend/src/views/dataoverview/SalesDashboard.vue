<!--
/**
 * SalesDashboard.vue
 * @description 销售数据概览
 * @date 2026-08-29
 * @version 2.0.0
 */
-->
<template>
  <div class="module-page overview-page sales-dashboard">
    <PageHeader title="销售数据概览" subtitle="订单、销售额与回款关键指标">
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
          <div class="stat-value">{{ statistics.orders.total }}</div>
          <div class="stat-label">销售订单</div>
          <div class="stat-secondary">
            <span class="stat-secondary-value">{{ statistics.orders.pending }}</span>
            <span class="stat-secondary-label">待处理</span>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="12" :md="6" :lg="6">
        <el-card class="stat-card success-card" shadow="hover">
          <div class="stat-value">{{ formatCurrency(statistics.currentMonth.amount) }}</div>
          <div class="stat-label">本月销售额</div>
          <div class="stat-secondary">
            <span class="stat-secondary-value">{{ statistics.currentMonth.count }}</span>
            <span class="stat-secondary-label">订单数</span>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="12" :md="6" :lg="6">
        <el-card class="stat-card info-card" shadow="hover">
          <div class="stat-value">{{ statistics.returns.total }}</div>
          <div class="stat-label">销售退货</div>
          <div class="stat-secondary">
            <span class="stat-secondary-value">{{ formatCurrency(statistics.returns.amount) }}</span>
            <span class="stat-secondary-label">退货金额</span>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="12" :md="6" :lg="6">
        <el-card class="stat-card warning-card" shadow="hover">
          <div class="stat-value">{{ formatCurrency(statistics.receivables.collected) }}</div>
          <div class="stat-label">销售回款</div>
          <div class="stat-secondary">
            <span class="stat-secondary-value">{{ formatCurrency(statistics.receivables.pending) }}</span>
            <span class="stat-secondary-label">待回款</span>
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
              <span>销售趋势</span>
              <el-radio-group v-model="salesTrendType" size="small">
                <el-radio-button value="amount">销售额</el-radio-button>
                <el-radio-button value="count">订单量</el-radio-button>
              </el-radio-group>
            </div>
          </template>
          <div class="chart-container">
            <canvas ref="salesTrend"></canvas>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="12">
        <el-card class="dashboard-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span>客户销售排名</span>
            </div>
          </template>
          <div class="chart-container">
            <canvas ref="customerRank"></canvas>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 最近销售订单 -->
    <el-row class="mt-lg">
      <el-col :span="24">
        <el-card class="dashboard-card" shadow="hover">
          <template #header>
            <div class="card-header-with-search">
              <span>最近销售订单</span>
              <el-input
                v-model="search"
                placeholder="搜索"
                class="search-input"
                :prefix-icon="Search"
              />
            </div>
          </template>
          <el-table
            :data="filteredRecentOrders"
            class="table-row-click w-full"
            v-loading="loading"
            border
            :max-height="400"
            :empty-text="recentOrders.length === 0 ? '暂无销售订单' : '没有匹配的数据'"
            @row-click="(row, column, event) => handleTableRowView(row, column, event, () => router.push(`/sales/orders?id=${row.id}`))"
          >
            <el-table-column label="订单编号" prop="orderNo" min-width="120" />
            <el-table-column label="客户名称" prop="customerName" min-width="180" />
            <el-table-column label="订单日期" min-width="120">
              <template #default="scope">
                {{ formatDate(scope.row.orderDate) }}
              </template>
            </el-table-column>
            <el-table-column label="订单金额" min-width="120">
              <template #default="scope">
                {{ formatCurrency(scope.row.amount) }}
              </template>
            </el-table-column>
            <el-table-column label="状态" min-width="100">
              <template #default="scope">
                <el-tag :type="getStatusColor(scope.row.status)">
                  {{ getStatusText(scope.row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="付款状态" min-width="100">
              <template #default="scope">
                <el-tag :type="getPaymentStatusColor(scope.row.paymentStatus)">
                  {{ getPaymentStatusText(scope.row.paymentStatus) }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>

          <div class="pagination-container" v-if="recentOrders.length > 0">
            <el-pagination
              v-model:current-page="currentPage"
              v-model:page-size="pageSize"
              :page-sizes="[5, 10, 20, 50]"
              layout="total, sizes, prev, pager, next"
              :total="recentOrders.length"
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
import { salesApi } from '@/api'
import { formatCurrency, formatQuantity } from '@/utils/dashboardUtils'
import { formatDate } from '@/utils/helpers/dateUtils'
import { handleTableRowView } from '@/utils/tableRowView'
import { parseDataObject, parseListData } from '@/utils/responseParser'
import {
  getCommonStatusColor,
  getCommonStatusText,
  getSalesStatusColor,
  getSalesStatusText
} from '@/constants/systemConstants'
import {
  chartColors,
  createBarChartConfig,
  createLineChartConfig
} from '@/utils/chartConfig'

const router = useRouter()

// 状态定义
const loading = ref(false)
const lastUpdated = ref(null)
const salesTrendType = ref('amount') // 'amount' | 'count'

// 原始数据
const rawStats = ref({})
const rawTrend = ref([])
const recentOrders = ref([])
const search = ref('')
const currentPage = ref(1)
const pageSize = ref(10)

// Canvas 引用与图表实例
const salesTrend = ref(null)
const customerRank = ref(null)
let salesTrendInstance = null
let customerRankInstance = null

const toNumber = value => {
  const num = Number.parseFloat(value)
  return Number.isNaN(num) ? 0 : num
}

// 统计数据计算属性
const statistics = computed(() => {
  const data = rawStats.value || {}
  return {
    orders: {
      total: toNumber(data.total_orders ?? data.totalOrders ?? (toNumber(data.completed_orders) + toNumber(data.pending_orders))),
      pending: toNumber(data.pending_orders ?? data.pendingOrders)
    },
    currentMonth: {
      amount: toNumber(data.monthly_sales ?? data.monthlySales),
      count: toNumber(data.monthly_orders ?? data.monthlyOrders)
    },
    returns: {
      total: toNumber(data.returns_count ?? data.returnsCount),
      amount: toNumber(data.returns_amount ?? data.returnsAmount)
    },
    receivables: {
      collected: toNumber(data.collected_amount ?? data.collectedAmount),
      pending: toNumber(data.pending_amount ?? data.pendingAmount)
    }
  }
})

// Top 5 客户
const topCustomers = computed(() => {
  const list = rawStats.value?.top_customers || rawStats.value?.topCustomers || []
  return Array.isArray(list) ? list : []
})

// 筛选后的订单
const filteredRecentOrders = computed(() => {
  let orders = Array.isArray(recentOrders.value) ? recentOrders.value : []
  if (search.value) {
    const q = search.value.trim().toLowerCase()
    orders = orders.filter(order =>
      (order.orderNo && order.orderNo.toLowerCase().includes(q)) ||
      (order.customerName && order.customerName.toLowerCase().includes(q)) ||
      (order.status && order.status.toLowerCase().includes(q))
    )
  }
  const start = (currentPage.value - 1) * pageSize.value
  return orders.slice(start, start + pageSize.value)
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
function getStatusColor(status) {
  if (!status) return 'info'
  return getSalesStatusColor(status) || getCommonStatusColor(status) || 'info'
}
function getStatusText(status) {
  if (!status) return '-'
  return getSalesStatusText(status) || getCommonStatusText(status) || status
}
function getPaymentStatusColor(status) {
  const statusMap = {
    unpaid: 'danger',
    partial: 'warning',
    paid: 'success',
    refunded: 'info',
    未付款: 'danger',
    部分付款: 'warning',
    已付款: 'success',
    已退款: 'info'
  }
  return statusMap[status] || 'info'
}
function getPaymentStatusText(status) {
  if (!status) return '-'
  const paymentStatusTextMap = {
    unpaid: '未付款',
    partial: '部分付款',
    paid: '已付款',
    refunded: '已退款'
  }
  return paymentStatusTextMap[status] || status
}
function getPaymentStatusFromOrderStatus(orderStatus) {
  const statusMap = {
    draft: 'unpaid',
    pending: 'unpaid',
    confirmed: 'unpaid',
    processing: 'unpaid',
    in_production: 'unpaid',
    ready_to_ship: 'partial',
    shipped: 'partial',
    delivered: 'paid',
    completed: 'paid',
    cancelled: 'unpaid'
  }
  return statusMap[orderStatus] || 'unpaid'
}

// 销毁图表
function destroyCharts() {
  salesTrendInstance?.destroy()
  customerRankInstance?.destroy()
  salesTrendInstance = null
  customerRankInstance = null
}

// 渲染销售趋势折线图
function renderSalesTrendChart() {
  if (!salesTrend.value) return
  salesTrendInstance?.destroy()
  salesTrendInstance = null

  const ctx = salesTrend.value.getContext('2d')
  if (!ctx) return

  const trendData = Array.isArray(rawTrend.value) ? rawTrend.value : []
  let labels = []
  let salesData = []

  if (trendData.length > 0) {
    labels = trendData.map(item => {
      const parts = String(item.month || '').split('-')
      if (parts.length === 2) {
        return `${Number(parts[1])}月`
      }
      return item.month || ''
    })
    salesData = trendData.map(item =>
      salesTrendType.value === 'amount'
        ? toNumber(item.sales_amount ?? item.salesAmount)
        : toNumber(item.order_count ?? item.orderCount)
    )
  }

  const isAmount = salesTrendType.value === 'amount'
  const config = createLineChartConfig({
    yAxisTitle: isAmount ? '销售金额(元)' : '订单数量',
    tooltipFormatter: context => {
      return isAmount
        ? `${context.dataset.label}: ${formatCurrency(context.raw)}`
        : `${context.dataset.label}: ${formatQuantity(context.raw)} 单`
    },
    fill: true
  })

  salesTrendInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: isAmount ? '销售金额' : '订单数量',
          data: salesData,
          borderColor: chartColors.primary[0],
          backgroundColor: chartColors.primary[4],
          tension: 0.4,
          fill: true
        }
      ]
    },
    options: config
  })
}

// 渲染客户销售排名柱状图
function renderCustomerRankChart() {
  if (!customerRank.value) return
  customerRankInstance?.destroy()
  customerRankInstance = null

  const ctx = customerRank.value.getContext('2d')
  if (!ctx) return

  const customers = topCustomers.value
  const labels = customers.length > 0 ? customers.map(c => c.name || '未知客户') : ['暂无数据']
  const data = customers.length > 0 ? customers.map(c => toNumber(c.sales)) : [0]

  const config = createBarChartConfig({
    yAxisTitle: '销售金额(元)',
    tooltipFormatter: context => `${context.label}: ${formatCurrency(context.raw)}`
  })

  customerRankInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: '销售金额',
          data,
          backgroundColor: chartColors.primary[0],
          borderColor: chartColors.primary[1],
          borderWidth: 1
        }
      ]
    },
    options: config
  })
}

// 渲染所有图表
async function renderCharts() {
  await nextTick()
  renderSalesTrendChart()
  renderCustomerRankChart()
}

// 加载数据
async function loadData() {
  loading.value = true
  try {
    const [statsRes, trendRes, ordersRes] = await Promise.allSettled([
      salesApi.getSalesStatistics(),
      salesApi.getSalesTrend(),
      salesApi.getOrders({
        page: 1,
        pageSize: 20,
        sort: 'created_at',
        order: 'desc'
      })
    ])

    if (statsRes.status === 'fulfilled' && statsRes.value) {
      rawStats.value = parseDataObject(statsRes.value) || {}
    }
    if (trendRes.status === 'fulfilled' && trendRes.value) {
      const trendObj = parseDataObject(trendRes.value) || {}
      rawTrend.value = Array.isArray(trendObj.trend_data)
        ? trendObj.trend_data
        : (Array.isArray(trendObj.trendData) ? trendObj.trendData : (Array.isArray(trendObj) ? trendObj : []))
    }
    if (ordersRes.status === 'fulfilled' && ordersRes.value) {
      const orderList = parseListData(ordersRes.value, { enableLog: false })
      recentOrders.value = orderList.map(order => ({
        id: order.id,
        orderNo: order.orderNo || `SO${order.id}`,
        customerName: order.customerName || '未知客户',
        amount: toNumber(order.totalAmount),
        status: order.status || 'pending',
        orderDate: order.orderDate || order.createdAt || new Date().toISOString(),
        paymentStatus: order.paymentStatus || getPaymentStatusFromOrderStatus(order.status)
      }))
    }

    lastUpdated.value = new Date()
    await renderCharts()
  } catch (error) {
    console.error('加载销售数据失败:', error)
  } finally {
    loading.value = false
  }
}

// 监听销售趋势类型变化（销售额 / 订单量）
watch(salesTrendType, () => {
  renderSalesTrendChart()
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
