<template>
  <div class="production-gantt">
    <div class="page-header">
      <div class="page-title">
        <h2>
          <el-icon><Calendar /></el-icon>
          排程甘特图
        </h2>
        <span>按生产组查看任务排程、延期和日期异常</span>
      </div>
      <div class="page-actions">
        <el-date-picker
          v-model="dateRange"
          class="range-picker"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          :shortcuts="dateShortcuts"
          :clearable="false"
          @change="fetchGanttData"
        />
        <el-button :icon="Refresh" :loading="loading" @click="fetchGanttData">刷新</el-button>
        <el-button type="primary" @click="goToTask">任务排程</el-button>
      </div>
    </div>

    <div class="gantt-summary" v-if="hasData || meta.generatedAt">
      <div class="summary-item">
        <strong>{{ groupCount }}</strong>
        <span>生产组</span>
      </div>
      <div class="summary-item">
        <strong>{{ totalTasks }}</strong>
        <span>任务</span>
      </div>
      <div class="summary-item">
        <strong>{{ activeTasks }}</strong>
        <span>在制</span>
      </div>
      <div class="summary-item danger">
        <strong>{{ overdueTasks }}</strong>
        <span>逾期</span>
      </div>
      <div class="summary-item warning">
        <strong>{{ dateIssueTasks }}</strong>
        <span>日期异常</span>
      </div>
      <div class="summary-source">
        来源：{{ meta.source?.primary || 'production_tasks' }}
      </div>
    </div>

    <div class="gantt-shell" v-loading="loading">
      <el-alert
        v-if="errorMessage"
        class="gantt-alert"
        type="error"
        :title="errorMessage"
        show-icon
        :closable="false"
      />

      <div v-if="!hasData && !loading" class="gantt-empty">
        <el-empty description="所选时间范围内没有排程任务">
          <el-button type="primary" @click="goToTask">前往生产任务排程</el-button>
        </el-empty>
      </div>

      <div v-else class="gantt-chart" :style="{ minWidth: chartMinWidth + 'px' }" ref="ganttChartRef">
        <div class="gantt-timeline">
          <div class="gantt-group-header">生产组</div>
          <div class="gantt-days">
            <div
              v-for="day in dateColumns"
              :key="day.key"
              class="gantt-day"
              :class="{ weekend: day.isWeekend, today: day.isToday }"
              :style="{ minWidth: dayColumnWidth + 'px', width: dayColumnWidth + 'px' }"
            >
              <span>{{ day.weekday }}</span>
              <strong>{{ day.label }}</strong>
            </div>
          </div>
        </div>

        <div
          v-for="group in ganttRows"
          :key="group.name"
          class="gantt-group"
          :style="{ height: group.rowHeight + 'px' }"
        >
          <div class="gantt-group-label">
            <el-icon><UserFilled /></el-icon>
            <span>{{ group.name }}</span>
            <em>{{ group.tasks.length }}</em>
          </div>

          <div class="gantt-group-body">
            <div class="gantt-grid">
              <div
                v-for="day in dateColumns"
                :key="day.key"
                class="gantt-grid-col"
                :class="{ weekend: day.isWeekend, today: day.isToday }"
                :style="{ minWidth: dayColumnWidth + 'px', width: dayColumnWidth + 'px', flex: 'none' }"
              />
            </div>

            <button
              v-for="task in group.tasks"
              :key="task.id"
              class="gantt-bar"
              :class="[getStatusClass(task.status), { overdue: task.isOverdue, issue: task.dateIssue }]"
              :style="getBarStyle(task)"
              type="button"
              @mouseenter="showTooltip(task, $event)"
              @mousemove="moveTooltip($event)"
              @mouseleave="hideTooltip"
            >
              <el-icon v-if="task.dateIssue || task.isOverdue"><WarningFilled /></el-icon>
              <span>{{ task.code }} · {{ task.productName }}</span>
            </button>
          </div>
        </div>
      </div>

      <div class="zoom-control" v-if="hasData">
        <el-icon><ZoomIn /></el-icon>
        <el-slider
          v-model="dayColumnWidth"
          :min="30"
          :max="160"
          :step="5"
          :show-tooltip="false"
          style="width: 120px;"
        />
        <span class="zoom-label">{{ dayColumnWidth }}px</span>
      </div>
    </div>

    <div class="gantt-legend" v-if="hasData">
      <span v-for="status in legendStatuses" :key="status.value">
        <i :class="getStatusClass(status.value)" />
        {{ status.label }}
      </span>
      <span><i class="legend-overdue" /> 逾期</span>
      <span><i class="legend-issue" /> 日期异常</span>
    </div>

    <Teleport to="body">
      <div
        v-if="tooltip.visible"
        class="gantt-tooltip"
        :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
      >
        <div class="tooltip-title">{{ tooltip.task?.code }}</div>
        <div>{{ tooltip.task?.productName || '-' }}</div>
        <div>数量：{{ formatQuantity(tooltip.task) }}</div>
        <div>状态：{{ getStatusText(tooltip.task?.status) }}</div>
        <div>开始：{{ formatDateTime(tooltip.task?.startTime) }}</div>
        <div>结束：{{ formatDateTime(tooltip.task?.endTime) }}</div>
        <div v-if="tooltip.task?.planCode">计划：{{ tooltip.task.planCode }}</div>
        <div v-if="tooltip.task?.deliveryDate">交期：{{ tooltip.task.deliveryDate }}</div>
        <div v-if="tooltip.task?.isOverdue" class="tooltip-danger">已逾期</div>
        <div v-if="tooltip.task?.dateIssue" class="tooltip-warning">计划结束早于开始</div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Calendar, Refresh, UserFilled, WarningFilled, ZoomIn } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { productionApi } from '@/api/production'

const router = useRouter()
const loading = ref(false)
const errorMessage = ref('')

const dateRange = ref([
  dayjs().subtract(7, 'day').format('YYYY-MM-DD'),
  dayjs().add(30, 'day').format('YYYY-MM-DD')
])

const dateShortcuts = [
  { text: '近 7 天', value: () => [dayjs().subtract(7, 'day').toDate(), dayjs().toDate()] },
  { text: '本月', value: () => [dayjs().startOf('month').toDate(), dayjs().endOf('month').toDate()] },
  { text: '未来 30 天', value: () => [dayjs().toDate(), dayjs().add(30, 'day').toDate()] },
  { text: '前后 30 天', value: () => [dayjs().subtract(30, 'day').toDate(), dayjs().add(30, 'day').toDate()] }
]

const ganttData = ref({
  groups: [],
  dateRange: { start: '', end: '' },
  meta: {}
})

const statusMap = {
  pending: { text: '待处理', className: 'status-pending' },
  allocated: { text: '已分配', className: 'status-allocated' },
  preparing: { text: '配料中', className: 'status-preparing' },
  material_issuing: { text: '发料中', className: 'status-material_issuing' },
  material_partial_issued: { text: '部分发料', className: 'status-material_partial_issued' },
  material_issued: { text: '已发料', className: 'status-material_issued' },
  in_progress: { text: '生产中', className: 'status-in_progress' },
  paused: { text: '暂停', className: 'status-paused' },
  inspection: { text: '待检验', className: 'status-inspection' },
  warehousing: { text: '入库中', className: 'status-warehousing' },
  completed: { text: '已完成', className: 'status-completed' }
}

const legendStatuses = [
  { value: 'pending', label: '待处理' },
  { value: 'allocated', label: '已分配' },
  { value: 'material_issued', label: '已发料' },
  { value: 'in_progress', label: '生产中' },
  { value: 'inspection', label: '待检验' },
  { value: 'completed', label: '已完成' }
]

const meta = computed(() => ganttData.value.meta || {})
const hasData = computed(() => ganttData.value.groups.some((group) => group.tasks.length > 0))
const groupCount = computed(() => ganttData.value.groups.length)
const totalTasks = computed(() => meta.value.totalTasks ?? sumTasks())
const activeTasks = computed(() => meta.value.activeTasks ?? countTasks((task) => isActiveStatus(task.status)))
const overdueTasks = computed(() => meta.value.overdueTasks ?? countTasks((task) => task.isOverdue))
const dateIssueTasks = computed(() => meta.value.dateIssueTasks ?? countTasks((task) => task.dateIssue))

const dayColumnWidth = ref(42)
const chartMinWidth = computed(() => Math.max(920, dateColumns.value.length * dayColumnWidth.value + 160))

const dateColumns = computed(() => {
  const [startValue, endValue] = dateRange.value || []
  if (!startValue || !endValue) return []

  const start = dayjs(startValue)
  const end = dayjs(endValue)
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  const days = []
  let cursor = start

  while (cursor.isBefore(end) || cursor.isSame(end, 'day')) {
    const dayOfWeek = cursor.day()
    days.push({
      key: cursor.format('YYYY-MM-DD'),
      label: cursor.format('MM/DD'),
      weekday: weekdays[dayOfWeek],
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      isToday: cursor.isSame(dayjs(), 'day')
    })
    cursor = cursor.add(1, 'day')
  }

  return days
})

const ganttRows = computed(() => {
  return ganttData.value.groups.map((group) => {
    const tasks = assignLanes(group.tasks)
    const laneCount = Math.max(1, ...tasks.map((task) => task.lane + 1))
    return {
      ...group,
      tasks,
      rowHeight: laneCount * 34 + 16
    }
  })
})

const tooltip = ref({ visible: false, x: 0, y: 0, task: null })

function sumTasks() {
  return ganttData.value.groups.reduce((sum, group) => sum + group.tasks.length, 0)
}

function countTasks(predicate) {
  return ganttData.value.groups.reduce(
    (sum, group) => sum + group.tasks.filter(predicate).length,
    0
  )
}

function isActiveStatus(status) {
  return [
    'preparing',
    'material_issuing',
    'material_partial_issued',
    'material_issued',
    'in_progress',
    'inspection',
    'warehousing'
  ].includes(status)
}

function assignLanes(tasks) {
  const lanes = []
  return [...tasks]
    .sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf())
    .map((task) => {
      const start = dayjs(task.startTime).valueOf()
      const end = Math.max(dayjs(task.endTime).valueOf(), start)
      let lane = lanes.findIndex((laneEnd) => start >= laneEnd)

      if (lane === -1) {
        lane = lanes.length
        lanes.push(end)
      } else {
        lanes[lane] = end
      }

      return { ...task, lane }
    })
}

async function fetchGanttData() {
  const [startDate, endDate] = dateRange.value || []
  if (!startDate || !endDate) return

  loading.value = true
  errorMessage.value = ''

  try {
    const response = await productionApi.getSchedulingGanttData({ startDate, endDate })
    const data = response.data || response
    ganttData.value = {
      groups: Array.isArray(data.groups) ? data.groups : [],
      dateRange: data.dateRange || { start: startDate, end: endDate },
      meta: data.meta || {}
    }
  } catch (error) {
    console.error('获取排程甘特图数据失败', error)
    errorMessage.value = error.response?.data?.message || error.message || '获取排程数据失败'
    ElMessage.error(errorMessage.value)
    ganttData.value = { groups: [], dateRange: { start: startDate, end: endDate }, meta: {} }
  } finally {
    loading.value = false
  }
}

function getBarStyle(task) {
  const [startValue, endValue] = dateRange.value || []
  if (!startValue || !endValue || !task.startTime || !task.endTime) return { display: 'none' }

  const rangeStart = dayjs(startValue).startOf('day')
  const rangeEnd = dayjs(endValue).endOf('day')
  const totalMs = rangeEnd.diff(rangeStart)
  const taskStart = dayjs(task.startTime)
  const taskEnd = dayjs(task.endTime)

  if (!taskStart.isValid() || !taskEnd.isValid() || totalMs <= 0) {
    return { display: 'none' }
  }

  const visibleStart = taskStart.isBefore(rangeStart) ? rangeStart : taskStart
  const visibleEnd = taskEnd.isAfter(rangeEnd) ? rangeEnd : taskEnd
  const leftPct = ((visibleStart.diff(rangeStart) / totalMs) * 100).toFixed(4)
  const widthPct = Math.max((visibleEnd.diff(visibleStart) / totalMs) * 100, 0.7).toFixed(4)

  return {
    left: `${leftPct}%`,
    width: `${widthPct}%`,
    top: `${task.lane * 34 + 8}px`
  }
}

function getStatusClass(status) {
  return statusMap[status]?.className || 'status-pending'
}

function getStatusText(status) {
  return statusMap[status]?.text || status || '-'
}

function showTooltip(task, event) {
  tooltip.value = { visible: true, task, ...tooltipPosition(event) }
}

function moveTooltip(event) {
  if (!tooltip.value.visible) return
  Object.assign(tooltip.value, tooltipPosition(event))
}

function hideTooltip() {
  tooltip.value.visible = false
}

function tooltipPosition(event) {
  const width = 320
  const height = 220
  const x = Math.min(event.clientX + 14, window.innerWidth - width - 12)
  const y = Math.min(event.clientY + 14, window.innerHeight - height - 12)
  return {
    x: Math.max(12, x),
    y: Math.max(12, y)
  }
}

function formatDateTime(value) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-'
}

function formatQuantity(task) {
  if (!task) return '-'
  return `${task.quantity ?? 0}${task.unitName ? ` ${task.unitName}` : ''}`
}

function goToTask() {
  router.push('/production/task')
}

onMounted(fetchGanttData)
</script>

<style scoped>
.production-gantt {
  min-height: calc(100vh - 60px);
  padding: 16px;
  background: var(--el-fill-color-lighter);
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.page-title h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 4px;
  font-size: 20px;
  color: var(--el-text-color-primary);
}

.page-title span {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.page-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

.range-picker {
  width: 300px;
  max-width: 100%;
}

.zoom-control {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  color: var(--el-text-color-regular);
  position: sticky;
  bottom: 0;
  left: 0;
  background: var(--el-bg-color);
  border-top: 1px solid var(--el-border-color-lighter);
  z-index: 9;
}

.zoom-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  min-width: 36px;
}

.gantt-summary {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 10px 14px;
  margin-bottom: 12px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
}

.summary-item {
  display: flex;
  align-items: baseline;
  gap: 5px;
  min-width: 68px;
}

.summary-item strong {
  color: var(--el-text-color-primary);
  font-size: 20px;
}

.summary-item span,
.summary-source {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.summary-item.danger strong {
  color: var(--el-color-danger);
}

.summary-item.warning strong {
  color: var(--el-color-warning);
}

.summary-source {
  margin-left: auto;
}

.gantt-shell {
  min-height: 360px;
  overflow-x: auto;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
}

.gantt-alert {
  margin: 12px;
  width: auto;
}

.gantt-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 360px;
}

.gantt-chart {
  position: relative;
}

.gantt-timeline,
.gantt-group {
  display: flex;
}

.gantt-timeline {
  position: sticky;
  top: 0;
  z-index: 8;
  border-bottom: 1px solid var(--el-border-color);
  background: var(--el-fill-color-light);
}

.gantt-group-header,
.gantt-group-label {
  width: 150px;
  min-width: 150px;
  border-right: 1px solid var(--el-border-color-lighter);
}

.gantt-group-header {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.gantt-days {
  display: flex;
  flex: 1;
}

.gantt-day {
  flex: none;
  padding: 6px 2px;
  text-align: center;
  border-right: 1px solid var(--el-border-color-extra-light);
  color: var(--el-text-color-secondary);
}

.gantt-day span,
.gantt-day strong {
  display: block;
  font-size: 11px;
  line-height: 1.35;
}

.gantt-day.today {
  background: #e8f4ff;
  color: #1d6fb8;
}

.gantt-day.weekend {
  background: #fff7ed;
  color: #b45309;
}

.gantt-group {
  border-bottom: 1px solid var(--el-border-color-extra-light);
}

.gantt-group-label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  color: var(--el-text-color-primary);
  background: var(--el-fill-color-blank);
}

.gantt-group-label span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
}

.gantt-group-label em {
  margin-left: auto;
  padding: 1px 6px;
  border: 1px solid var(--el-border-color);
  border-radius: 999px;
  color: var(--el-text-color-secondary);
  font-size: 11px;
  font-style: normal;
}

.gantt-group-body {
  position: relative;
  flex: 1;
  min-width: 0;
}

.gantt-grid {
  position: absolute;
  inset: 0;
  display: flex;
}

.gantt-grid-col {
  flex: none;
  border-right: 1px solid var(--el-border-color-extra-light);
}

.gantt-grid-col.today {
  background: rgba(64, 158, 255, 0.08);
}

.gantt-grid-col.weekend {
  background: rgba(230, 162, 60, 0.06);
}

.gantt-bar {
  position: absolute;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  min-width: 16px;
  padding: 0 8px;
  overflow: hidden;
  border: 0;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
}

.gantt-bar span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 600;
}

.gantt-bar:hover {
  z-index: 5;
  filter: brightness(1.04);
}

.gantt-bar.overdue {
  outline: 2px solid rgba(245, 108, 108, 0.55);
  outline-offset: 1px;
}

.gantt-bar.issue {
  background-image: repeating-linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.2) 0,
    rgba(255, 255, 255, 0.2) 6px,
    rgba(0, 0, 0, 0.08) 6px,
    rgba(0, 0, 0, 0.08) 12px
  );
}

.status-pending { background: #737373; }
.status-allocated { background: #2563eb; }
.status-preparing { background: #b45309; }
.status-material_issuing { background: #d97706; }
.status-material_partial_issued { background: #0f766e; }
.status-material_issued { background: #0284c7; }
.status-in_progress { background: #16a34a; }
.status-paused { background: #dc2626; }
.status-inspection { background: #7c3aed; }
.status-warehousing { background: #c2410c; }
.status-completed { background: #15803d; }

.gantt-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  padding: 10px 2px 0;
  color: var(--el-text-color-regular);
  font-size: 12px;
}

.gantt-legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.gantt-legend i {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.legend-overdue {
  background: var(--el-color-danger);
}

.legend-issue {
  background: repeating-linear-gradient(
    135deg,
    #f59e0b 0,
    #f59e0b 5px,
    #92400e 5px,
    #92400e 10px
  );
}

.gantt-tooltip {
  position: fixed;
  z-index: 9999;
  width: 300px;
  padding: 10px 12px;
  color: #f8fafc;
  background: rgba(17, 24, 39, 0.94);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  pointer-events: none;
  font-size: 12px;
  line-height: 1.7;
}

.tooltip-title {
  margin-bottom: 4px;
  color: #93c5fd;
  font-weight: 700;
}

.tooltip-danger {
  color: #fca5a5;
}

.tooltip-warning {
  color: #fcd34d;
}

@media (max-width: 768px) {
  .production-gantt {
    padding: 12px;
  }

  .page-header,
  .gantt-summary {
    align-items: stretch;
    flex-direction: column;
  }

  .page-actions {
    justify-content: flex-start;
  }

  .range-picker {
    width: 100%;
  }

  .summary-source {
    margin-left: 0;
  }
}
</style>
