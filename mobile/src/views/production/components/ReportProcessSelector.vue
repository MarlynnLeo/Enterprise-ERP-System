<template>
  <div>
    <Field label="报工工序">
      <template #input>
        <select v-model="processId" aria-label="报工工序" :disabled="loading || disabled" @change="selectProcess">
          <option value="" :disabled="mode === 'process'">任务报工</option>
          <option v-for="process in processes" :key="process.id" :value="String(process.id)"
            :disabled="mode === 'task' && reportCount > 0">
            {{ process.sequence }}. {{ process.processName }}
          </option>
        </select>
      </template>
    </Field>
    <Cell v-if="error" :title="error" is-link value="重试" @click="load" />
    <Cell v-else :title="loading ? '正在读取报工额度' : `${processId ? '本工序' : '任务'}剩余可报工：${remaining}`" />
  </div>
</template>
<script setup>
import { ref, watch } from 'vue'
import { Field, Cell } from 'vant'
import { productionApi } from '@/api'
import { getApiErrorMessage } from '@/utils/errorHandler'
const props = defineProps({ taskId: [Number, String], disabled: Boolean })
const emit = defineEmits(['change'])
const processes = ref([])
const processId = ref('')
const mode = ref('task')
const reportCount = ref(0)
const remaining = ref(0)
const loading = ref(false)
const error = ref('')
let request = 0
let selectionRequest = 0
const payload = response => response?.data || response || {}
async function load() {
  const version = ++request
  selectionRequest += 1
  emit('change', { ready: false, processId: null })
  if (!props.taskId) return
  loading.value = true
  error.value = ''
  try {
    const [processResponse, statsResponse] = await Promise.all([
      productionApi.getTaskReportProcesses(props.taskId), productionApi.getTaskReportStats(props.taskId)
    ])
    if (version !== request) return
    const rows = payload(processResponse)
    processes.value = (Array.isArray(rows) ? rows : rows.items || []).filter(row => row.status !== 'cancelled')
    const stats = payload(statsResponse)
    mode.value = stats.reportingMode ?? stats.reporting_mode ?? 'task'
    reportCount.value = Number(stats.reportCount ?? stats.report_count ?? 0)
    const next = processes.value.find(row => ['in_progress', 'pending'].includes(row.status)) || processes.value.at(-1)
    processId.value = mode.value === 'process' && next ? String(next.id) : ''
    await selectProcess()
  } catch (cause) {
    if (version === request) error.value = getApiErrorMessage(cause, '报工额度加载失败')
  } finally {
    if (version === request) loading.value = false
  }
}
async function selectProcess() {
  const version = ++selectionRequest
  const taskId = props.taskId
  const selectedId = processId.value
  emit('change', { ready: false, processId: null })
  loading.value = true
  error.value = ''
  try {
    const stats = payload(await productionApi.getTaskReportStats(taskId, { processId: selectedId }))
    if (version !== selectionRequest || taskId !== props.taskId || selectedId !== processId.value) return
    remaining.value = Number(stats.remainingQuantity ?? stats.remaining_quantity ?? 0)
    const process = processes.value.find(row => String(row.id) === selectedId)
    emit('change', { ready: true, processId: selectedId ? Number(selectedId) : null, processName: process?.processName || '' })
  } catch (cause) {
    if (version === selectionRequest && taskId === props.taskId && selectedId === processId.value) error.value = getApiErrorMessage(cause, '报工额度加载失败')
  } finally {
    if (version === selectionRequest && taskId === props.taskId && selectedId === processId.value) loading.value = false
  }
}
watch(() => props.taskId, load, { immediate: true })
</script>
<style scoped>
select { width: 100%; min-height: 32px; color: var(--text-primary); background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 6px; }
</style>
