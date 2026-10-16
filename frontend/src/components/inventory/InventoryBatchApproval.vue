<template>
  <div v-if="canApprove && (selectedRows.length > 0 || visible)" class="inventory-batch-approval">
    <div v-if="selectedRows.length > 0" class="inventory-batch-approval__toolbar">
      <el-button type="success" :disabled="disabled || !selectedRows.length || busy" @click="openPreview">
        批量财务审批
      </el-button>
      <span class="text-secondary">已选 {{ selectedRows.length }} 张单据（仅当前页）</span>
      <el-button v-if="selectedRows.length" text :disabled="busy" @click="$emit('clear')">清空选择</el-button>
    </div>
    <AppDialog
      v-model="visible"
      :title="submitted ? '批量财务审批结果' : '批量财务审批确认'"
      width="1100px"
      mode="view"
      :loading="preparing"
      :close-on-click-modal="false"
      :close-on-press-escape="!submitting"
      :show-close="!submitting"
    >
      <div class="inventory-batch-approval__content" aria-live="polite">
        <p v-if="preparing">正在核对所选单据的最新审核状态与过账明细…</p>
        <template v-else>
          <el-alert v-if="submitted" :title="resultSummary" :type="hasFailures ? 'warning' : 'success'" :closable="false" show-icon />
          <el-alert v-else :title="`已选择 ${sourceCount} 张业务单据，可审批 ${readyEntries.length} 笔过账；跳过 ${skippedCount} 项。请展开核对数量和成本，确认后将正式入账。`" type="info" :closable="false" show-icon />
          <el-alert v-if="readyEntries.length > MAX_BATCH_APPROVAL" :title="`每次最多审批 ${MAX_BATCH_APPROVAL} 笔过账（含补发），请减少所选单据后重试`" type="warning" :closable="false" show-icon />
          <el-table :data="entries" row-key="key" border max-height="460" empty-text="没有可审批的单据">
            <el-table-column type="expand">
              <template #default="{ row }">
                <div class="inventory-batch-approval__lines">
                  <el-table :data="row.lines || []" border empty-text="暂无可核对的过账明细">
                    <el-table-column prop="materialCode" label="物料编码" min-width="120" />
                    <el-table-column prop="materialName" label="物料名称" min-width="130" />
                    <el-table-column prop="materialSpecs" label="规格" min-width="110" />
                    <el-table-column prop="locationName" label="仓库/库位" min-width="100" />
                    <el-table-column prop="batchNumber" label="批次" min-width="100" />
                    <el-table-column prop="unitName" label="单位" width="65" />
                    <el-table-column label="变动数量" min-width="110" align="right">
                      <template #default="{ row: line }">{{ formatAmount(line.signedQuantity, 6) }}</template>
                    </el-table-column>
                    <el-table-column label="单位成本（元）" min-width="130" align="right">
                      <template #default="{ row: line }">{{ costLabel(line.unitCost, 6) }}</template>
                    </el-table-column>
                    <el-table-column label="变动金额（元）" min-width="130" align="right">
                      <template #default="{ row: line }">{{ line.totalValue === '***' ? '无权限' : formatAmount(signedMovementValue(line)) }}</template>
                    </el-table-column>
                  </el-table>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="sourceNo" label="来源单号" min-width="150" show-overflow-tooltip />
            <el-table-column prop="postingNo" label="过账单号" min-width="160" show-overflow-tooltip />
            <el-table-column label="方向" width="80">
              <template #default="{ row }">{{ directionLabel(row.movementDirection) }}</template>
            </el-table-column>
            <el-table-column label="业务日期" min-width="110">
              <template #default="{ row }">{{ String(row.transactionDate || '').slice(0, 10) || '-' }}</template>
            </el-table-column>
            <el-table-column label="过账金额（元）" min-width="140" align="right">
              <template #default="{ row }">{{ costLabel(row.totalValue) }}</template>
            </el-table-column>
            <el-table-column label="处理状态" width="105">
              <template #default="{ row }"><el-tag :type="entryStatus[row.status].type">{{ entryStatus[row.status].label }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="message" label="说明" min-width="230" show-overflow-tooltip />
          </el-table>
          <p class="text-secondary">出库补发按独立过账记录审批。跳过和失败的记录保留原状态，可在单据详情中核对处理。</p>
        </template>
      </div>
      <template #footer>
        <el-button :disabled="submitting" @click="visible = false">{{ submitted ? '关闭' : '取消' }}</el-button>
        <el-button
          v-if="!submitted"
          type="success"
          :loading="submitting"
          :disabled="preparing || !readyEntries.length || readyEntries.length > MAX_BATCH_APPROVAL || disabled"
          @click="submitApproval"
        >确认通过 {{ readyEntries.length }} 笔</el-button>
      </template>
    </AppDialog>
  </div>
</template>

<script setup>
import { computed, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index'
import AppDialog from '@/components/ui/AppDialog.vue'
import { financeApi } from '@/api/finance'
import { useAuthStore } from '@/stores/auth'
import { directionLabel, formatAmount, signedMovementValue } from '@/views/finance/inventoryPostingModel'
import { MAX_BATCH_APPROVAL, applyBatchResults, prepareBatchApproval } from './inventoryBatchApproval'

const props = defineProps({
  selectedRows: { type: Array, default: () => [] },
  sourceType: { type: String, required: true },
  sourceNoKey: { type: String, required: true },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['clear', 'changed'])
const auth = useAuthStore()
const canApprove = computed(() => auth.canViewInventoryApproval && auth.canApproveInventoryApproval)
const visible = ref(false)
const preparing = ref(false)
const submitting = ref(false)
const submitted = ref(false)
const entries = ref([])
const sourceCount = ref(0)
const busy = computed(() => preparing.value || submitting.value)
const readyEntries = computed(() => entries.value.filter(entry => entry.status === 'ready'))
const skippedCount = computed(() => entries.value.filter(entry => entry.status === 'skipped').length)
const hasFailures = computed(() => entries.value.some(entry => ['failed', 'unknown'].includes(entry.status)))
const resultSummary = computed(() => {
  const count = status => entries.value.filter(entry => entry.status === status).length
  return `审批结果：成功 ${count('succeeded')} 笔，失败 ${count('failed')} 笔，结果待核对 ${count('unknown')} 笔，跳过 ${skippedCount.value} 项。`
})
const entryStatus = {
  ready: { label: '可审批', type: 'info' },
  skipped: { label: '已跳过', type: 'info' },
  succeeded: { label: '已通过', type: 'success' },
  failed: { label: '失败', type: 'danger' },
  unknown: { label: '待核对', type: 'warning' },
}
const costLabel = (value, digits = 2) => value === '***' ? '无权限' : formatAmount(value, digits)
const selectionKey = computed(() => JSON.stringify([
  props.sourceType, props.sourceNoKey,
  props.selectedRows.map(row => [row.id, row[props.sourceNoKey]]),
]))
const actorKey = computed(() => JSON.stringify([
  auth.user?.id, auth.user?.username, auth.user?.realName, auth.user?.name, canApprove.value, auth.permissions,
]))
let generation = 0
let pageActive = true

function invalidate() {
  generation += 1
  visible.value = false
  preparing.value = false
  entries.value = []
}

async function openPreview() {
  if (!pageActive || !canApprove.value || busy.value || props.disabled || !props.selectedRows.length) return
  const sources = [...new Map(props.selectedRows.map(row => [String(row.id), {
    sourceId: row.id, sourceNo: row[props.sourceNoKey],
  }])).values()]
  if (sources.some(source => !Number.isSafeInteger(Number(source.sourceId)) || Number(source.sourceId) <= 0 || !source.sourceNo)) {
    ElMessage.warning('所选单据标识不完整，请刷新列表后重试')
    return
  }
  if (sources.length > MAX_BATCH_APPROVAL) {
    ElMessage.warning(`每次最多选择 ${MAX_BATCH_APPROVAL} 张单据`)
    return
  }
  const request = ++generation
  const isCurrent = () => request === generation && pageActive && canApprove.value && visible.value
  sourceCount.value = sources.length
  submitted.value = false
  entries.value = []
  visible.value = true
  preparing.value = true
  try {
    const prepared = await prepareBatchApproval(sources, {
      sourceType: props.sourceType, user: { ...auth.user }, api: financeApi.inventoryPostings, isCurrent,
    })
    if (isCurrent()) entries.value = prepared
  } finally {
    if (request === generation) preparing.value = false
  }
}

async function submitApproval() {
  if (!pageActive || !visible.value || !canApprove.value || props.disabled || busy.value || submitted.value ||
      !readyEntries.value.length || readyEntries.value.length > MAX_BATCH_APPROVAL) return
  const request = generation
  const ids = readyEntries.value.map(entry => entry.id)
  const isCurrent = () => request === generation && pageActive && canApprove.value
  submitting.value = true
  try {
    const response = await financeApi.inventoryPostings.batchApprove({ ids })
    if (!isCurrent()) return
    entries.value = applyBatchResults(entries.value, response)
  } catch {
    if (!isCurrent()) return
    // A disconnected response does not prove rollback. Require a fresh read
    // before offering another submission, and never claim unknowns succeeded.
    entries.value = applyBatchResults(entries.value, null)
  } finally {
    if (isCurrent()) {
      submitted.value = true
      emit('changed')
    }
    submitting.value = false
  }
}

watch(selectionKey, () => {
  if (visible.value && !submitting.value && !submitted.value) invalidate()
})
watch(actorKey, invalidate)
watch(visible, value => { if (!value) { generation += 1; preparing.value = false } })
onActivated(() => { pageActive = true })
onDeactivated(() => { pageActive = false; invalidate() })
onBeforeUnmount(() => { pageActive = false; generation += 1 })
</script>

<style scoped>
.inventory-batch-approval__toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}
.inventory-batch-approval__content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.inventory-batch-approval__lines {
  padding: 12px;
}
</style>
