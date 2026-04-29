<!--
/**
 * ProductionGantt.vue
 * @description 生产排程甘特图 — 可视化各组任务的时间分布
 * @date 2026-04-28
 * @version 1.0.0
 */
-->
<template>
  <div class="production-gantt">
    <!-- 页面标题 -->
    <div class="page-header">
      <div class="page-header__left">
        <h2>
          <el-icon><Calendar /></el-icon>
          排程甘特图
        </h2>
        <span class="page-header__desc">按生产组展示任务时间分布，直观掌握产能负载</span>
      </div>
      <div class="page-header__right">
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          :shortcuts="dateShortcuts"
          style="width: 300px"
          @change="fetchGanttData"
        />
        <el-button :icon="Refresh" @click="fetchGanttData" :loading="loading">刷新</el-button>
      </div>
    </div>

    <!-- 统计信息 -->
    <div class="gantt-stats" v-if="ganttData.groups.length > 0">
      <div class="gantt-stat-item">
        <span class="gantt-stat-value">{{ ganttData.groups.length }}</span>
        <span class="gantt-stat-label">生产组</span>
      </div>
      <div class="gantt-stat-item">
        <span class="gantt-stat-value">{{ totalTasks }}</span>
        <span class="gantt-stat-label">任务数</span>
      </div>
      <div class="gantt-stat-item">
        <span class="gantt-stat-value accent">{{ activeTasks }}</span>
        <span class="gantt-stat-label">进行中</span>
      </div>
    </div>

    <!-- 甘特图主体 -->
    <div class="gantt-container" v-loading="loading">
      <div v-if="ganttData.groups.length === 0 && !loading" class="gantt-empty">
        <el-empty description="所选时间范围内没有排程数据">
          <el-button type="primary" @click="goToTask">前往生产任务排程</el-button>
        </el-empty>
      </div>

      <div v-else class="gantt-chart">
        <!-- 时间刻度头 -->
        <div class="gantt-timeline">
          <div class="gantt-group-label-header">生产组</div>
          <div class="gantt-dates">
            <div
              v-for="day in dateColumns"
              :key="day.key"
              class="gantt-date-col"
              :class="{ weekend: day.isWeekend, today: day.isToday }"
            >
              <div class="gantt-date-weekday">{{ day.weekday }}</div>
              <div class="gantt-date-day">{{ day.label }}</div>
            </div>
          </div>
        </div>

        <!-- 各组行 -->
        <div v-for="group in ganttData.groups" :key="group.name" class="gantt-group">
          <div class="gantt-group-label">
            <el-icon><UserFilled /></el-icon>
            <span>{{ group.name }}</span>
            <el-badge :value="group.tasks.length" type="info" />
          </div>
          <div class="gantt-group-bars">
            <!-- 网格线 -->
            <div class="gantt-grid">
              <div
                v-for="day in dateColumns"
                :key="day.key"
                class="gantt-grid-col"
                :class="{ weekend: day.isWeekend, today: day.isToday }"
              />
            </div>
            <!-- 任务条 -->
            <div
              v-for="task in group.tasks"
              :key="task.id"
              class="gantt-bar"
              :class="getStatusClass(task.status)"
              :style="getBarStyle(task)"
              @mouseenter="showTooltip(task, $event)"
              @mouseleave="hideTooltip"
            >
              <span class="gantt-bar-text">{{ task.code }} · {{ task.productName }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 图例 -->
    <div class="gantt-legend" v-if="ganttData.groups.length > 0">
      <div class="gantt-legend-item">
        <span class="legend-dot status-preparing"></span>配料中
      </div>
      <div class="gantt-legend-item">
        <span class="legend-dot status-material_issued"></span>已发料
      </div>
      <div class="gantt-legend-item">
        <span class="legend-dot status-in_progress"></span>生产中
      </div>
      <div class="gantt-legend-item">
        <span class="legend-dot status-inspection"></span>待检验
      </div>
      <div class="gantt-legend-item">
        <span class="legend-dot status-completed"></span>已完成
      </div>
      <div class="gantt-legend-item">
        <span class="legend-dot status-pending"></span>待处理
      </div>
    </div>

    <!-- 悬浮提示 -->
    <Teleport to="body">
      <div
        v-if="tooltip.visible"
        class="gantt-tooltip"
        :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
      >
        <div class="gantt-tooltip-title">{{ tooltip.task?.code }}</div>
        <div class="gantt-tooltip-row">产品：{{ tooltip.task?.productName }}</div>
        <div class="gantt-tooltip-row">数量：{{ tooltip.task?.quantity }}</div>
        <div class="gantt-tooltip-row">状态：{{ getStatusText(tooltip.task?.status) }}</div>
        <div class="gantt-tooltip-row">开始：{{ formatDateTime(tooltip.task?.startTime) }}</div>
        <div class="gantt-tooltip-row">结束：{{ formatDateTime(tooltip.task?.endTime) }}</div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Calendar, Refresh, UserFilled } from '@element-plus/icons-vue'
import axios from '@/services/api'
import dayjs from 'dayjs'

const router = useRouter()
const loading = ref(false)

// 日期范围（默认近30天）
const dateRange = ref([
  dayjs().subtract(7, 'day').format('YYYY-MM-DD'),
  dayjs().add(30, 'day').format('YYYY-MM-DD')
])

const dateShortcuts = [
  { text: '近7天', value: () => [dayjs().subtract(7, 'day').toDate(), dayjs().toDate()] },
  { text: '本月', value: () => [dayjs().startOf('month').toDate(), dayjs().endOf('month').toDate()] },
  { text: '未来30天', value: () => [dayjs().toDate(), dayjs().add(30, 'day').toDate()] },
  { text: '近60天', value: () => [dayjs().subtract(30, 'day').toDate(), dayjs().add(30, 'day').toDate()] },
]

// 甘特图数据
const ganttData = ref({ groups: [], dateRange: { start: '', end: '' } })

// 统计
const totalTasks = computed(() => ganttData.value.groups.reduce((sum, g) => sum + g.tasks.length, 0))
const activeTasks = computed(() => ganttData.value.groups.reduce((sum, g) => sum + g.tasks.filter(t => t.status === 'in_progress').length, 0))

// 日期列（天粒度）
const dateColumns = computed(() => {
  if (!dateRange.value || dateRange.value.length < 2) return []
  const start = dayjs(dateRange.value[0])
  const end = dayjs(dateRange.value[1])
  const days = []
  const weekdayNames = ['日', '一', '二', '三', '四', '五', '六']
  let cursor = start
  while (cursor.isBefore(end) || cursor.isSame(end, 'day')) {
    const dow = cursor.day()
    days.push({
      key: cursor.format('YYYY-MM-DD'),
      label: cursor.format('MM/DD'),
      weekday: weekdayNames[dow],
      isWeekend: dow === 0 || dow === 6,
      isToday: cursor.isSame(dayjs(), 'day'),
    })
    cursor = cursor.add(1, 'day')
  }
  return days
})

// 悬浮提示
const tooltip = ref({ visible: false, x: 0, y: 0, task: null })

function showTooltip(task, event) {
  tooltip.value = {
    visible: true,
    x: event.clientX + 12,
    y: event.clientY + 12,
    task,
  }
}

function hideTooltip() {
  tooltip.value.visible = false
}

// 获取甘特图数据
async function fetchGanttData() {
  if (!dateRange.value || dateRange.value.length < 2) return
  loading.value = true
  try {
    const res = await axios.get('/production/scheduling/gantt', {
      params: {
        startDate: dateRange.value[0],
        endDate: dateRange.value[1],
      },
    })
    if (res.data?.groups) {
      ganttData.value = res.data
    }
  } catch (error) {
    console.error('获取甘特图数据失败:', error)
    ElMessage.error('获取排程数据失败')
  } finally {
    loading.value = false
  }
}

// 计算任务条的位置和宽度
function getBarStyle(task) {
  if (!dateRange.value || dateRange.value.length < 2) return {}
  const rangeStart = dayjs(dateRange.value[0]).startOf('day')
  const rangeEnd = dayjs(dateRange.value[1]).endOf('day')
  const totalDays = rangeEnd.diff(rangeStart, 'day') + 1

  const taskStart = dayjs(task.startTime)
  const taskEnd = dayjs(task.endTime)

  // 限制在可视范围内
  const visibleStart = taskStart.isBefore(rangeStart) ? rangeStart : taskStart
  const visibleEnd = taskEnd.isAfter(rangeEnd) ? rangeEnd : taskEnd

  const leftDays = visibleStart.diff(rangeStart, 'day', true)
  const widthDays = Math.max(visibleEnd.diff(visibleStart, 'day', true), 0.3)

  const leftPct = (leftDays / totalDays) * 100
  const widthPct = (widthDays / totalDays) * 100

  return {
    left: `${leftPct}%`,
    width: `${Math.max(widthPct, 1)}%`,
  }
}

// 状态样式
function getStatusClass(status) {
  return `status-${status || 'pending'}`
}

function getStatusText(status) {
  const map = {
    pending: '待处理', allocated: '分配中', preparing: '配料中',
    material_issuing: '发料中', material_issued: '已发料',
    in_progress: '生产中', inspection: '待检验',
    warehousing: '入库中', completed: '已完成',
  }
  return map[status] || status
}

function formatDateTime(dt) {
  if (!dt) return '—'
  return dayjs(dt).format('YYYY-MM-DD HH:mm')
}

function goToTask() {
  router.push('/production/task')
}

onMounted(() => {
  fetchGanttData()
})
</script>

<style scoped>
.production-gantt {
  padding: 20px;
  background: #f5f7fa;
  min-height: calc(100vh - 60px);
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}

.page-header__left h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 4px;
  font-size: 20px;
  color: #1a1a1a;
}

.page-header__desc {
  font-size: 13px;
  color: #909399;
}

.page-header__right {
  display: flex;
  gap: 10px;
  align-items: center;
}

/* 统计条 */
.gantt-stats {
  display: flex;
  gap: 24px;
  padding: 14px 20px;
  background: #fff;
  border-radius: 10px;
  margin-bottom: 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,.05);
}

.gantt-stat-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.gantt-stat-value {
  font-size: 22px;
  font-weight: 700;
  color: #303133;
}

.gantt-stat-value.accent { color: #00b894; }
.gantt-stat-label { font-size: 13px; color: #909399; }

/* 甘特图容器 */
.gantt-container {
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0,0,0,.05);
  overflow-x: auto;
  min-height: 300px;
}

.gantt-chart {
  min-width: 900px;
}

/* 时间刻度头 */
.gantt-timeline {
  display: flex;
  border-bottom: 2px solid #e4e7ed;
  position: sticky;
  top: 0;
  z-index: 10;
  background: #fafbfc;
}

.gantt-group-label-header {
  width: 140px;
  min-width: 140px;
  padding: 10px 16px;
  font-weight: 600;
  color: #606266;
  font-size: 13px;
  border-right: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
}

.gantt-dates {
  display: flex;
  flex: 1;
}

.gantt-date-col {
  flex: 1;
  min-width: 36px;
  text-align: center;
  padding: 6px 2px;
  font-size: 11px;
  color: #909399;
  border-right: 1px solid #f0f2f5;
}

.gantt-date-col.weekend {
  background: #fef6f6;
  color: #f56c6c;
}

.gantt-date-col.today {
  background: #e8f5e9;
  color: #00b894;
  font-weight: 700;
}

.gantt-date-weekday { font-size: 10px; }
.gantt-date-day { font-size: 11px; font-weight: 600; margin-top: 2px; }

/* 组行 */
.gantt-group {
  display: flex;
  border-bottom: 1px solid #f0f2f5;
  min-height: 48px;
}

.gantt-group:hover {
  background: #fafbfc;
}

.gantt-group-label {
  width: 140px;
  min-width: 140px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  border-right: 1px solid #e4e7ed;
  background: #fafbfc;
}

.gantt-group-bars {
  flex: 1;
  position: relative;
  padding: 6px 0;
}

/* 网格 */
.gantt-grid {
  display: flex;
  position: absolute;
  inset: 0;
}

.gantt-grid-col {
  flex: 1;
  border-right: 1px solid #f5f7fa;
}

.gantt-grid-col.weekend { background: rgba(245, 108, 108, 0.03); }
.gantt-grid-col.today { background: rgba(0, 184, 148, 0.06); }

/* 任务条 */
.gantt-bar {
  position: relative;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  padding: 0 8px;
  margin: 2px 0;
  cursor: pointer;
  transition: all .2s;
  z-index: 2;
  box-shadow: 0 1px 3px rgba(0,0,0,.1);
}

.gantt-bar:hover {
  transform: scaleY(1.15);
  box-shadow: 0 3px 8px rgba(0,0,0,.15);
  z-index: 5;
}

.gantt-bar-text {
  font-size: 11px;
  font-weight: 500;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 状态颜色 */
.status-pending { background: linear-gradient(135deg, #b2bec3, #95a5a6); }
.status-allocated { background: linear-gradient(135deg, #74b9ff, #0984e3); }
.status-preparing { background: linear-gradient(135deg, #fdcb6e, #f39c12); }
.status-material_issuing { background: linear-gradient(135deg, #ffeaa7, #fdcb6e); }
.status-material_issued { background: linear-gradient(135deg, #55efc4, #00b894); }
.status-material_partial_issued { background: linear-gradient(135deg, #81ecec, #00cec9); }
.status-in_progress { background: linear-gradient(135deg, #a29bfe, #6c5ce7); }
.status-inspection { background: linear-gradient(135deg, #fd79a8, #e84393); }
.status-warehousing { background: linear-gradient(135deg, #fab1a0, #e17055); }
.status-completed { background: linear-gradient(135deg, #00b894, #00816a); }

/* 图例 */
.gantt-legend {
  display: flex;
  gap: 20px;
  padding: 12px 20px;
  margin-top: 12px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0,0,0,.05);
}

.gantt-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #606266;
}

.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  display: inline-block;
}

.legend-dot.status-preparing { background: #f39c12; }
.legend-dot.status-material_issued { background: #00b894; }
.legend-dot.status-in_progress { background: #6c5ce7; }
.legend-dot.status-inspection { background: #e84393; }
.legend-dot.status-completed { background: #00816a; }
.legend-dot.status-pending { background: #95a5a6; }

/* 悬浮提示 */
.gantt-tooltip {
  position: fixed;
  z-index: 9999;
  background: rgba(30, 30, 30, 0.92);
  color: #fff;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 12px;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0,0,0,.3);
  backdrop-filter: blur(8px);
  max-width: 280px;
}

.gantt-tooltip-title {
  font-weight: 700;
  font-size: 13px;
  margin-bottom: 6px;
  color: #55efc4;
}

.gantt-tooltip-row {
  padding: 2px 0;
  opacity: .9;
}

.gantt-empty {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
}
</style>
