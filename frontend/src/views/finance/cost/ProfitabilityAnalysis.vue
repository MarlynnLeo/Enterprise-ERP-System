<template>
  <div class="profitability-container">
    <!-- 页面标题 -->
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>盈利分析</h2>
          <p class="subtitle">产品盈利排名 / 客户盈利贡献 / 盈利趋势</p>
        </div>
        <div class="actions">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            style="width: 260px; margin-right: 10px"
          />
          <el-button type="primary" @click="loadAllData">
            <el-icon><Refresh /></el-icon> 刷新
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- 汇总卡片 -->
    <el-row :gutter="20" class="summary-row">
      <el-col :span="6">
        <el-card class="stat-card revenue">
          <div class="stat-icon"><el-icon><Money /></el-icon></div>
          <div class="stat-content">
            <div class="stat-value">{{ formatCurrency(summary.totalRevenue) }}</div>
            <div class="stat-label">总收入</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card cost">
          <div class="stat-icon"><el-icon><Goods /></el-icon></div>
          <div class="stat-content">
            <div class="stat-value">{{ formatCurrency(summary.totalCost) }}</div>
            <div class="stat-label">总成本</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card profit">
          <div class="stat-icon"><el-icon><TrendCharts /></el-icon></div>
          <div class="stat-content">
            <div class="stat-value" :class="{ positive: summary.grossProfit >= 0, negative: summary.grossProfit < 0 }">
              {{ formatCurrency(summary.grossProfit) }}
            </div>
            <div class="stat-label">毛利润</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card margin">
          <div class="stat-icon"><el-icon><DataAnalysis /></el-icon></div>
          <div class="stat-content">
            <div class="stat-value" :class="{ positive: summary.grossMargin >= 0, negative: summary.grossMargin < 0 }">
              {{ summary.grossMargin }}%
            </div>
            <div class="stat-label">毛利率</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 主内容区 -->
    <el-card class="data-card">
      <el-tabs v-model="activeTab">
        <!-- 产品盈利 -->
        <el-tab-pane label="产品盈利分析" name="products">
          <el-table :data="productList" border v-loading="productsLoading" stripe>
            <el-table-column type="index" label="#" width="50" />
            <el-table-column prop="product_code" label="产品编码" width="120" />
            <el-table-column prop="product_name" label="产品名称" min-width="180" />
            <el-table-column prop="total_quantity" label="销售数量" width="100" align="right" />
            <el-table-column label="销售收入" width="130" align="right">
              <template #default="{ row }">
                {{ formatCurrency(row.total_revenue) }}
              </template>
            </el-table-column>
            <el-table-column label="销售成本" width="130" align="right">
              <template #default="{ row }">
                {{ formatCurrency(row.total_cost) }}
              </template>
            </el-table-column>
            <el-table-column label="毛利润" width="130" align="right">
              <template #default="{ row }">
                <span :class="{ positive: row.gross_profit >= 0, negative: row.gross_profit < 0 }">
                  {{ formatCurrency(row.gross_profit) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="毛利率" width="100" align="center">
              <template #default="{ row }">
                <el-tag :type="getMarginType(row.gross_margin)" size="small">
                  {{ row.gross_margin }}%
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- 客户盈利 -->
        <el-tab-pane label="客户盈利贡献" name="customers">
          <el-table :data="customerList" border v-loading="customersLoading" stripe>
            <el-table-column type="index" label="#" width="50" />
            <el-table-column prop="customer_code" label="客户编码" width="120" />
            <el-table-column prop="customer_name" label="客户名称" min-width="200" />
            <el-table-column prop="order_count" label="订单数" width="80" align="center" />
            <el-table-column label="销售总额" width="130" align="right">
              <template #default="{ row }">
                {{ formatCurrency(row.total_revenue) }}
              </template>
            </el-table-column>
            <el-table-column label="成本总额" width="130" align="right">
              <template #default="{ row }">
                {{ formatCurrency(row.total_cost) }}
              </template>
            </el-table-column>
            <el-table-column label="贡献毛利" width="130" align="right">
              <template #default="{ row }">
                <span :class="{ positive: row.gross_profit >= 0, negative: row.gross_profit < 0 }">
                  {{ formatCurrency(row.gross_profit) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="毛利率" width="100" align="center">
              <template #default="{ row }">
                <el-tag :type="getMarginType(row.gross_margin)" size="small">
                  {{ row.gross_margin }}%
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- 盈利趋势 -->
        <el-tab-pane label="盈利趋势" name="trend">
          <div class="trend-chart" ref="trendChartRef"></div>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Money, Goods, TrendCharts, DataAnalysis } from '@element-plus/icons-vue'
import { api } from '@/services/api'
import * as echarts from 'echarts'
import { formatCurrency } from '@/utils/helpers/formatters'

// 数据
const activeTab = ref('products')
const dateRange = ref([])
const summary = ref({
  totalRevenue: 0,
  totalCost: 0,
  grossProfit: 0,
  grossMargin: 0
})
const productList = ref([])
const customerList = ref([])
const trendData = ref([])
const productsLoading = ref(false)
const customersLoading = ref(false)
const trendChartRef = ref(null)
let trendChart = null

// 获取毛利率标签类型
const getMarginType = (margin) => {
  if (margin >= 30) return 'success'
  if (margin >= 15) return 'warning'
  if (margin >= 0) return 'info'
  return 'danger'
}

// 获取查询参数
const getQueryParams = () => {
  const params = {}
  if (dateRange.value && dateRange.value.length === 2) {
    params.startDate = dateRange.value[0]
    params.endDate = dateRange.value[1]
  }
  return params
}

// 加载汇总数据
const loadSummary = async () => {
  try {
    const res = await api.get('/finance/profitability/summary', { params: getQueryParams() })
    summary.value = res.data?.data || res.data || {}
  } catch (error) {
    console.error('加载盈利汇总失败:', error)
  }
}

// 加载产品盈利
const loadProducts = async () => {
  productsLoading.value = true
  try {
    const res = await api.get('/finance/profitability/products', { params: { ...getQueryParams(), limit: 50 } })
    productList.value = res.data?.data || res.data || []
  } catch (error) {
    console.error('加载产品盈利失败:', error)
    ElMessage.error('加载产品盈利数据失败')
  } finally {
    productsLoading.value = false
  }
}

// 加载客户盈利
const loadCustomers = async () => {
  customersLoading.value = true
  try {
    const res = await api.get('/finance/profitability/customers', { params: { ...getQueryParams(), limit: 50 } })
    customerList.value = res.data?.data || res.data || []
  } catch (error) {
    console.error('加载客户盈利失败:', error)
    ElMessage.error('加载客户盈利数据失败')
  } finally {
    customersLoading.value = false
  }
}

// 加载趋势数据
const loadTrend = async () => {
  try {
    const res = await api.get('/finance/profitability/trend', { params: getQueryParams() })
    trendData.value = res.data?.data || res.data || []
    renderTrendChart()
  } catch (error) {
    console.error('加载盈利趋势失败:', error)
  }
}

// 渲染趋势图表
const renderTrendChart = () => {
  nextTick(() => {
    if (!trendChartRef.value) return
    
    // 检查 DOM 元素是否有有效尺寸（避免 ECharts 报错）
    const { clientWidth, clientHeight } = trendChartRef.value
    if (clientWidth === 0 || clientHeight === 0) {
      // 元素不可见，延迟再次尝试
      return
    }
    
    if (!trendChart) {
      trendChart = echarts.init(trendChartRef.value)
    }

    const option = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' }
      },
      legend: {
        data: ['收入', '成本', '毛利']
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: trendData.value.map(d => d.period)
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: (val) => (val / 10000).toFixed(0) + '万'
        }
      },
      series: [
        {
          name: '收入',
          type: 'bar',
          data: trendData.value.map(d => d.total_revenue),
          itemStyle: { color: 'var(--color-primary)' }
        },
        {
          name: '成本',
          type: 'bar',
          data: trendData.value.map(d => d.total_cost),
          itemStyle: { color: 'var(--color-warning)' }
        },
        {
          name: '毛利',
          type: 'line',
          data: trendData.value.map(d => d.gross_profit),
          itemStyle: { color: 'var(--color-success)' },
          lineStyle: { width: 3 }
        }
      ]
    }

    trendChart.setOption(option)
  })
}

// 加载所有数据
const loadAllData = async () => {
  await Promise.all([
    loadSummary(),
    loadProducts(),
    loadCustomers(),
    loadTrend()
  ])
}

// 监听Tab切换
watch(activeTab, (val) => {
  if (val === 'trend') {
    nextTick(() => {
      if (trendChart) {
        trendChart.resize()
      } else {
        renderTrendChart()
      }
    })
  }
})

// 初始化
onMounted(() => {
  loadAllData()
})
</script>

<style scoped>
.profitability-container {
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
  margin: 0;
  font-size: 22px;
  color: var(--color-text-primary);
}

.subtitle {
  margin: 5px 0 0 0;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.summary-row {
  margin-bottom: 20px;
}

.stat-card {
  cursor: pointer;
  transition: all 0.3s;
}

.stat-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.stat-card :deep(.el-card__body) {
  display: flex;
  align-items: center;
  padding: 20px;
}

.stat-icon {
  width: 60px;
  height: 60px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 15px;
  font-size: 28px;
  color: var(--color-on-primary, #fff);
}

.stat-card.revenue .stat-icon { background: linear-gradient(135deg, #409EFF 0%, #66b1ff 100%); }
.stat-card.cost .stat-icon { background: linear-gradient(135deg, #E6A23C 0%, #f0c78a 100%); }
.stat-card.profit .stat-icon { background: linear-gradient(135deg, #67C23A 0%, #85ce61 100%); }
.stat-card.margin .stat-icon { background: linear-gradient(135deg, #909399 0%, #b1b3b8 100%); }

.stat-value {
  font-size: 24px;
  font-weight: bold;
  color: var(--color-text-primary);
  margin-bottom: 5px;
}

.stat-label {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.positive { color: var(--color-success); }
.negative { color: var(--color-danger); }

.data-card {
  margin-bottom: 20px;
}

.trend-chart {
  width: 100%;
  height: 400px;
}
</style>
