<template>
  <div class="module-page page-container">
    <PageHeader title="装配看板" subtitle="实时查看各工位状态和生产任务装配进度">
      <template #actions>
<el-button @click="loadBoard" :loading="loading">
            <el-icon><Refresh /></el-icon> 刷新
          </el-button>
      </template>
    </PageHeader>

    <el-card class="data-card mb-20">
      <div class="flex-row gap-12">
        <el-select v-model="selectedTaskId" filterable remote :remote-method="loadSelectableTasks" placeholder="按任务编号或产品搜索" class="task-selector">
          <el-option v-for="task in selectableTasks" :key="task.id" :value="task.id" :label="task.code + ' · ' + task.productName" />
        </el-select>
        <el-button type="primary" :disabled="!selectedTaskId" @click="viewTaskSteps(selectedTaskId)">查看任务工序</el-button>
      </div>
    </el-card>
    <!-- 工位状态看板 -->
    <el-card class="data-card" v-loading="loading">
      <h3 class="mb-md">工位实时状态</h3>
      <div class="board-grid" v-if="boardData.stations?.length">
        <div v-for="s in boardData.stations" :key="s.id"
          class="board-station" :class="s.status">
          <div class="bs-header">
            <span class="bs-code">{{ s.code }}</span>
            <el-tag :type="s.status === 'busy' ? 'danger' : 'success'" size="small" effect="dark">
              {{ s.status === 'busy' ? '作业中' : '空闲' }}
            </el-tag>
          </div>
          <div class="bs-name">{{ s.name }}</div>
          <div class="bs-line">{{ s.lineName || s.lineCode || '' }}</div>
          <template v-if="s.status === 'busy'">
            <el-divider class="divider-tight" />
            <div class="bs-task">
              <div class="bs-label">任务</div>
              <div class="bs-value">{{ s.taskCode }}</div>
            </div>
            <div class="bs-task">
              <div class="bs-label">工序</div>
              <div class="bs-value highlight">{{ s.currentStep }}</div>
            </div>
            <div class="bs-task">
              <div class="bs-label">操作人</div>
              <div class="bs-value">{{ s.operatorName || '-' }}</div>
            </div>
            <div class="bs-task">
              <div class="bs-label">产品</div>
              <div class="bs-value">{{ s.productName || '-' }}</div>
            </div>
            <div class="bs-task" v-if="s.startedAt">
              <div class="bs-label">已用时</div>
              <div class="bs-value timer">{{ formatElapsed(s.startedAt) }}</div>
            </div>
          </template>
        </div>
      </div>
      <EmptyState v-else description="暂无工位数据，请先在工位管理中添加工位" />
    </el-card>

    <!-- 任务进度 -->
    <el-card class="data-card mt-md">
      <h3 class="mb-md">装配任务进度</h3>
      <el-table class="table-row-click" :data="boardData.taskProgress" border stripe v-if="boardData.taskProgress?.length"
      @row-click="(row, column, event) => handleTableRowView(row, column, event, () => viewTaskSteps(row.taskId))">
        <el-table-column prop="taskCode" label="任务编号" width="140" />
        <el-table-column prop="productName" label="产品" min-width="150" />
        <el-table-column label="进度" min-width="250">
          <template #default="{ row }">
            <div class="flex-row gap-12">
              <el-progress :percentage="row.progressPercent" :stroke-width="18"
                :color="row.progressPercent === 100 ? 'var(--color-success)' : 'var(--color-primary)'"
                class="flex-1" />
              <span class="nowrap text-md text-regular">
                {{ row.completedSteps }}/{{ row.totalSteps }} 道
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="当前工序" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.inProgressSteps > 0" type="warning" size="small">作业中</el-tag>
            <el-tag v-else-if="row.progressPercent === 100" type="success" size="small">已完成</el-tag>
            <el-tag v-else type="info" size="small">等待中</el-tag>
          </template>
        </el-table-column>
              </el-table>
      <EmptyState v-else description="暂无进行中的装配任务" />
    </el-card>

    <!-- 任务工序详情弹窗 -->
    <AppDialog
      v-model="stepsVisible"
      title="任务工序执行"
      mode="view"
      content-width="wide"
    >
      <el-steps :active="activeStepIndex" align-center finish-status="success" v-if="taskSteps.length" class="mb-24">
        <el-step v-for="s in taskSteps" :key="s.id" :title="s.stepName"
          :status="s.status === 'completed' ? 'finish' : s.status === 'in_progress' ? 'process' : s.status === 'skipped' ? 'error' : 'wait'" />
      </el-steps>

      <el-table :data="taskSteps" border size="small">
        <el-table-column prop="sequence" label="序号" width="60" align="center" />
        <el-table-column prop="stepName" label="工序" width="140" />
        <el-table-column label="工位" width="100">
          <template #default="{ row }">{{ row.stationName || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作人" width="100">
          <template #default="{ row }">{{ row.operatorName || '-' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="statusType[row.status]" size="small">{{ statusText[row.status] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="标准(批)/实际 (分钟)" width="180">
          <template #default="{ row }">
            <span>{{ row.standardTaskMinutes ?? '-' }} / {{ row.actualMinutes || '-' }} 分</span>
          </template>
        </el-table-column>
        <el-table-column label="开始时间" width="160">
          <template #default="{ row }">{{ row.startedAt || '-' }}</template>
        </el-table-column>
        <el-table-column label="完成时间" width="160">
          <template #default="{ row }">{{ row.completedAt || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" min-width="290" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="{ row }">
            <TableRowActions>
              <el-button size="small" @click="showStep(row)">作业要求</el-button>
              <el-button v-if="canExecute && row.status === 'pending'" size="small" type="primary" :loading="executingId === row.id" @click="executeStep(row, 'start')">开始</el-button>
              <el-button v-if="canExecute && row.status === 'in_progress'" size="small" type="success" :loading="executingId === row.id" @click="executeStep(row, 'complete')">完成</el-button>
              <el-button v-if="canExecute && row.status === 'pending'" size="small" type="warning" @click="skipStep(row)">跳过</el-button>
            </TableRowActions>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="!taskSteps.length" class="mt-md"><EmptyState description="此任务尚无工序" /><el-button v-if="canExecute" @click="generateSteps">生成任务工序</el-button></div>
    </AppDialog>
    <AppDialog v-model="stepInfoVisible" title="工序作业要求" mode="view" content-width="wide">
      <template v-if="currentStep">
        <h3>{{ currentStep.stepName }}</h3>
        <pre class="sop-content">{{ currentStep.sopContent || currentStep.description || '未配置文字作业要求' }}</pre>
        <div class="file-list">
          <el-button v-for="doc in currentStep.instructionDocs" :key="doc.url" size="small" @click="preview(doc)">{{ doc.name }}</el-button>
          <el-button v-for="(url, index) in currentStep.sopImages" :key="url" size="small" @click="preview({ url, name: url.split('/').pop() })">SOP图片 {{ index + 1 }}</el-button>
        </div>
        <el-table :data="currentStep.materials" border>
          <el-table-column prop="materialCode" label="物料编码" /><el-table-column prop="materialName" label="物料名称" />
          <el-table-column prop="quantity" label="单件用量" />
          <el-table-column label="完成前扫码"><template #default="{ row }">{{ Number(row.isScanRequired) === 1 ? '需要' : '不需要' }}</template></el-table-column>
        </el-table>
        <div v-if="canExecute && currentStep.status === 'in_progress'" class="flex-row gap-12 mt-md">
          <el-input v-model="scannedBarcode" placeholder="扫描或输入物料编码" @keyup.enter="verifyMaterial" />
          <el-button type="primary" :loading="verifying" @click="verifyMaterial">验证物料</el-button>
        </div>
      </template>
    </AppDialog>
    <ProcessTemplatePreviewDialog v-model="previewVisible" :doc="previewDoc" />
  </div>
</template>

<script setup>
import { handleTableRowView } from '@/utils/tableRowView'
import { ref, computed, onMounted, onUnmounted, defineAsyncComponent } from 'vue'
import { ElMessageBox } from 'element-plus/es/components/message-box/index'
import { productionApi } from '@/api/production'
import { productionAssistApi } from '@/api/productionAssist'
import { parseListData } from '@/utils/responseParser'
import { useAuthStore } from '@/stores/auth'
import TableRowActions from '@/components/common/TableRowActions.vue'
import { Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus/es/components/message/index'
import { assemblyExecutionApi } from '../../api/assembly'

const statusType = { pending: 'info', in_progress: 'warning', completed: 'success', skipped: 'danger' }
const statusText = { pending: '待执行', in_progress: '执行中', completed: '已完成', skipped: '已跳过' }

const ProcessTemplatePreviewDialog = defineAsyncComponent(() => import('../baseData/components/ProcessTemplatePreviewDialog.vue'))
const auth = useAuthStore()
const canExecute = computed(() => ['production:assembly:execute', 'production:process:update', 'production:tasks:update'].some(code => auth.hasPermission(code)))
const selectedTaskId = ref(null), selectableTasks = ref([]), executingId = ref(null)
const stepInfoVisible = ref(false), currentStep = ref(null), scannedBarcode = ref(''), verifying = ref(false)
const previewVisible = ref(false), previewDoc = ref(null)
const loadSelectableTasks = async (keyword = '') => {
  try { selectableTasks.value = parseListData(await productionApi.getProductionTasks({ keyword, pageSize: 100 })) }
  catch (error) { ElMessage.error(error.response?.data?.message || '加载任务失败') }
}
const preview = doc => { previewDoc.value = doc; previewVisible.value = true }
const showStep = row => { currentStep.value = row; scannedBarcode.value = ''; stepInfoVisible.value = true }
const verifyMaterial = async () => {
  if (!scannedBarcode.value.trim() || verifying.value) return
  verifying.value = true
  try {
    const { data } = await productionAssistApi.scanVerify({ taskId: currentStep.value.taskId, processId: currentStep.value.id, scannedBarcode: scannedBarcode.value.trim() })
    if (data.result === 'pass') { ElMessage.success('物料验证通过'); scannedBarcode.value = '' }
    else ElMessage.warning(data.reason || '物料验证未通过')
  } catch (error) { ElMessage.error(error.response?.data?.message || '扫码验证失败') }
  finally { verifying.value = false }
}
const executeStep = async (row, action) => {
  if (executingId.value) return
  executingId.value = row.id
  try {
    const { data } = action === 'start'
      ? await assemblyExecutionApi.startStep(row.id, {})
      : await assemblyExecutionApi.completeStep(row.id, {})
    if (data.warnings?.length) ElMessage.warning(data.warnings.join('；'))
    else ElMessage.success(action === 'start' ? '工序已开始' : '工序已完成')
    await viewTaskSteps(row.taskId)
    await loadBoard()
  } catch (error) { ElMessage.error(error.response?.data?.message || '工序操作失败') }
  finally { executingId.value = null }
}
const skipStep = async row => {
  try {
    const { value } = await ElMessageBox.prompt('请输入跳过该工序的原因', '跳过工序', { inputValidator: value => Boolean(value?.trim()) || '请填写原因' })
    const { data } = await assemblyExecutionApi.skipStep(row.id, { reason: value.trim() })
    if (data.warnings?.length) ElMessage.warning(data.warnings.join('；'))
    await viewTaskSteps(row.taskId)
    await loadBoard()
  } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error(error.response?.data?.message || '跳过失败') }
}
const generateSteps = async () => {
  try { await assemblyExecutionApi.generateSteps(selectedTaskId.value); await viewTaskSteps(selectedTaskId.value); await loadBoard() }
  catch (error) { ElMessage.error(error.response?.data?.message || '生成工序失败') }
}

const loading = ref(false)
const boardData = ref({ stations: [], taskProgress: [] })

const stepsVisible = ref(false)
const taskSteps = ref([])
const activeStepIndex = computed(() => {
  const idx = taskSteps.value.findIndex(s => s.status === 'in_progress')
  return idx >= 0 ? idx : taskSteps.value.filter(s => s.status === 'completed').length
})

const loadBoard = async () => {
  loading.value = true
  try {
    const { data } = await assemblyExecutionApi.getBoard()
    boardData.value = data || { stations: [], taskProgress: [] }
  } catch {
    ElMessage.error('加载看板失败')
  } finally {
    loading.value = false
  }
}

const viewTaskSteps = async (taskId) => {
  try {
    const { data } = await assemblyExecutionApi.getTaskSteps(taskId)
    selectedTaskId.value = taskId
    taskSteps.value = data?.steps || []
    stepsVisible.value = true
  } catch {
    ElMessage.error('加载详情失败')
  }
}

const formatElapsed = (startedAt) => {
  if (!startedAt) return '-'
  const diff = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

let timer = null
onMounted(() => {
  loadSelectableTasks()
  loadBoard()
  timer = setInterval(loadBoard, 30000) // 每30秒刷新
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.task-selector { width: min(440px, 65%); }
.sop-content { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; }
.file-list { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }

.board-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}
.board-station {
  border: 2px solid var(--color-border-lighter, var(--el-border-color-lighter));
  border-radius: 12px;
  padding: 16px;
  background: var(--color-bg-base);
  transition: all 0.3s;
}
.board-station.busy {
  border-color: var(--color-danger);
  background: linear-gradient(135deg, var(--el-color-danger-light-9) 0%, var(--color-bg-base) 100%);
}
.board-station.idle {
  border-color: var(--color-success);
  background: linear-gradient(135deg, var(--el-color-success-light-9) 0%, var(--color-bg-base) 100%);
}
.bs-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.bs-code {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text-primary);
}
.bs-name {
  font-size: 14px;
  color: var(--color-text-regular);
}
.bs-line {
  font-size: 12px;
  color: var(--color-text-secondary);
}
.bs-task {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
}
.bs-label {
  font-size: 12px;
  color: var(--color-text-secondary);
}
.bs-value {
  font-size: 13px;
  color: var(--color-text-primary);
  font-weight: 500;
}
.bs-value.highlight {
  color: var(--color-warning);
  font-weight: 700;
}
.bs-value.timer {
  color: var(--color-danger);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
</style>
