<template>
  <div class="asset-reports-container" v-loading="loading" element-loading-text="正在加载资产报表数据...">
    <el-card class="header-card mb-4" shadow="never">
      <div class="header-section">
        <h2 class="page-title">固定资产报表与预测</h2>
        <div class="header-actions">
          <el-button @click="loadData" :icon="Refresh">刷新数据</el-button>
          <el-button v-permission="'finance:assets:export'" type="primary" :icon="Download" @click="exportReports">导出报告</el-button>
        </div>
      </div>
    </el-card>

    <!-- 顶层汇总卡片 -->
    <el-row :gutter="20" class="mb-4">
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card" v-loading="loading">
          <div class="stat-title">总资产数</div>
          <div class="stat-value text-primary">{{ summary.totalAssets || 0 }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card" v-loading="loading">
          <div class="stat-title">总资产原值</div>
          <div class="stat-value text-success">¥ {{ formatMoney(summary.totalValue || 0) }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card" v-loading="loading">
          <div class="stat-title">总资产净值</div>
          <div class="stat-value text-warning">¥ {{ formatMoney(summary.netValue || 0) }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card" v-loading="loading">
          <div class="stat-title">在用资产比例</div>
          <div class="stat-value text-info">{{ inUseRatio }}%</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 图表行 1 -->
    <el-row :gutter="20" class="mb-4">
      <el-col :span="12">
        <el-card shadow="hover" class="chart-card">
          <template #header>
            <div class="card-header">
              <span>资产状态分布</span>
            </div>
          </template>
          <div ref="statusChartRef" class="chart-container" v-loading="loading"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="hover" class="chart-card">
          <template #header>
            <div class="card-header">
              <span>资产类别分布</span>
            </div>
          </template>
          <div ref="categoryChartRef" class="chart-container" v-loading="loading"></div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 图表行 2 -->
    <el-row :gutter="20" class="mb-4">
      <el-col :span="24">
        <el-card shadow="hover" class="chart-card">
          <template #header>
            <div class="card-header">
              <span>近12个月资产新增趋势 (按原值)</span>
            </div>
          </template>
          <div ref="trendChartRef" class="chart-container" style="height: 350px;" v-loading="loading"></div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 图表行 3：折旧预测 -->
    <el-row :gutter="20" class="mb-4">
      <el-col :span="24">
        <el-card shadow="hover" class="chart-card">
          <template #header>
            <div class="card-header">
              <span>未来6个月折旧费用预测</span>
              <el-select v-model="forecastMonths" size="small" @change="loadForecast">
                <el-option label="3个月" :value="3" />
                <el-option label="6个月" :value="6" />
                <el-option label="12个月" :value="12" />
              </el-select>
            </div>
          </template>
          <div ref="forecastChartRef" class="chart-container" style="height: 350px;" v-loading="forecastLoading"></div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed, onBeforeUnmount } from 'vue'
import { Refresh, Download } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts'
import { api } from '@/services/api'
import { parseDataObject } from '@/utils/responseParser'

const loading = ref(false)
const forecastLoading = ref(false)
const forecastMonths = ref(6)

// 概览数据
const summary = reactive({
  totalAssets: 0,
  totalValue: 0,
  netValue: 0,
  inUseCount: 0
})

const inUseRatio = computed(() => {
  if (!summary.totalAssets) return '0.00'
  return ((summary.inUseCount / summary.totalAssets) * 100).toFixed(2)
})

// 图表 refs
const statusChartRef = ref(null)
const categoryChartRef = ref(null)
const trendChartRef = ref(null)
const forecastChartRef = ref(null)

// 存储 chart 实例以便统一 resize 和清理
let statusChart = null
let categoryChart = null
let trendChart = null
let forecastChart = null

const formatMoney = (val) => {
  return Number(val).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const loadData = async () => {
  loading.value = true
  try {
    // 1. 获取汇总概览 (复用原有的统计接口)
    const statsRes = await api.get('/finance/assets/stats')
    const statsData = parseDataObject(statsRes, { enableLog: false })
    summary.totalAssets = statsData.total || 0
    summary.totalValue = statsData.totalValue || 0
    summary.netValue = statsData.netValue || 0
    summary.inUseCount = statsData.inUseCount || 0

    // 2. 获取看板图表数据
    const dashRes = await api.get('/finance/assets/dashboard/stats')
    const dashData = parseDataObject(dashRes, { enableLog: false })
    
    renderStatusChart(dashData.statusStats)
    renderCategoryChart(dashData.categoryStats)
    renderTrendChart(dashData.trendStats)

  } catch (err) {
    ElMessage.error('加载看板数据失败')
    console.error(err)
  } finally {
    loading.value = false
  }

  // 单独加载预测数据以免阻塞主面板
  loadForecast()
}

const loadForecast = async () => {
  forecastLoading.value = true
  try {
    const res = await api.get('/finance/assets/depreciation/forecast', {
      params: { months: forecastMonths.value }
    })
    const forecastData = parseDataObject(res, { enableLog: false })
    renderForecastChart(forecastData)
  } catch (err) {
    ElMessage.error('加载预测数据失败')
  } finally {
    forecastLoading.value = false
  }
}

// 渲染状态饼图
const renderStatusChart = (data = []) => {
  if (!statusChartRef.value) return
  if (!statusChart) statusChart = echarts.init(statusChartRef.value)

  const chartData = data.map(item => ({
    name: item.status,
    value: item.count
  }))

  const option = {
    tooltip: { trigger: 'item', formatter: '{a} <br/>{b}: {c} ({d}%)' },
    legend: { orient: 'vertical', left: '10', top: 'center' },
    color: ['#409EFF', '#E6A23C', '#F56C6C', '#909399'],
    series: [
      {
        name: '资产状态',
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['60%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
        label: { show: false, position: 'center' },
        emphasis: {
          label: { show: true, fontSize: '18', fontWeight: 'bold' }
        },
        labelLine: { show: false },
        data: chartData
      }
    ]
  }
  statusChart.setOption(option)
}

// 渲染类别饼图
const renderCategoryChart = (data = []) => {
  if (!categoryChartRef.value) return
  if (!categoryChart) categoryChart = echarts.init(categoryChartRef.value)

  const chartData = data.map(item => ({
    name: item.category || '未分类',
    value: parseFloat(item.total_value) || 0
  }))

  const option = {
    tooltip: { trigger: 'item', formatter: '{a} <br/>{b}: ¥{c} ({d}%)' },
    legend: { orient: 'vertical', left: '10', top: 'center' },
    series: [
      {
        name: '资产原值比例',
        type: 'pie',
        radius: '70%',
        center: ['60%', '50%'],
        data: chartData,
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' }
        }
      }
    ]
  }
  categoryChart.setOption(option)
}

// 渲染趋势图
const renderTrendChart = (data = []) => {
  if (!trendChartRef.value) return
  if (!trendChart) trendChart = echarts.init(trendChartRef.value)

  const months = data.map(item => item.month)
  const counts = data.map(item => item.count)
  const values = data.map(item => item.total_value)

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross', crossStyle: { color: '#999' } }
    },
    legend: { data: ['新增数量', '新增原值'] },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: [ { type: 'category', data: months, axisPointer: { type: 'shadow' } } ],
    yAxis: [
      { type: 'value', name: '原值 (元)', axisLabel: { formatter: '¥{value}' } },
      { type: 'value', name: '数量 (个)', min: 0, interval: 5, axisLabel: { formatter: '{value}' } }
    ],
    series: [
      {
        name: '新增原值',
        type: 'bar',
        barWidth: '40%',
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#83bff6' },
            { offset: 0.5, color: '#188df0' },
            { offset: 1, color: '#188df0' }
          ])
        },
        data: values
      },
      {
        name: '新增数量',
        type: 'line',
        yAxisIndex: 1,
        symbol: 'circle',
        symbolSize: 8,
        itemStyle: { color: '#F56C6C' },
        lineStyle: { width: 3 },
        data: counts
      }
    ]
  }
  trendChart.setOption(option)
}

// 渲染折旧预测图
const renderForecastChart = (data = []) => {
  if (!forecastChartRef.value) return
  if (!forecastChart) forecastChart = echarts.init(forecastChartRef.value)

  const months = data.map(item => item.month)
  const amounts = data.map(item => item.amount)

  const option = {
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', boundaryGap: false, data: months },
    yAxis: { type: 'value', axisLabel: { formatter: '¥{value}' } },
    series: [
      {
        name: '预计折旧额',
        type: 'line',
        smooth: true,
        symbolSize: 10,
        itemStyle: { color: '#67C23A' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(103, 194, 58, 0.5)' },
            { offset: 1, color: 'rgba(103, 194, 58, 0.1)' }
          ])
        },
        data: amounts
      }
    ]
  }
  forecastChart.setOption(option)
}

const exportReports = () => {
  ElMessage.info('导出报告功能开发中')
}

const handleResize = () => {
  statusChart?.resize()
  categoryChart?.resize()
  trendChart?.resize()
  forecastChart?.resize()
}

onMounted(() => {
  loadData()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  statusChart?.dispose()
  categoryChart?.dispose()
  trendChart?.dispose()
  forecastChart?.dispose()
})
</script>

<style scoped>
.asset-reports-container {
  padding: 10px;
}
.header-card {
  border: none;
}
.mb-4 {
  margin-bottom: 20px;
}
.header-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
}
.stat-card {
  border-radius: 8px;
  text-align: center;
}
.stat-card :deep(.el-card__body) {
  padding: 14px 20px;
}
.stat-title {
  color: var(--color-text-secondary);
  font-size: 14px;
  margin-bottom: 8px;
}
.stat-value {
  font-size: 24px;
  font-weight: bold;
}
.text-primary { color: var(--color-primary); }
.text-success { color: var(--color-success); }
.text-warning { color: var(--color-warning); }
.text-info { color: var(--color-text-secondary); }

.chart-card {
  border-radius: 8px;
  margin-bottom: 20px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 500;
}
.chart-container {
  height: 300px;
  width: 100%;
}
</style>
