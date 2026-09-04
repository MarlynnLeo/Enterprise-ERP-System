<template>
  <div class="module-page production-gantt-container">
    <PageHeader title="排程甘特图" subtitle="按生产组查看任务排程、延期和日期异常">
      <template #actions>
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
      </template>
    </PageHeader>

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
        <EmptyState description="所选时间范围内没有排程任务">
          <el-button type="primary" @click="goToTask">前往生产任务排程</el-button>
        </EmptyState>
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
          class="form-control-sm"
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
import { ElMessage } from 'element-plus/es/components/message/index'
import { Refresh, UserFilled, WarningFilled, ZoomIn } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { productionApi } from '@/api/production'
import { getProductionStatusText } from '@/constants/systemConstants'

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
  pending: { text: getProductionStatusText('pending'), className: 'status-pending' },
  allocated: { text: getProductionStatusText('allocated'), className: 'status-allocated' },
  preparing: { text: getProductionStatusText('preparing'), className: 'status-preparing' },
  material_issuing: { text: getProductionStatusText('material_issuing'), className: 'status-material_issuing' },
  material_partial_issued: { text: getProductionStatusText('material_partial_issued'), className: 'status-material_partial_issued' },
  material_issued: { text: getProductionStatusText('material_issued'), className: 'status-material_issued' },
  in_progress: { text: getProductionStatusText('in_progress'), className: 'status-in_progress' },
  paused: { text: getProductionStatusText('paused'), className: 'status-paused' },
  inspection: { text: getProductionStatusText('inspection'), className: 'status-inspection' },
  warehousing: { text: getProductionStatusText('warehousing'), className: 'status-warehousing' },
  completed: { text: getProductionStatusText('completed'), className: 'status-completed' }
}

const legendStatuses = [
  { value: 'pending', label: getProductionStatusText('pending') },
  { value: 'allocated', label: getProductionStatusText('allocated') },
  { value: 'material_issued', label: getProductionStatusText('material_issued') },
  { value: 'in_progress', label: getProductionStatusText('in_progress') },
  { value: 'inspection', label: getProductionStatusText('inspection') },
  { value: 'completed', label: getProductionStatusText('completed') }
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
.production-gantt-container {
  --gantt-surface: var(--color-bg-base);
  --gantt-surface-muted: var(--color-bg-section);
  --gantt-surface-soft: var(--color-bg-hover);
  --gantt-border: var(--color-border-lighter);
  --gantt-border-strong: var(--color-border-base);
  --gantt-grid-line: color-mix(in srgb, var(--color-border-base) 72%, transparent);
  --gantt-today-bg: color-mix(in srgb, var(--color-primary) 12%, var(--color-bg-section));
  --gantt-weekend-bg: color-mix(in srgb, var(--color-warning) 10%, var(--color-bg-section));
  --gantt-task-pending: var(--color-info);
  --gantt-task-allocated: var(--color-primary);
  --gantt-task-preparing: var(--color-warning);
  --gantt-task-material-issuing: var(--color-warning-dark, var(--color-warning));
  --gantt-task-material-partial: color-mix(in srgb, var(--color-primary) 55%, var(--color-success));
  --gantt-task-material-issued: var(--color-primary-dark-2, var(--color-primary));
  --gantt-task-in-progress: var(--color-success);
  --gantt-task-paused: var(--color-danger);
  --gantt-task-inspection: color-mix(in srgb, var(--color-primary) 70%, var(--color-info));
  --gantt-task-warehousing: var(--color-warning);
  --gantt-task-completed: var(--color-success-dark, var(--color-success));
  --gantt-bar-color: var(--color-on-primary);
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-lg);
  padding: var(--spacing-lg);
}

.page-title,
.page-actions {
  position: relative;
  z-index: 1;
}

.page-title h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 4px;
  font-size: 1.5rem;
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
}

.page-title span {
  display: block;
  padding-left: 12px;
  color: var(--color-text-secondary);
  font-size: 0.875rem;
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
  color: var(--color-text-regular);
  position: sticky;
  bottom: 0;
  left: 0;
  background: color-mix(in srgb, var(--gantt-surface) 92%, transparent);
  border-top: 1px solid var(--gantt-border);
  z-index: 9;
}

.zoom-label {
  font-size: 12px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  min-width: 36px;
}

.gantt-summary {
  display: flex;
  align-items: stretch;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
  padding: 0;
  background: transparent;
  border: 0;
  flex-wrap: wrap;
}

.summary-item {
  display: flex;
  flex: 1 1 128px;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  min-width: 128px;
  padding: var(--spacing-md);
  background: var(--gantt-surface);
  border: 1px solid var(--gantt-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  position: relative;
}

.summary-item::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--color-primary);
}

.summary-item strong {
  color: var(--color-primary);
  font-size: 1.8rem;
  line-height: 1.2;
}

.summary-item span,
.summary-source {
  color: var(--color-text-secondary);
  font-size: 0.85rem;
}

.summary-item.danger strong {
  color: var(--color-danger);
}

.summary-item.danger::before {
  background: var(--color-danger);
}

.summary-item.warning strong {
  color: var(--color-warning);
}

.summary-item.warning::before {
  background: var(--color-warning);
}

.summary-source {
  display: flex;
  align-items: center;
  min-width: 180px;
  padding: 0 var(--spacing-sm);
  margin-left: auto;
}

.gantt-shell {
  min-height: 360px;
  overflow-x: auto;
  background: var(--gantt-surface);
  border: 1px solid var(--gantt-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
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
  border-bottom: 1px solid var(--gantt-border-strong);
  background: color-mix(in srgb, var(--gantt-surface-muted) 88%, var(--gantt-surface));
}

.gantt-group-header,
.gantt-group-label {
  width: 150px;
  min-width: 150px;
  border-right: 1px solid var(--gantt-border);
}

.gantt-group-header {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-regular);
}

.gantt-days {
  display: flex;
  flex: 1;
}

.gantt-day {
  flex: none;
  padding: 6px 2px;
  text-align: center;
  border-right: 1px solid var(--gantt-grid-line);
  color: var(--color-text-secondary);
}

.gantt-day span,
.gantt-day strong {
  display: block;
  font-size: 11px;
  line-height: 1.35;
}

.gantt-day.today {
  background: var(--gantt-today-bg);
  color: var(--color-primary);
}

.gantt-day.weekend {
  background: var(--gantt-weekend-bg);
  color: var(--color-warning);
}

.gantt-group {
  border-bottom: 1px solid var(--gantt-border);
}

.gantt-group-label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  color: var(--color-text-primary);
  background: var(--gantt-surface-muted);
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
  border: 1px solid var(--gantt-border-strong);
  border-radius: 999px;
  color: var(--color-text-secondary);
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
  border-right: 1px solid var(--gantt-grid-line);
}

.gantt-grid-col.today {
  background: color-mix(in srgb, var(--color-primary) 9%, transparent);
}

.gantt-grid-col.weekend {
  background: color-mix(in srgb, var(--color-warning) 8%, transparent);
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
  color: var(--gantt-bar-color, var(--color-on-primary));
  background: var(--gantt-bar-bg, var(--gantt-task-pending));
  cursor: pointer;
  box-shadow: 0 1px 3px color-mix(in srgb, var(--color-bg-overlay) 18%, transparent);
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
  outline: 2px solid color-mix(in srgb, var(--color-danger) 55%, transparent);
  outline-offset: 1px;
}

.gantt-bar.issue {
  background-image: repeating-linear-gradient(
    135deg,
    color-mix(in srgb, var(--color-on-primary) 20%, transparent) 0,
    color-mix(in srgb, var(--color-on-primary) 20%, transparent) 6px,
    color-mix(in srgb, var(--color-bg-overlay) 8%, transparent) 6px,
    color-mix(in srgb, var(--color-bg-overlay) 8%, transparent) 12px
  );
}

.status-pending { --gantt-bar-bg: var(--gantt-task-pending); }
.status-allocated { --gantt-bar-bg: var(--gantt-task-allocated); }
.status-preparing { --gantt-bar-bg: var(--gantt-task-preparing); }
.status-material_issuing { --gantt-bar-bg: var(--gantt-task-material-issuing); }
.status-material_partial_issued { --gantt-bar-bg: var(--gantt-task-material-partial); }
.status-material_issued { --gantt-bar-bg: var(--gantt-task-material-issued); }
.status-in_progress { --gantt-bar-bg: var(--gantt-task-in-progress); }
.status-paused { --gantt-bar-bg: var(--gantt-task-paused); }
.status-inspection { --gantt-bar-bg: var(--gantt-task-inspection); }
.status-warehousing { --gantt-bar-bg: var(--gantt-task-warehousing); }
.status-completed { --gantt-bar-bg: var(--gantt-task-completed); }

.gantt-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  padding: 10px 2px 0;
  color: var(--color-text-regular);
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
  background: var(--gantt-bar-bg, var(--gantt-task-pending));
}

.legend-overdue {
  background: var(--color-danger);
}

.legend-issue {
  background: repeating-linear-gradient(
    135deg,
    var(--color-warning) 0,
    var(--color-warning) 5px,
    var(--color-danger) 5px,
    var(--color-danger) 10px
  );
}

.gantt-tooltip {
  position: fixed;
  z-index: 9999;
  width: 300px;
  padding: 10px 12px;
  color: var(--color-text-regular);
  background: var(--color-bg-base);
  border: 1px solid var(--color-border-base);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);
  pointer-events: none;
  font-size: 12px;
  line-height: 1.7;
}

.tooltip-title {
  margin-bottom: 4px;
  color: var(--color-primary);
  font-weight: 700;
}

.tooltip-danger {
  color: var(--color-danger);
}

.tooltip-warning {
  color: var(--color-warning);
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
