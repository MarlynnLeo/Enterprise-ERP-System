<!--
/**
 * ProductionDataView.vue
 * @description 生产数据看板 - 生产全局数据总览
 * @date 2026-04-28
 * @version 1.0.0
 */
-->
<template>
  <div class="production-data-view">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2>
        <el-icon><DataAnalysis /></el-icon>
        生产数据看板
      </h2>
      <div class="header-actions">
        <el-radio-group v-model="trendGranularity" size="small" @change="fetchTrends">
          <el-radio-button value="day">本月日视图</el-radio-button>
          <el-radio-button value="month">近12月</el-radio-button>
        </el-radio-group>
        <el-button :icon="Refresh" circle @click="refreshAll" :loading="loading" />
      </div>
    </div>

    <!-- 统计卡片 -->
    <el-row :gutter="16" class="stat-cards" v-loading="loading">
      <el-col :xs="12" :sm="6" :lg="6" v-for="card in statCards" :key="card.key">
        <div class="stat-card" :class="card.theme">
          <div class="stat-card__icon">
            <el-icon :size="28"><component :is="card.icon" /></el-icon>
          </div>
          <div class="stat-card__content">
            <div class="stat-card__value">{{ card.value }}</div>
            <div class="stat-card__label">{{ card.label }}</div>
          </div>
          <div class="stat-card__footer" v-if="card.sub">
            <span v-for="(s, i) in card.sub" :key="i" class="stat-card__sub">
              <em :class="s.cls">{{ s.val }}</em> {{ s.label }}
            </span>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 图表区域 -->
    <el-row :gutter="16" class="chart-row">
      <!-- 生产趋势 -->
      <el-col :xs="24" :lg="16">
        <div class="chart-card">
          <div class="chart-card__header">
            <span>生产趋势</span>
            <el-tag size="small" type="info">
              {{ trendGranularity === 'day' ? '当月' : '近12个月' }}
            </el-tag>
          </div>
          <div class="chart-card__body" ref="trendChartRef" v-loading="trendLoading"></div>
        </div>
      </el-col>

      <!-- 任务状态分布 -->
      <el-col :xs="24" :lg="8">
        <div class="chart-card">
          <div class="chart-card__header">
            <span>任务状态分布</span>
          </div>
          <div class="chart-card__body" ref="pieChartRef" v-loading="loading"></div>
        </div>
      </el-col>
    </el-row>

    <!-- 下方列表 -->
    <el-row :gutter="16" class="list-row">
      <!-- 待办任务 -->
      <el-col :xs="24" :lg="12">
        <div class="list-card">
          <div class="list-card__header">
            <span><el-icon><Clock /></el-icon> 待办任务</span>
            <el-tag size="small">{{ pendingTasks.length }} 项</el-tag>
          </div>
          <div class="list-card__body">
            <el-table :data="pendingTasks" size="small" max-height="320" stripe>
              <el-table-column prop="code" label="任务编号" width="140" />
              <el-table-column prop="productName" label="产品" min-width="120" show-overflow-tooltip />
              <el-table-column prop="quantity" label="数量" width="80" align="center" />
              <el-table-column prop="status" label="状态" width="90" align="center">
                <template #default="{ row }">
                  <el-tag size="small" :type="getStatusType(row.status)">
                    {{ getStatusText(row.status) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="startDate" label="开始日期" width="110" />
            </el-table>
            <el-empty v-if="pendingTasks.length === 0" description="暂无待办任务" :image-size="60" />
          </div>
        </div>
      </el-col>

      <!-- 工序完成率 -->
      <el-col :xs="24" :lg="12">
        <div class="list-card">
          <div class="list-card__header">
            <span><el-icon><Finished /></el-icon> 工序完成概览</span>
            <el-tag size="small" type="success">{{ processRates.length }} 道工序</el-tag>
          </div>
          <div class="list-card__body">
            <el-table :data="processRates" size="small" max-height="320" stripe>
              <el-table-column prop="name" label="工序名称" min-width="140" show-overflow-tooltip />
              <el-table-column prop="total" label="总数" width="70" align="center" />
              <el-table-column prop="completed" label="已完成" width="70" align="center" />
              <el-table-column label="完成率" width="200">
                <template #default="{ row }">
                  <div class="custom-progress">
                    <div class="custom-progress__track">
                      <div
                        class="custom-progress__bar"
                        :style="{ width: row.rate + '%', backgroundColor: getBarColor(row.rate) }"
                      ></div>
                    </div>
                    <span class="custom-progress__text">{{ row.rate }}%</span>
                  </div>
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-if="processRates.length === 0" description="暂无工序数据" :image-size="60" />
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 甘特图排程视图 -->
    <div class="gantt-section">
      <div class="chart-card">
        <div class="chart-card__header">
          <span><el-icon><SetUp /></el-icon> 排程甘特图</span>
          <div style="display: flex; align-items: center; gap: 8px">
            <el-date-picker
              v-model="ganttDateRange"
              type="daterange"
              range-separator="~"
              start-placeholder="开始"
              end-placeholder="结束"
              size="small"
              style="width: 240px"
              value-format="YYYY-MM-DD"
              @change="fetchGanttData"
            />
            <el-button size="small" @click="fetchGanttData" :icon="Refresh">刷新</el-button>
          </div>
        </div>
        <div
          class="gantt-chart-body"
          ref="ganttChartRef"
          v-loading="ganttLoading"
        ></div>
        <el-empty v-if="!ganttLoading && ganttGroups.length === 0" description="暂无排程数据" :image-size="60" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import {
  DataAnalysis, Refresh, Clock, Finished,
  Document, SetUp, Histogram, TrendCharts
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts'
import axios from '@/services/api'
import dayjs from 'dayjs'

// ============ 响应式数据 ============
const loading = ref(false)
const trendLoading = ref(false)
const trendGranularity = ref('day')

// 统计数据
const stats = ref({
  plans: { total: 0, pending: 0, completed: 0, in_progress: 0 },
  tasks: { total: 0, inProgress: 0, completed: 0, pending: 0 },
  processes: { completed: 0, total: 0, rate: '0%' },
  reports: { total: 0, today: 0 },
  production: { total_quantity: 0, qualified_quantity: 0, quality_rate: 0 },
})

// 待办任务
const pendingTasks = ref([])

// 工序完成率
const processRates = ref([])

// 趋势数据
const trendData = ref(null)

// 甘特图
const ganttLoading = ref(false)
const ganttGroups = ref([])
const ganttChartRef = ref(null)
let ganttChart = null
const ganttDateRange = ref([
  dayjs().subtract(7, 'day').format('YYYY-MM-DD'),
  dayjs().add(14, 'day').format('YYYY-MM-DD'),
])

// 图表引用
const trendChartRef = ref(null)
const pieChartRef = ref(null)
let trendChart = null
let pieChart = null

// ============ 计算属性 ============
const statCards = computed(() => [
  {
    key: 'plans',
    label: '生产计划',
    value: stats.value.plans.total,
    icon: Document,
    theme: 'theme-blue',
    sub: [
      { val: stats.value.plans.in_progress, label: '进行中', cls: 'color-blue' },
      { val: stats.value.plans.completed, label: '已完成', cls: 'color-green' },
    ],
  },
  {
    key: 'tasks',
    label: '生产任务',
    value: stats.value.tasks.total,
    icon: SetUp,
    theme: 'theme-green',
    sub: [
      { val: stats.value.tasks.inProgress, label: '进行中', cls: 'color-blue' },
      { val: stats.value.tasks.pending, label: '待处理', cls: 'color-orange' },
    ],
  },
  {
    key: 'processes',
    label: '本月工序完成',
    value: `${stats.value.processes.completed} / ${stats.value.processes.total}`,
    icon: Histogram,
    theme: 'theme-purple',
    sub: [
      { val: stats.value.processes.rate, label: '完成率', cls: 'color-purple' },
    ],
  },
  {
    key: 'quality',
    label: '今日质量率',
    value: `${stats.value.production.quality_rate}%`,
    icon: TrendCharts,
    theme: 'theme-orange',
    sub: [
      { val: stats.value.reports.today, label: '今日报工', cls: 'color-orange' },
      { val: stats.value.reports.total, label: '累计报工', cls: 'color-gray' },
    ],
  },
])

// ============ 状态工具 ============
const statusMap = {
  draft: { text: '未开始', type: 'info' },
  pending: { text: '待处理', type: 'warning' },
  in_progress: { text: '进行中', type: '' },
  completed: { text: '已完成', type: 'success' },
  cancelled: { text: '已取消', type: 'danger' },
}
const getStatusText = (s) => statusMap[s]?.text || s
const getStatusType = (s) => statusMap[s]?.type || 'info'

// 自定义进度条颜色
const getBarColor = (pct) => {
  if (pct >= 80) return '#67c23a'
  if (pct >= 40) return '#409eff'
  if (pct > 0) return '#e6a23c'
  return '#dcdfe6'
}

// ============ 数据请求 ============
const fetchStatistics = async () => {
  try {
    const res = await axios.get('/production/dashboard/statistics')
    const data = res.data || res
    stats.value = {
      plans: data.plans || stats.value.plans,
      tasks: data.tasks || stats.value.tasks,
      processes: data.processes || stats.value.processes,
      reports: data.reports || stats.value.reports,
      production: data.production || stats.value.production,
    }
  } catch (e) {
    console.error('获取统计数据失败:', e)
  }
}

const fetchPendingTasks = async () => {
  try {
    const res = await axios.get('/production/dashboard/pending-tasks')
    const data = res.data || res
    pendingTasks.value = (Array.isArray(data) ? data : data.list || []).map(t => ({
      ...t,
      code: t.code || t.task_code,
      productName: t.productName || t.product_name,
      startDate: t.start_date ? dayjs(t.start_date).format('YYYY-MM-DD')
               : t.startDate ? dayjs(t.startDate).format('YYYY-MM-DD')
               : '-',
    }))
  } catch (e) {
    console.error('获取待办任务失败:', e)
    pendingTasks.value = []
  }
}

const fetchProcessRates = async () => {
  try {
    const res = await axios.get('/production/dashboard/process-completion')
    const data = res.data || res
    processRates.value = (Array.isArray(data) ? data : []).map(p => ({
      name: p.name || p.process_name || '未命名',
      total: parseInt(p.total) || 0,
      completed: parseInt(p.completed) || 0,
      rate: p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0,
    }))
  } catch (e) {
    console.error('获取工序完成率失败:', e)
    processRates.value = []
  }
}

const fetchTrends = async () => {
  trendLoading.value = true
  try {
    const res = await axios.get('/production/dashboard/trends', {
      params: { granularity: trendGranularity.value },
    })
    trendData.value = res.data || res
    await nextTick()
    renderTrendChart()
  } catch (e) {
    console.error('获取趋势数据失败:', e)
  } finally {
    trendLoading.value = false
  }
}

// ============ 图表渲染 ============
const renderTrendChart = () => {
  if (!trendChartRef.value || !trendData.value) return

  if (!trendChart) {
    trendChart = echarts.init(trendChartRef.value)
  }

  const data = trendData.value
  const xLabels = data.months || data.days || []
  const planned = data.plannedData || []
  const completed = data.completedData || []

  // 短标签
  const shortLabels = xLabels.map(l => {
    if (l.length === 10) return l.slice(5) // YYYY-MM-DD → MM-DD
    if (l.length === 7) return l.slice(5) // YYYY-MM → MM
    return l
  })

  trendChart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['计划产量', '完成产量'], bottom: 0 },
    grid: { top: 20, right: 20, bottom: 40, left: 50 },
    xAxis: { type: 'category', data: shortLabels, axisLabel: { fontSize: 11 } },
    yAxis: { type: 'value', axisLabel: { fontSize: 11 } },
    series: [
      {
        name: '计划产量',
        type: 'bar',
        data: planned,
        itemStyle: { color: '#409eff', borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 28,
      },
      {
        name: '完成产量',
        type: 'bar',
        data: completed,
        itemStyle: { color: '#67c23a', borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 28,
      },
    ],
  }, true)
}

const renderPieChart = () => {
  if (!pieChartRef.value) return

  if (!pieChart) {
    pieChart = echarts.init(pieChartRef.value)
  }

  const t = stats.value.tasks
  pieChart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, itemWidth: 12, itemHeight: 12, textStyle: { fontSize: 12 } },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: true,
        label: { show: false },
        emphasis: { label: { show: true, fontWeight: 'bold' } },
        data: [
          { value: t.pending, name: '待处理', itemStyle: { color: '#e6a23c' } },
          { value: t.inProgress, name: '进行中', itemStyle: { color: '#409eff' } },
          { value: t.completed, name: '已完成', itemStyle: { color: '#67c23a' } },
        ].filter(d => d.value > 0),
      },
    ],
  }, true)
}

// ============ 刷新 ============
const refreshAll = async () => {
  loading.value = true
  try {
    await Promise.all([
      fetchStatistics(),
      fetchPendingTasks(),
      fetchProcessRates(),
      fetchTrends(),
    ])
    await nextTick()
    renderPieChart()
    ElMessage.success('数据已刷新')
  } catch {
    ElMessage.error('刷新失败')
  } finally {
    loading.value = false
  }
}

// ============ 甘特图 ============
const ganttStatusColors = {
  pending: '#909399',
  allocated: '#909399',
  preparing: '#e6a23c',
  material_issuing: '#e6a23c',
  material_partial_issued: '#e6a23c',
  material_issued: '#409eff',
  in_progress: '#409eff',
  paused: '#f56c6c',
  inspection: '#9b59b6',
  warehousing: '#9b59b6',
  completed: '#67c23a',
}

const fetchGanttData = async () => {
  ganttLoading.value = true
  try {
    const [startDate, endDate] = ganttDateRange.value || []
    const res = await axios.get('/production/scheduling/gantt', {
      params: { startDate, endDate },
    })
    const data = res.data || res
    ganttGroups.value = data.groups || []
    await nextTick()
    renderGanttChart()
  } catch (e) {
    console.error('获取甘特图数据失败:', e)
  } finally {
    ganttLoading.value = false
  }
}

const renderGanttChart = () => {
  if (!ganttChartRef.value || ganttGroups.value.length === 0) return

  // 动态高度：每个生产组 80px，最小 300px
  const dynamicHeight = Math.max(300, ganttGroups.value.length * 80 + 80)
  ganttChartRef.value.style.height = dynamicHeight + 'px'

  if (!ganttChart) {
    ganttChart = echarts.init(ganttChartRef.value)
  } else {
    ganttChart.resize()
  }

  // 生产组名称作为 Y 轴
  const categories = ganttGroups.value.map(g => g.name)

  // 构建数据：每个任务一条横条
  const seriesData = []
  const [rangeStart, rangeEnd] = ganttDateRange.value || []
  const timeMin = new Date(rangeStart + ' 00:00:00').getTime()
  const timeMax = new Date(rangeEnd + ' 23:59:59').getTime()

  ganttGroups.value.forEach((group, groupIdx) => {
    group.tasks.forEach(task => {
      const start = new Date(task.startTime).getTime()
      const end = new Date(task.endTime).getTime()
      seriesData.push({
        name: task.code,
        value: [
          groupIdx,   // Y 轴索引
          start,      // 开始时间
          end,        // 结束时间
          task,       // 原始数据
        ],
        itemStyle: {
          color: ganttStatusColors[task.status] || '#409eff',
        },
      })
    })
  })

  const option = {
    tooltip: {
      formatter: (params) => {
        const task = params.value[3]
        const start = dayjs(params.value[1]).format('MM-DD HH:mm')
        const end = dayjs(params.value[2]).format('MM-DD HH:mm')
        const duration = Math.round((params.value[2] - params.value[1]) / 60000)
        return `<b>${task.code}</b><br/>
          产品：${task.productName || '-'}<br/>
          数量：${task.quantity}<br/>
          时间：${start} ~ ${end}<br/>
          耗时：${(duration / 60).toFixed(1)}小时`
      },
    },
    grid: {
      left: 100,
      right: 30,
      top: 20,
      bottom: 40,
    },
    xAxis: {
      type: 'time',
      min: timeMin,
      max: timeMax,
      axisLabel: {
        formatter: (val) => dayjs(val).format('MM-DD'),
      },
      splitLine: { show: true, lineStyle: { type: 'dashed', color: '#e4e7ed' } },
    },
    yAxis: {
      type: 'category',
      data: categories,
      axisTick: { show: false },
      axisLabel: {
        fontSize: 12,
        fontWeight: 600,
      },
    },
    series: [{
      type: 'custom',
      renderItem: (params, api) => {
        const catIdx = api.value(0)
        const startTime = api.coord([api.value(1), catIdx])
        const endTime = api.coord([api.value(2), catIdx])
        const barHeight = api.size([0, 1])[1] * 0.5
        const x = startTime[0]
        const y = startTime[1] - barHeight / 2
        const width = Math.max(endTime[0] - startTime[0], 4)
        const task = api.value(3)
        return {
          type: 'group',
          children: [
            {
              type: 'rect',
              shape: {
                x, y, width, height: barHeight, r: 3,
              },
              style: {
                fill: api.visual('color'),
                opacity: 0.85,
              },
            },
            {
              type: 'text',
              style: {
                x: x + 4,
                y: y + barHeight / 2,
                text: width > 50 ? (typeof task === 'object' ? task.code : '') : '',
                textVerticalAlign: 'middle',
                fill: '#fff',
                fontSize: 10,
                fontWeight: 600,
              },
            },
          ],
        }
      },
      encode: {
        x: [1, 2],
        y: 0,
      },
      data: seriesData,
    }],
  }

  ganttChart.setOption(option, true)
}

// ============ 窗口自适应 ============
const handleResize = () => {
  trendChart?.resize()
  pieChart?.resize()
  ganttChart?.resize()
}

// ============ 生命周期 ============
onMounted(async () => {
  loading.value = true
  try {
    await Promise.all([
      fetchStatistics(),
      fetchPendingTasks(),
      fetchProcessRates(),
      fetchTrends(),
      fetchGanttData(),
    ])
    await nextTick()
    renderPieChart()
  } finally {
    loading.value = false
  }
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  trendChart?.dispose()
  pieChart?.dispose()
  ganttChart?.dispose()
})
</script>

<style scoped>
.production-data-view {
  padding: 16px;
}

/* 页面头部 */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.page-header h2 {
  margin: 0;
  font-size: 18px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-primary);
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* ===== 统计卡片 ===== */
.stat-cards { margin-bottom: 16px; }
.stat-card {
  background: var(--el-bg-color);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 12px;
  border: 1px solid var(--el-border-color-lighter);
  transition: box-shadow .2s;
  margin-bottom: 8px;
}
.stat-card:hover { box-shadow: var(--el-box-shadow-light); }
.stat-card__icon {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}
.theme-blue .stat-card__icon   { background: linear-gradient(135deg, #409eff, #2d7fd3); }
.theme-green .stat-card__icon  { background: linear-gradient(135deg, #67c23a, #4da62e); }
.theme-purple .stat-card__icon { background: linear-gradient(135deg, #a855f7, #7c3aed); }
.theme-orange .stat-card__icon { background: linear-gradient(135deg, #e6a23c, #d48806); }

.stat-card__content { flex: 1; min-width: 0; }
.stat-card__value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--el-text-color-primary);
}
.stat-card__label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.stat-card__footer {
  width: 100%;
  display: flex;
  gap: 12px;
  border-top: 1px solid var(--el-border-color-extra-light);
  padding-top: 8px;
  margin-top: 4px;
}
.stat-card__sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.stat-card__sub em {
  font-style: normal;
  font-weight: 600;
  margin-right: 2px;
}
.color-blue   { color: #409eff; }
.color-green  { color: #67c23a; }
.color-orange { color: #e6a23c; }
.color-purple { color: #a855f7; }
.color-gray   { color: #909399; }

/* ===== 图表卡片 ===== */
.chart-row { margin-bottom: 16px; }
.chart-card {
  background: var(--el-bg-color);
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
  overflow: hidden;
  margin-bottom: 8px;
}
.chart-card__header {
  padding: 12px 16px;
  font-weight: 600;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--el-border-color-extra-light);
  color: var(--el-text-color-primary);
}
.chart-card__body {
  height: 320px;
  padding: 8px;
}

/* ===== 列表卡片 ===== */
.list-card {
  background: var(--el-bg-color);
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
  overflow: hidden;
  margin-bottom: 8px;
}
.list-card__header {
  padding: 12px 16px;
  font-weight: 600;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--el-border-color-extra-light);
  color: var(--el-text-color-primary);
}
.list-card__header span {
  display: flex;
  align-items: center;
  gap: 6px;
}
.list-card__body {
  padding: 8px;
  min-height: 200px;
}

/* 自定义进度条 */
.custom-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.custom-progress__track {
  flex: 1;
  height: 14px;
  min-width: 80px;
  background: #e4e7ed;
  border: 1px solid #dcdfe6;
  border-radius: 7px;
  overflow: hidden;
  box-sizing: border-box;
}
.custom-progress__bar {
  height: 100%;
  border-radius: 6px;
  transition: width 0.4s ease;
}
.custom-progress__text {
  font-size: 12px;
  font-weight: 600;
  min-width: 36px;
  text-align: right;
  color: var(--el-text-color-primary);
  flex-shrink: 0;
}

/* ===== 甘特图 ===== */
.gantt-section {
  margin-top: 16px;
}
.gantt-chart-body {
  width: 100%;
  min-height: 300px;
}

/* 响应式 */
@media (max-width: 768px) {
  .page-header { flex-direction: column; align-items: flex-start; gap: 8px; }
  .stat-card__value { font-size: 18px; }
}
</style>
