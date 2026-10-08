<template>
  <div class="processes-page">
    <NavBar title="生产过程" left-arrow @click-left="router.back()" />
    <div class="page-content">
      <div class="page-summary">
        <div>
          <h1>工序与进度</h1>
          <p>跟进已发料任务的生产过程</p>
        </div>
        <span v-if="total >= 0" class="task-count">{{ total }} 个任务</span>
      </div>

      <Search
        v-model="searchValue"
        placeholder="搜索任务编号或产品名称"
        @search="submitSearch"
        @clear="clearSearch"
      />
      <div class="status-filters" aria-label="任务状态筛选">
        <button
          v-for="tab in statusTabs"
          :key="tab.value"
          type="button"
          class="filter-chip"
          :class="{ active: activeStatus === tab.value }"
          :aria-pressed="activeStatus === tab.value"
          @click="switchStatus(tab.value)"
        >
          {{ tab.label }}
        </button>
      </div>

      <NoticeBar
        v-if="businessWarnings.length"
        class="business-notice"
        mode="closeable"
        wrapable
        :scrollable="false"
        :text="businessWarnings.join('；')"
        @close="businessWarnings = []"
      />

      <PullRefresh v-model="refreshing" @refresh="onRefresh">
        <List
          v-model:loading="loading"
          v-model:error="error"
          :finished="finished"
          :immediate-check="false"
          :finished-text="taskList.length ? '没有更多了' : ''"
          error-text="加载失败，点击重试"
          @load="onLoad"
        >
          <Empty
            v-if="initialized && !loading && !error && !taskList.length"
            description="暂无符合条件的生产任务"
          />
          <article v-for="task in taskList" :key="task.id" class="task-card">
            <div class="card-heading">
              <span class="task-code">{{ task.code || task.taskCode || '未命名任务' }}</span>
              <Tag :type="statusType(task.status)">{{ taskStatusText(task.status) }}</Tag>
            </div>
            <h2>{{ task.productName || '未知产品' }}</h2>
            <div class="task-meta">
              <span v-if="task.productCode">{{ task.productCode }}</span>
              <span>完成 {{ task.completedQuantity || 0 }} / {{ task.quantity || 0 }} {{ task.unit || '件' }}</span>
              <span v-if="task.manager">负责人：{{ task.manager }}</span>
              <span v-if="task.expectedEndDate">计划完成：{{ formatDate(task.expectedEndDate) }}</span>
            </div>
            <div class="progress-row">
              <Progress
                class="progress-bar"
                :percentage="task.progressPercent"
                :show-pivot="false"
                :color="progressColor(task.progressPercent)"
              />
              <span>{{ task.progressPercent }}%</span>
            </div>
            <div class="task-actions">
              <button
                type="button"
                class="expand-button"
                :aria-expanded="isExpanded(task.id)"
                @click="toggleTask(task.id)"
              >
                工序 {{ completedProcessCount(task) }}/{{ task.processes.length }}
                <Icon :name="isExpanded(task.id) ? 'arrow-up' : 'arrow-down'" />
              </button>
              <VanButton
                v-if="canUpdate && canUpdateTask && isIssued(task)"
                size="small"
                type="primary"
                plain
                :loading="pendingAction === `task:${task.id}`"
                :disabled="Boolean(pendingAction)"
                @click="startTask(task)"
              >开始生产</VanButton>
            </div>

            <div v-if="isExpanded(task.id)" class="process-list">
              <p v-if="!task.processes.length" class="empty-processes">该任务暂无工序</p>
              <section v-for="(process, index) in task.processes" :key="process.id" class="process-item">
                <div class="process-heading">
                  <span class="sequence">{{ index + 1 }}</span>
                  <h3>{{ process.processName || '未命名工序' }}</h3>
                  <Tag :type="statusType(process.status)" plain>{{ processStatusText(process.status) }}</Tag>
                </div>
                <div class="progress-row">
                  <Progress
                    class="progress-bar"
                    :percentage="process.progressPercent"
                    :show-pivot="false"
                    :color="progressColor(process.progressPercent)"
                  />
                  <span>{{ process.progressPercent }}%</span>
                </div>
                <div class="process-meta">
                  <span v-if="process.actualStartTime">开始：{{ formatDateTime(process.actualStartTime) }}</span>
                  <span v-if="process.actualEndTime">完成：{{ formatDateTime(process.actualEndTime) }}</span>
                  <span v-if="process.remarks">备注：{{ process.remarks }}</span>
                </div>
                <p v-if="process.status === 'pending' && !previousProcessesDone(task, process)" class="sequence-hint">
                  请先完成前序工序
                </p>
                <div v-if="canEditProcess(task, process)" class="process-actions">
                  <VanButton
                    v-if="process.status === 'pending'"
                    size="small"
                    type="primary"
                    :disabled="Boolean(pendingAction) || !previousProcessesDone(task, process)"
                    :loading="pendingAction === `start:${process.id}`"
                    @click="startProcess(task, process)"
                  >开始工序</VanButton>
                  <VanButton
                    v-if="process.status === 'in_progress' && task.status === 'in_progress'"
                    size="small"
                    type="success"
                    :disabled="Boolean(pendingAction)"
                    :loading="pendingAction === `complete:${process.id}`"
                    @click="completeProcess(task, process)"
                  >完成工序</VanButton>
                  <VanButton
                    size="small"
                    plain
                    :disabled="Boolean(pendingAction)"
                    @click="openProgress(task, process)"
                  >更新进度</VanButton>
                </div>
              </section>
            </div>
          </article>
        </List>
      </PullRefresh>
    </div>

    <Popup
      v-model:show="showProgress"
      position="bottom"
      round
      safe-area-inset-bottom
      :close-on-click-overlay="!pendingAction"
    >
      <div class="progress-dialog">
        <div class="dialog-header">
          <h2>更新进度</h2>
          <VanButton size="small" :disabled="Boolean(pendingAction)" @click="showProgress = false">关闭</VanButton>
        </div>
        <p class="dialog-context">{{ currentProcess?.processName }} · {{ currentTask?.code || currentTask?.taskCode }}</p>
        <Field label="工序状态">
          <template #input>
            <RadioGroup v-model="progressForm.status" direction="horizontal" :disabled="Boolean(pendingAction)" @change="changeFormStatus">
              <Radio v-for="status in availableProcessStatuses" :key="status" :name="status">
                {{ processStatusText(status) }}
              </Radio>
            </RadioGroup>
          </template>
        </Field>
        <Field label="完成进度">
          <template #input>
            <Stepper
              v-model="progressForm.progress"
              integer
              :min="0"
              :max="progressForm.status === 'completed' ? 100 : 99"
              :disabled="Boolean(pendingAction) || progressForm.status !== 'in_progress'"
            />
            <span class="percent-unit">%</span>
          </template>
        </Field>
        <p class="form-hint">未开始为 0%，生产中为 0–99%，完成工序为 100%。</p>
        <Field
          v-model="progressForm.remarks"
          label="备注"
          type="textarea"
          rows="3"
          maxlength="1000"
          show-word-limit
          placeholder="填写进度说明"
          :disabled="Boolean(pendingAction)"
        />
        <VanButton type="primary" block :loading="Boolean(pendingAction)" :disabled="!canUpdate" @click="submitProgress">
          保存进度
        </VanButton>
      </div>
    </Popup>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import {
  NavBar, Search, PullRefresh, List, Empty, Tag, Progress, Icon, NoticeBar,
  Popup, Field, Stepper, Radio, RadioGroup, Button as VanButton, showToast, showDialog
} from 'vant'
import { productionApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { usePagination } from '@/composables/usePagination'
import { extractApiData } from '@/utils/apiHelper'
import { getApiErrorMessage } from '@/utils/errorHandler'

const router = useRouter()
const authStore = useAuthStore()
const canUpdate = computed(() => authStore.hasPermission('production:process:update'))
const canUpdateTask = computed(() => authStore.hasPermission('production:tasks:update'))
const searchValue = ref('')
const submittedKeyword = ref('')
const activeStatus = ref('all')
const expandedTasks = ref(new Set())
const pendingAction = ref('')
const businessWarnings = ref([])
const showProgress = ref(false)
const currentTask = ref(null)
const currentProcess = ref(null)
const progressForm = reactive({ status: 'pending', progress: 0, remarks: '' })

const statusTabs = [
  { value: 'all', label: '全部' },
  { value: 'material_issued', label: '已发料' },
  { value: 'material_partial_issued', label: '部分发料' },
  { value: 'in_progress', label: '生产中' },
  { value: 'inspection', label: '待检验' },
  { value: 'warehousing', label: '待入库' },
  { value: 'completed', label: '已完成' }
]
const startableStatuses = new Set(['material_issued', 'material_partial_issued', 'in_progress'])
const terminalProcessStatuses = new Set(['completed', 'cancelled'])
const taskStatusText = status => statusTabs.find(tab => tab.value === status)?.label || status
const processStatusText = status => ({ pending: '未开始', in_progress: '生产中', completed: '已完成', cancelled: '已跳过' })[status] || status
const statusType = status => status === 'completed' ? 'success' : status === 'in_progress' ? 'primary' : status === 'cancelled' || status === 'pending' ? 'default' : 'warning'
const clampProgress = value => Number.isFinite(Number(value)) ? Math.min(100, Math.max(0, Math.round(Number(value)))) : 0
const progressColor = percent => percent === 100 ? 'var(--color-success)' : 'var(--color-primary)'
const formatDate = value => dayjs(value).isValid() ? dayjs(value).format('YYYY-MM-DD') : '—'
const formatDateTime = value => dayjs(value).isValid() ? dayjs(value).format('MM-DD HH:mm') : '—'

const {
  list: rawTasks, total, loading, finished, refreshing, error, initialized,
  onLoad: loadPage, onRefresh: refreshPages
} = usePagination(productionApi.getProductionTasks, { immediate: false })
const taskList = computed(() => rawTasks.value.map(task => ({
  ...task,
  progressPercent: clampProgress(task.progress),
  processes: (Array.isArray(task.processes) ? [...task.processes] : [])
    .sort((a, b) => Number(a.sequence) - Number(b.sequence))
    .map(process => ({
      ...process,
      progressPercent: terminalProcessStatuses.has(process.status) ? 100 : clampProgress(process.progress)
    }))
})))
const queryParams = () => ({
  keyword: submittedKeyword.value || undefined,
  statusList: activeStatus.value === 'all'
    ? 'material_issued,material_partial_issued,in_progress,inspection,warehousing,completed'
    : activeStatus.value
})
const onLoad = () => loadPage(queryParams())
const onRefresh = () => refreshPages(queryParams())
onMounted(onLoad)
const submitSearch = () => {
  submittedKeyword.value = searchValue.value.trim()
  onRefresh()
}
const clearSearch = () => {
  searchValue.value = ''
  submittedKeyword.value = ''
  onRefresh()
}
const switchStatus = status => {
  if (status === activeStatus.value) return
  activeStatus.value = status
  onRefresh()
}
const isExpanded = id => expandedTasks.value.has(id)
const toggleTask = id => {
  const next = new Set(expandedTasks.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedTasks.value = next
}
const completedProcessCount = task => task.processes.filter(process => terminalProcessStatuses.has(process.status)).length
const previousProcessesDone = (task, process) => task.processes.every(previous =>
  Number(previous.sequence) >= Number(process.sequence) || terminalProcessStatuses.has(previous.status)
)
const isIssued = task => ['material_issued', 'material_partial_issued'].includes(task.status)
const canEditProcess = (task, process) => canUpdate.value && startableStatuses.has(task?.status) && ['pending', 'in_progress'].includes(process?.status)

const handleOperationError = async (error, fallback) => {
  const message = getApiErrorMessage(error, fallback)
  const data = error?.response?.data || {}
  if ((data.errorCode || data.code) === 'OPEN_INSPECTIONS' || data.action) {
    await showDialog({ title: '请先处理质量检验', message, confirmButtonText: '知道了' })
  } else {
    showToast({ message, duration: 5000 })
  }
}
const runOperation = async (key, operation, successMessage, closeEditor = false) => {
  if (pendingAction.value || !canUpdate.value) return
  pendingAction.value = key
  try {
    const response = await operation()
    const data = extractApiData(response, {})
    businessWarnings.value = Array.isArray(data.warnings) ? data.warnings.filter(message => typeof message === 'string') : []
    if (closeEditor) showProgress.value = false
    await onRefresh()
    showToast(successMessage)
  } catch (error) {
    await handleOperationError(error, '操作失败，请重试')
  } finally {
    pendingAction.value = ''
  }
}
const startTask = task => {
  if (!canUpdateTask.value || !isIssued(task)) return
  return runOperation(`task:${task.id}`, () => productionApi.startProductionTask(task.id), '生产任务已开始')
}
const startProcess = (task, process) => {
  if (!canEditProcess(task, process) || process.status !== 'pending' || !previousProcessesDone(task, process)) return
  return runOperation(`start:${process.id}`, () => productionApi.updateProcess(process.id, {
    status: 'in_progress', progress: 0
  }), '工序已开始')
}
const completeProcess = (task, process) => {
  if (!canEditProcess(task, process) || process.status !== 'in_progress' || task.status !== 'in_progress') return
  return runOperation(`complete:${process.id}`, () => productionApi.updateProcess(process.id, {
    status: 'completed', progress: 100
  }), '工序已完成')
}

const availableProcessStatuses = computed(() => {
  if (!currentProcess.value) return []
  if (currentProcess.value.status === 'pending') {
    return previousProcessesDone(currentTask.value, currentProcess.value) ? ['pending', 'in_progress'] : ['pending']
  }
  return currentTask.value?.status === 'in_progress' ? ['in_progress', 'completed'] : ['in_progress']
})
const openProgress = (task, process) => {
  if (pendingAction.value || !canEditProcess(task, process)) return
  currentTask.value = task
  currentProcess.value = process
  progressForm.status = process.status
  progressForm.progress = process.status === 'pending' ? 0 : Math.min(99, process.progressPercent)
  progressForm.remarks = process.remarks || ''
  showProgress.value = true
}
const changeFormStatus = status => {
  if (status === 'pending') progressForm.progress = 0
  else if (status === 'completed') progressForm.progress = 100
  else progressForm.progress = Math.min(99, clampProgress(progressForm.progress))
}
const submitProgress = () => {
  const task = currentTask.value
  const process = currentProcess.value
  if (!task || !process || !canEditProcess(task, process) || !availableProcessStatuses.value.includes(progressForm.status)) return
  const progress = Number(progressForm.progress)
  if (!Number.isFinite(progress) || progress < 0 || progress > 100 ||
      (progressForm.status === 'pending' && progress !== 0) ||
      (progressForm.status === 'in_progress' && progress >= 100) ||
      (progressForm.status === 'completed' && progress !== 100)) {
    showToast('请检查工序状态与完成进度')
    return
  }
  return runOperation(`update:${process.id}`, () => productionApi.updateProcess(process.id, {
    status: progressForm.status,
    progress,
    remarks: progressForm.remarks.trim()
  }), '进度已更新', true)
}
</script>

<style lang="scss" scoped>
.processes-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-primary);
  color: var(--text-primary);
}
.processes-page > :deep(.van-nav-bar) { flex-shrink: 0; }
.page-content {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 12px 12px max(12px, var(--app-bottom-space));
}
.page-summary, .card-heading, .task-actions, .process-heading, .dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.page-summary { padding: 4px 4px 12px; }
h1, h2, h3, p { margin: 0; }
h1 { font-size: 1.125rem; }
h2 { font-size: 0.9375rem; line-height: 1.5; overflow-wrap: anywhere; }
h3 { flex: 1; min-width: 0; font-size: 0.875rem; overflow-wrap: anywhere; }
.page-summary p, .task-count, .task-meta, .process-meta, .form-hint, .dialog-context, .empty-processes {
  color: var(--text-secondary);
  font-size: 0.75rem;
  line-height: 1.6;
}
.page-summary p { margin-top: 4px; }
.task-count { flex-shrink: 0; }
.status-filters {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 12px 0;
}
.filter-chip {
  flex-shrink: 0;
  padding: 8px 14px;
  border: 1px solid var(--surface-border, var(--border-subtle));
  border-radius: 20px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 0.8125rem;
  cursor: pointer;
  &.active {
    color: var(--color-primary);
    border-color: var(--color-primary);
    background: var(--color-accent-bg, var(--bg-secondary));
  }
}
.business-notice { margin-bottom: 12px; border-radius: 8px; }
.task-card {
  padding: 14px;
  margin-bottom: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--surface-border, var(--border-subtle));
  border-radius: 12px;
}
.card-heading { margin-bottom: 8px; }
.task-code { min-width: 0; overflow-wrap: anywhere; font-size: 0.8125rem; font-weight: 600; }
.card-heading :deep(.van-tag), .process-heading :deep(.van-tag) { flex-shrink: 0; }
.task-meta, .process-meta { display: flex; flex-direction: column; gap: 2px; margin-top: 6px; overflow-wrap: anywhere; }
.progress-row { display: flex; align-items: center; gap: 12px; margin: 12px 0; }
.progress-bar { flex: 1; }
.progress-row > span { min-width: 36px; text-align: right; color: var(--text-secondary); font-size: 0.75rem; }
.expand-button {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: var(--color-primary);
  font-size: 0.8125rem;
  cursor: pointer;
}
.process-list { border-top: 1px solid var(--surface-border, var(--border-subtle)); margin-top: 10px; }
.process-item { padding: 14px 0; }
.process-item + .process-item { border-top: 1px solid var(--surface-border, var(--border-subtle)); }
.process-item:last-child { padding-bottom: 0; }
.sequence {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 0.75rem;
}
.sequence-hint { margin-top: 8px; color: var(--text-tertiary); font-size: 0.75rem; }
.process-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.empty-processes { padding: 18px 0; text-align: center; }
.progress-dialog { padding: 18px 16px; max-height: 85vh; overflow-y: auto; background: var(--bg-secondary); }
.dialog-context { margin: 10px 0 14px; overflow-wrap: anywhere; }
.form-hint { margin: 8px 16px; }
.percent-unit { margin-left: 8px; }
.progress-dialog > .van-button { margin-top: 20px; }
:deep(.van-radio-group--horizontal) { flex-wrap: wrap; gap: 10px 0; }
</style>
