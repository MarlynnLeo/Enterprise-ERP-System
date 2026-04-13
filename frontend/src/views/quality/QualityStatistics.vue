<template>
  <div class="inspection-container">
    <!-- 日期筛选 -->
    <el-card class="box-card">
      <template #header>
        <div class="card-header">
          <span>质量统计报表</span>
        </div>
      </template>
      <el-form :inline="true" class="search-form" >
        <el-form-item label="统计周期">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            @change="fetchAllData"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchAllData">刷新数据</el-button>
          <el-button @click="resetDateRange">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 综合概览 - 使用统一的 stat-card 风格 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value" style="color: #409eff;">{{ overview.total_ncp || 0 }}</div>
        <div class="stat-label">不合格品总数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value" style="color: #E6A23C;">{{ overview.pending_count || 0 }}</div>
        <div class="stat-label">待处理</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value" style="color: #F56C6C;">{{ overview.return_count || 0 }}</div>
        <div class="stat-label">退货</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value" style="color: #909399;">{{ overview.replacement_count || 0 }}</div>
        <div class="stat-label">换货</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value" style="color: #E6A23C;">{{ overview.rework_count || 0 }}</div>
        <div class="stat-label">返工</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value" style="color: #F56C6C;">{{ overview.scrap_count || 0 }}</div>
        <div class="stat-label">报废</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value" style="color: #67C23A;">{{ overview.use_as_is_count || 0 }}</div>
        <div class="stat-label">让步接收</div>
      </el-card>
    </div>

    <!-- 处理方式分布 & 成本分析 -->
    <el-row :gutter="20" class="equal-height-row">
      <el-col :span="12">
        <el-card class="box-card">
          <template #header>
            <div class="card-header">
              <span>处理方式分布</span>
            </div>
          </template>
          <div ref="dispositionChart" style="height: 350px;"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card class="box-card">
          <template #header>
            <div class="card-header">
              <span>质量成本分析</span>
            </div>
          </template>
          <div class="cost-analysis">
            <el-row :gutter="20">
              <el-col :span="12">
                <div class="cost-item">
                  <div class="cost-icon" style="background: rgba(64,158,255,0.1); color: #409eff;">
                    <el-icon :size="28"><Tools /></el-icon>
                  </div>
                  <div class="cost-info">
                    <div class="cost-label">返工成本</div>
                    <div class="cost-value">¥{{ formatCost(costData.rework_cost) }}</div>
                    <div class="cost-count">{{ costData.rework_count || 0 }} 次返工</div>
                  </div>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="cost-item">
                  <div class="cost-icon" style="background: rgba(245,108,108,0.1); color: #F56C6C;">
                    <el-icon :size="28"><Delete /></el-icon>
                  </div>
                  <div class="cost-info">
                    <div class="cost-label">报废成本</div>
                    <div class="cost-value">¥{{ formatCost(costData.scrap_cost) }}</div>
                    <div class="cost-count">{{ costData.scrap_count || 0 }} 次报废</div>
                  </div>
                </div>
              </el-col>
            </el-row>
            <el-divider />
            <div class="total-cost">
              <span>总质量成本</span>
              <span class="total-value">¥{{ formatCost(costData.total_cost) }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 趋势分析 -->
    <el-card class="box-card">
      <template #header>
        <div class="card-header">
          <span>不合格品趋势分析</span>
          <el-radio-group v-model="trendGroupBy" size="small" @change="fetchTrendData">
            <el-radio-button value="day">按天</el-radio-button>
            <el-radio-button value="week">按周</el-radio-button>
            <el-radio-button value="month">按月</el-radio-button>
          </el-radio-group>
        </div>
      </template>
      <div ref="trendChart" style="height: 400px;"></div>
    </el-card>

    <!-- 供应商质量分析 -->
    <el-card class="box-card" style="margin-bottom: 16px;">
      <template #header>
        <div class="card-header">
          <span>供应商质量分析 (Top 20)</span>
        </div>
      </template>
      <el-table :data="supplierData" border style="width: 100%;">
        <el-table-column type="index" label="排名" width="60" align="center" />
        <el-table-column prop="supplier_name" label="供应商名称" min-width="200" />
        <el-table-column prop="ncp_count" label="不合格次数" width="120" align="right" sortable />
        <el-table-column prop="total_defect_quantity" label="不合格数量" width="120" align="right" sortable />
        <el-table-column prop="affected_materials" label="涉及物料数" width="120" align="right" sortable />
        <el-table-column prop="return_count" label="退货次数" width="100" align="right" />
        <el-table-column prop="replacement_count" label="换货次数" width="100" align="right" />
        <el-table-column prop="scrap_count" label="报废次数" width="100" align="right" />
      </el-table>
    </el-card>

    <!-- 物料缺陷分析 -->
    <el-card class="box-card" style="margin-bottom: 16px;">
      <template #header>
        <div class="card-header">
          <span>物料缺陷分析 (Top 20)</span>
        </div>
      </template>
      <el-table :data="materialData" border style="width: 100%;">
        <el-table-column type="index" label="排名" width="60" align="center" />
        <el-table-column prop="material_code" label="物料编码" width="150" />
        <el-table-column prop="material_name" label="物料名称" min-width="200" />
        <el-table-column prop="ncp_count" label="不合格次数" width="120" align="right" sortable />
        <el-table-column prop="total_defect_quantity" label="不合格数量" width="120" align="right" sortable />
        <el-table-column prop="defect_types" label="缺陷类型" min-width="200" show-overflow-tooltip />
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, onBeforeUnmount } from 'vue'
import * as echarts from 'echarts'
import { qualityStatisticsApi } from '@/api/quality'
import { useAuthStore } from '@/stores/auth'
import { Tools, Delete } from '@element-plus/icons-vue'

const authStore = useAuthStore()

const dateRange = ref([])
const trendGroupBy = ref('day')

const overview = ref({})
const costData = ref({})
const supplierData = ref([])
const materialData = ref([])
const dispositionData = ref([])
const trendData = ref([])

let dispositionChartInstance = null
let trendChartInstance = null

const dispositionChart = ref(null)
const trendChart = ref(null)

// 格式化成本金额
const formatCost = (val) => {
  const num = parseFloat(val) || 0
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// 获取所有数据
const fetchAllData = async () => {
  await Promise.all([
    fetchOverview(),
    fetchCostData(),
    fetchSupplierData(),
    fetchMaterialData(),
    fetchDispositionData(),
    fetchTrendData()
  ])
}

// 获取综合概览
const fetchOverview = async () => {
  try {
    const params = getDateParams()
    const response = await qualityStatisticsApi.getOverview(params)
    overview.value = response.data || response || {}
  } catch (error) {
    console.error('获取综合概览失败:', error)
  }
}

// 获取成本数据
const fetchCostData = async () => {
  try {
    const params = getDateParams()
    const response = await qualityStatisticsApi.getCostAnalysis(params)
    costData.value = response.data || response || {}
  } catch (error) {
    console.error('获取成本数据失败:', error)
  }
}

// 获取供应商数据
const fetchSupplierData = async () => {
  try {
    const params = getDateParams()
    const response = await qualityStatisticsApi.getSupplierQualityAnalysis(params)
    supplierData.value = response.data || response || []
  } catch (error) {
    console.error('获取供应商数据失败:', error)
  }
}

// 获取物料数据
const fetchMaterialData = async () => {
  try {
    const params = getDateParams()
    const response = await qualityStatisticsApi.getMaterialDefectAnalysis(params)
    materialData.value = response.data || response || []
  } catch (error) {
    console.error('获取物料数据失败:', error)
  }
}

// 获取处理方式分布数据
const fetchDispositionData = async () => {
  try {
    const params = getDateParams()
    const response = await qualityStatisticsApi.getDispositionStatistics(params)
    dispositionData.value = response.data || response || []
    await nextTick()
    renderDispositionChart()
  } catch (error) {
    console.error('获取处理方式分布数据失败:', error)
  }
}

// 获取趋势数据
const fetchTrendData = async () => {
  try {
    const params = {
      ...getDateParams(),
      groupBy: trendGroupBy.value
    }
    const response = await qualityStatisticsApi.getTrendAnalysis(params)
    trendData.value = response.data || response || []
    await nextTick()
    renderTrendChart()
  } catch (error) {
    console.error('获取趋势数据失败:', error)
  }
}

// 获取日期参数
const getDateParams = () => {
  const params = {}
  if (dateRange.value && dateRange.value.length === 2) {
    params.startDate = dateRange.value[0]
    params.endDate = dateRange.value[1]
  }
  return params
}

// 重置日期范围
const resetDateRange = () => {
  dateRange.value = []
  fetchAllData()
}

// 系统主题色板
const themeColors = ['#409eff', '#67C23A', '#E6A23C', '#F56C6C', '#909399', '#00b4d8']

// 渲染处理方式分布图表
const renderDispositionChart = () => {
  if (!dispositionChart.value) return

  if (!dispositionChartInstance) {
    dispositionChartInstance = echarts.init(dispositionChart.value)
  }

  const dispositionLabels = {
    return: '退货',
    replacement: '换货',
    rework: '返工',
    scrap: '报废',
    use_as_is: '让步接收',
    pending: '待处理'
  }

  const data = (Array.isArray(dispositionData.value) ? dispositionData.value : []).map(item => ({
    name: dispositionLabels[item.disposition] || item.disposition,
    value: item.count
  }))

  const option = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    legend: {
      orient: 'vertical',
      right: 10,
      top: 'center',
      textStyle: { color: '#606266' }
    },
    color: themeColors,
    series: [
      {
        name: '处理方式',
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['40%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 6,
          borderColor: '#fff',
          borderWidth: 2
        },
        label: {
          show: true,
          formatter: '{b}: {d}%',
          color: '#606266'
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 15,
            fontWeight: 'bold'
          }
        },
        data
      }
    ]
  }

  dispositionChartInstance.setOption(option, true)
}

// 渲染趋势图表
const renderTrendChart = () => {
  if (!trendChart.value) return

  if (!trendChartInstance) {
    trendChartInstance = echarts.init(trendChart.value)
  }

  const chartData = Array.isArray(trendData.value) ? trendData.value : []

  const option = {
    tooltip: {
      trigger: 'axis'
    },
    legend: {
      data: ['总数', '退货', '换货', '返工', '报废', '让步接收'],
      textStyle: { color: '#606266' }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    color: themeColors,
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: chartData.map(item => item.period),
      axisLabel: { color: '#909399' },
      axisLine: { lineStyle: { color: '#DCDFE6' } }
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#909399' },
      splitLine: { lineStyle: { color: '#EBEEF5' } }
    },
    series: [
      {
        name: '总数',
        type: 'line',
        data: chartData.map(item => item.total_count),
        smooth: true,
        lineStyle: { width: 3 },
        areaStyle: { opacity: 0.05 }
      },
      {
        name: '退货',
        type: 'line',
        data: chartData.map(item => item.return_count),
        smooth: true
      },
      {
        name: '换货',
        type: 'line',
        data: chartData.map(item => item.replacement_count),
        smooth: true
      },
      {
        name: '返工',
        type: 'line',
        data: chartData.map(item => item.rework_count),
        smooth: true
      },
      {
        name: '报废',
        type: 'line',
        data: chartData.map(item => item.scrap_count),
        smooth: true
      },
      {
        name: '让步接收',
        type: 'line',
        data: chartData.map(item => item.use_as_is_count),
        smooth: true
      }
    ]
  }

  trendChartInstance.setOption(option, true)
}

// 窗口resize处理
const handleResize = () => {
  dispositionChartInstance?.resize()
  trendChartInstance?.resize()
}

onMounted(() => {
  // 设置默认日期范围为最近30天
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  dateRange.value = [
    start.toISOString().slice(0, 10),
    end.toISOString().slice(0, 10)
  ]

  fetchAllData()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  dispositionChartInstance?.dispose()
  trendChartInstance?.dispose()
})
</script>

<style scoped>
.inspection-container {
  padding: 20px;
}

.box-card {
  margin-bottom: 16px;
}

.statistics-row {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.stat-card {
  flex: 1;
  text-align: center;
  cursor: default;
}

.stat-card .stat-value {
  font-size: 32px;
  font-weight: bold;
  line-height: 1.2;
}

.stat-card .stat-label {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-top: 6px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: bold;
}

/* 左右两列等高 */
.equal-height-row {
  display: flex;
  margin-bottom: 16px;
}

.equal-height-row :deep(.el-col) {
  display: flex;
}

.equal-height-row :deep(.el-card) {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.equal-height-row :deep(.el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.cost-analysis {
  display: flex;
  flex-direction: column;
  justify-content: center;
  flex: 1;
}

.cost-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 24px 20px;
  background: var(--color-bg-light);
  border-radius: 8px;
  border: 1px solid #f0f0f0;
}

.cost-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.cost-info {
  flex: 1;
}

.cost-label {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}

.cost-value {
  font-size: 24px;
  font-weight: bold;
  color: var(--color-text-primary);
  margin-bottom: 2px;
}

.cost-count {
  font-size: 12px;
  color: var(--color-text-placeholder);
}

.total-cost {
  text-align: center;
  font-size: 16px;
  color: var(--color-text-regular);
  padding: 16px 0 0;
}

.total-value {
  font-size: 28px;
  font-weight: bold;
  color: var(--color-danger);
  margin-left: 16px;
}
</style>
