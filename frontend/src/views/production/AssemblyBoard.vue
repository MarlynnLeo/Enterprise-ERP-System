<template>
  <div class="module-page page-container">
    <PageHeader title="装配看板" subtitle="实时查看各工位状态和生产任务装配进度">
      <template #actions>
<el-button @click="loadBoard" :loading="loading">
            <el-icon><Refresh /></el-icon> 刷新
          </el-button>
      </template>
    </PageHeader>

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
              <div class="bs-value">{{ s.task_code }}</div>
            </div>
            <div class="bs-task">
              <div class="bs-label">工序</div>
              <div class="bs-value highlight">{{ s.current_step }}</div>
            </div>
            <div class="bs-task">
              <div class="bs-label">操作人</div>
              <div class="bs-value">{{ s.operatorName || '-' }}</div>
            </div>
            <div class="bs-task">
              <div class="bs-label">产品</div>
              <div class="bs-value">{{ s.productName || '-' }}</div>
            </div>
            <div class="bs-task" v-if="s.started_at">
              <div class="bs-label">已用时</div>
              <div class="bs-value timer">{{ formatElapsed(s.started_at) }}</div>
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
      title="装配工序详情"
      mode="view"
      content-width="wide"
    >
      <el-steps :active="activeStepIndex" align-center finish-status="success" v-if="taskSteps.length" class="mb-24">
        <el-step v-for="s in taskSteps" :key="s.id" :title="s.step_name"
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
        <el-table-column label="标准/实际工时" width="130">
          <template #default="{ row }">
            <span>{{ row.standardMinutes || '-' }} / {{ row.actualMinutes || '-' }} 分</span>
          </template>
        </el-table-column>
        <el-table-column label="开始时间" width="160">
          <template #default="{ row }">{{ row.startedAt || '-' }}</template>
        </el-table-column>
        <el-table-column label="完成时间" width="160">
          <template #default="{ row }">{{ row.completedAt || '-' }}</template>
        </el-table-column>
      </el-table>
    </AppDialog>
  </div>
</template>

<script setup>
import { handleTableRowView } from '@/utils/tableRowView'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { assemblyExecutionApi } from '../../api/assembly'

const statusType = { pending: 'info', in_progress: 'warning', completed: 'success', skipped: 'danger' }
const statusText = { pending: '待执行', in_progress: '执行中', completed: '已完成', skipped: '已跳过' }

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
    boardData.value = data?.data || { stations: [], taskProgress: [] }
  } catch {
    ElMessage.error('加载看板失败')
  } finally {
    loading.value = false
  }
}

const viewTaskSteps = async (taskId) => {
  try {
    const { data } = await assemblyExecutionApi.getTaskSteps(taskId)
    taskSteps.value = data?.data?.steps || []
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
  loadBoard()
  timer = setInterval(loadBoard, 30000) // 每30秒刷新
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
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
