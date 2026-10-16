<template>
  <section v-if="showApprovalPanel" class="inventory-approval-panel" v-loading="loading">
    <div class="approval-panel__header">
      <div>
        <h4 class="approval-panel__title">财务审核</h4>
        <p class="approval-panel__subtitle">业务单据完成后，由财务审核确认存货成本与入账凭证</p>
      </div>
      <el-button text :loading="loading" @click="loadApproval">刷新</el-button>
    </div>

    <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon />

    <el-steps :active="financeStepActive" finish-status="success" process-status="process" align-center>
      <el-step title="业务完成" :status="businessStepStatus">
        <template #description>
          <span>{{ approval.movement?.businessApprovedBy || '未完成' }}</span>
          <small v-if="approval.movement?.businessApprovedAt">{{ formatDateTime(approval.movement.businessApprovedAt) }}</small>
        </template>
      </el-step>
      <el-step :title="isReversalPending ? '反审核' : '财务审核'" :status="financeStepStatus">
        <template #description>
          <span>{{ financeStepDescription }}</span>
          <small v-if="reviewTime">{{ formatDateTime(reviewTime) }}</small>
        </template>
      </el-step>
    </el-steps>

    <div v-if="activePosting" class="approval-panel__meta">
      <el-tag :type="statusType(displayStatus)" size="small">{{ statusLabel(displayStatus) }}</el-tag>
      <span>过账号：{{ activePosting.postingNo || '-' }}</span>
      <span v-if="activePosting.postingKind === 'reversal'">原过账号：{{ approval.movement?.postingNo || '-' }}</span>
      <span v-if="activePosting.postingKind === 'reversal'">反审申请人：{{ activePosting.businessApprovedBy || '-' }}</span>
      <span v-if="activePosting.sourceType === 'outbound_supplement'">补发单号：{{ activePosting.sourceNo }}</span>
      <span v-if="outboundPendingCount > 1">待审核：{{ outboundPendingCount }} 笔（含补发）</span>
      <span v-if="activePosting.financeApprovedLabel">财务审核人：{{ activePosting.financeApprovedLabel }}</span>
      <span v-if="activePosting.rejectedLabel">驳回人：{{ activePosting.rejectedLabel }}</span>
      <span v-if="activePosting.remark">意见：{{ activePosting.remark }}</span>
      <el-tag v-if="approvalSeparationBlocked && activePosting?.financeStatus === 'pending'" type="info" size="small">
        内控提示：{{ approvalSeparationReason }}
      </el-tag>
    </div>

    <div v-if="postingDetail" class="approval-panel__details">
      <div class="approval-panel__events-title">过账明细核对 · {{ postingDetail.postingNo }}</div>
      <p class="approval-panel__subtitle">以下数量、单位成本及金额为本次提交的过账数据；入库为正，出库为负。</p>
      <div class="approval-panel__meta">
        <span>业务日期：{{ formatDateTime(postingDetail.transactionDate).slice(0, 10) || '-' }}</span>
        <span>方向：{{ directionLabel(postingDetail.movementDirection) }}</span>
        <span>过账金额（元）：{{ costLabel(postingDetail.totalValue) }}</span>
      </div>
      <el-alert v-if="reviewIssue" :title="reviewIssue" type="warning" :closable="false" show-icon />
      <el-table :data="postingDetail.lines" row-key="id" border class="w-full" max-height="320" empty-text="暂无过账明细">
        <el-table-column prop="lineNo" label="行号" width="65" />
        <el-table-column prop="materialCode" label="物料编码" min-width="130" show-overflow-tooltip />
        <el-table-column prop="materialName" label="物料名称" min-width="140" show-overflow-tooltip />
        <el-table-column prop="materialSpecs" label="规格" min-width="130" show-overflow-tooltip />
        <el-table-column prop="locationName" label="仓库/库位" min-width="110" show-overflow-tooltip />
        <el-table-column prop="batchNumber" label="批次" min-width="100" show-overflow-tooltip />
        <el-table-column prop="unitName" label="单位" width="65" />
        <el-table-column label="变动数量" min-width="130" align="right">
          <template #default="{ row }">{{ formatAmount(row.signedQuantity, 6) }}</template>
        </el-table-column>
        <el-table-column label="单位成本（元）" min-width="145" align="right">
          <template #default="{ row }">{{ costLabel(row.unitCost, 6) }}</template>
        </el-table-column>
        <el-table-column label="变动金额（元）" min-width="140" align="right">
          <template #default="{ row }">{{ row.totalValue === '***' ? '无权限' : formatAmount(signedMovementValue(row)) }}</template>
        </el-table-column>
      </el-table>
    </div>

    <div v-if="approval.events?.length" class="approval-panel__events">
      <div class="approval-panel__events-title">审核记录</div>
      <el-timeline>
        <el-timeline-item
          v-for="(event, index) in approval.events"
          :key="event.id ?? `${event.postingDocumentId}-${event.createdAt}-${event.eventType}-${index}`"
          :type="eventType(event.eventType)"
          :timestamp="formatDateTime(event.createdAt)"
        >
          {{ eventLabel(event) }}
          <span v-if="event.actorLabel">，{{ event.actorLabel }}</span>
          <span v-if="event.remark">：{{ event.remark }}</span>
          <small>{{ eventSource(event) }}<template v-if="event.toStatus"> · {{ statusLabel(event.fromStatus) }} → {{ statusLabel(event.toStatus) }}</template></small>
        </el-timeline-item>
      </el-timeline>
    </div>

    <div v-if="showActions" class="approval-panel__actions">
      <template v-if="canReviewPosting">
        <el-tooltip
          :disabled="!approvalSeparationBlocked && !reviewIssue"
          :content="approvalSeparationReason || reviewIssue"
          placement="top"
        >
          <span class="action-btn-wrapper">
            <el-button
              v-permission="'finance:inventory:approve'"
              type="success"
              :disabled="approvalSeparationBlocked || Boolean(reviewIssue)"
              :loading="actionLoading"
              @click="approve"
            >
              {{ isReversalPending ? '通过反审' : '财务审核' }}
            </el-button>
          </span>
        </el-tooltip>
        <el-tooltip
          :disabled="!approvalSeparationBlocked"
          :content="approvalSeparationReason"
          placement="top"
        >
          <span class="action-btn-wrapper">
            <el-button
              v-permission="'finance:inventory:approve'"
              type="danger"
              :disabled="approvalSeparationBlocked"
              :loading="actionLoading"
              @click="reject"
            >
              驳回
            </el-button>
          </span>
        </el-tooltip>
      </template>
      <el-button
        v-if="canReverse"
        type="warning"
        v-permission="'finance:inventory:reverse'"
        :loading="actionLoading"
        @click="reverse"
      >
        反审
      </el-button>
    </div>
  </section>
</template>

<script setup>
import { computed, onActivated, onBeforeUnmount, onDeactivated, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index'
import { ElMessageBox } from 'element-plus/es/components/message-box/index'
import { financeApi } from '@/api/finance'
import { useAuthStore } from '@/stores/auth'
import { getApiErrorMessage } from '@/utils/errorHandler'
import { directionLabel, formatAmount, lastReview, normalizePosting, postingReviewIssue, separationReason, signedMovementValue, sourceTypeLabel } from '@/views/finance/inventoryPostingModel'

const props = defineProps({
  sourceType: { type: String, required: true },
  sourceId: { type: [Number, String], default: null },
  sourceNo: { type: String, default: '' },
  active: { type: Boolean, default: true },
})

const emit = defineEmits(['changed', 'loaded'])

const loading = ref(false)
const actionLoading = ref(false)
const loadError = ref('')
const loadedSourceKey = ref('')
const postingDetail = ref(null)
const emptyApproval = () => ({ movement: null, reversal: null, current: null, postings: [], events: [] })
const approval = reactive(emptyApproval())
const authStore = useAuthStore()
const canViewApproval = computed(() => authStore.canViewInventoryApproval)
let requestSequence = 0
let actionSequence = 0
let contextVersion = 0
let pageActive = true
const sourceKey = computed(() => JSON.stringify([props.sourceType, props.sourceId, props.sourceNo]))
const actorKey = computed(() => JSON.stringify([authStore.user?.id, authStore.user?.username]))
const hasApprovalRecord = computed(() => Boolean(
  approval.current ||
  approval.movement ||
  approval.reversal ||
  approval.postings.length
))

const unwrap = (response) => response?.data ?? response ?? null
const isActiveStatus = (status) => ['pending', 'approved'].includes(status)
const normalizeEvent = (row) => ({
  ...row,
  postingDocumentId: row.postingDocumentId ?? row.posting_document_id,
  eventType: row.eventType ?? row.event_type,
  fromStatus: row.fromStatus ?? row.from_status,
  toStatus: row.toStatus ?? row.to_status,
  actorId: row.actorId ?? row.actor_id,
  actorLabel: row.actorLabel ?? row.actor_label,
  createdAt: row.createdAt ?? row.created_at,
})

const activePosting = computed(() => {
  if (isActiveStatus(approval.reversal?.financeStatus)) return approval.reversal
  return approval.movement
})
const isReversalPending = computed(() => approval.reversal?.financeStatus === 'pending')
const displayStatus = computed(() => {
  if (isReversalPending.value) return 'reversal_pending'
  if (approval.reversal?.financeStatus === 'approved') return 'reversed'
  return approval.movement?.financeStatus || 'pending'
})
const reviewTime = computed(() => isReversalPending.value
  ? activePosting.value?.businessApprovedAt
  : lastReview(activePosting.value || {}).time)
const approvalSeparationReason = computed(() => separationReason({
  ...activePosting.value,
  originalBusinessApprovedById: approval.movement?.businessApprovedById,
  originalBusinessApprovedLabel: approval.movement?.businessApprovedBy,
  originalFinanceApprovedBy: approval.movement?.financeApprovedBy,
  originalFinanceApprovedLabel: approval.movement?.financeApprovedLabel,
}, authStore.user, { reversal: isReversalPending.value }))
const approvalSeparationBlocked = computed(() => Boolean(approvalSeparationReason.value))
const canReviewPosting = computed(() =>
  canViewApproval.value && props.active && loadedSourceKey.value === sourceKey.value && !loading.value && !loadError.value &&
  authStore.canApproveInventoryApproval &&
  activePosting.value?.financeStatus === 'pending'
)
const reviewIssue = computed(() => postingReviewIssue(postingDetail.value))
const canReject = computed(() => canReviewPosting.value && !approvalSeparationBlocked.value)
const canApprove = computed(() => canReject.value && !reviewIssue.value)
const canReverse = computed(() =>
  canViewApproval.value && props.active && loadedSourceKey.value === sourceKey.value && !loading.value && !loadError.value &&
  authStore.canReverseInventoryApproval &&
  approval.movement?.financeStatus === 'approved' &&
  approval.movement?.capabilities?.reversalSupported === true &&
  !isActiveStatus(approval.reversal?.financeStatus)
)
const showActions = computed(() =>
  Boolean(canReviewPosting.value || canReverse.value)
)
const showApprovalPanel = computed(() =>
  canViewApproval.value && props.active && Boolean(hasApprovalRecord.value || loading.value || loadError.value)
)
const outboundPendingCount = computed(() => {
  if (props.sourceType !== 'outbound') return 0
  const latest = new Map()
  for (const posting of approval.postings) {
    if (posting.postingKind !== 'movement') continue
    const key = `${posting.sourceType}:${posting.sourceNo}`
    const previous = latest.get(key)
    if (!previous || Number(posting.postingSequence || 1) > Number(previous.postingSequence || 1) ||
      (Number(posting.postingSequence || 1) === Number(previous.postingSequence || 1) && Number(posting.id) > Number(previous.id))) {
      latest.set(key, posting)
    }
  }
  return [...latest.values()].filter(posting => posting.financeStatus === 'pending').length
})
const financeStepActive = computed(() => (approval.movement ? 1 : 0))
const businessStepStatus = computed(() => (approval.movement ? 'success' : 'process'))
const financeStepStatus = computed(() => {
  if (!approval.movement) return 'wait'
  if (displayStatus.value === 'approved' || displayStatus.value === 'reversed') return 'success'
  if (displayStatus.value === 'rejected') return 'error'
  return 'process'
})
const financeStepDescription = computed(() => {
  if (isReversalPending.value) return '反审待审核'
  if (approval.reversal?.financeStatus === 'approved') return '已反审'
  if (approval.movement?.financeStatus === 'reversed') return '已反审'
  if (approval.movement?.financeStatus === 'approved') return '已审'
  if (approval.movement?.financeStatus === 'rejected') return '已驳回'
  return '未审核'
})

const statusLabel = (status) => ({
  pending: '未审核',
  approved: '已审',
  rejected: '已驳回',
  reversed: '已反审',
  reversal_pending: '反审待审核',
}[status] || status || '-')
const statusType = (status) => ({
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  reversed: 'info',
  reversal_pending: 'warning',
}[status] || 'info')
const formatDateTime = (value) => value ? String(value).replace('T', ' ').slice(0, 19) : ''
const costLabel = (value, digits = 2) => value === '***' ? '无权限' : formatAmount(value, digits)
const eventPosting = (event) => [approval.movement, approval.reversal, ...approval.postings]
  .find(posting => posting && String(posting.id) === String(event.postingDocumentId))
const eventSource = (event) => {
  const posting = eventPosting(event)
  return posting
    ? `${posting.postingNo || `过账记录 #${posting.id}`} · ${sourceTypeLabel(posting.sourceType)} ${posting.sourceNo || ''}`
    : `过账记录 #${event.postingDocumentId}`
}
const eventLabel = (event) => ({
  business_approved: '业务审核完成',
  finance_approved: eventPosting(event)?.postingKind === 'reversal' ? '反审核通过' : '财务审核通过',
  finance_rejected: eventPosting(event)?.postingKind === 'reversal' ? '反审核驳回' : '财务审核驳回',
  reversal_requested: '提交反审核申请',
  finance_reversed: '原库存过账已冲销',
}[event.eventType] || event.eventType || '审批状态变更')
const eventType = (type) => ({
  business_approved: 'primary',
  finance_approved: 'success',
  finance_rejected: 'danger',
  reversal_requested: 'warning',
  finance_reversed: 'info',
}[type] || 'primary')

async function loadApproval() {
  const request = ++requestSequence
  const key = sourceKey.value
  Object.assign(approval, emptyApproval())
  postingDetail.value = null
  loadedSourceKey.value = ''
  loadError.value = ''
  loading.value = false
  if (!pageActive || !props.active || !canViewApproval.value || !props.sourceType || (!props.sourceId && !props.sourceNo)) return false
  loading.value = true
  try {
    const response = await financeApi.inventoryPostings.getBySource({
      sourceType: props.sourceType,
      ...(props.sourceId ? { sourceId: props.sourceId } : {}),
      ...(props.sourceNo ? { sourceNo: props.sourceNo } : {}),
    })
    if (request !== requestSequence || key !== sourceKey.value || !pageActive || !props.active) return false
    const payload = unwrap(response) || {}
    Object.assign(approval, {
      current: normalizePosting(payload.current),
      movement: normalizePosting(payload.movement),
      reversal: normalizePosting(payload.reversal),
      postings: (payload.postings || []).map(normalizePosting),
      events: (payload.events || []).map(normalizeEvent),
    })
    const current = activePosting.value
    if (current) {
      const detail = normalizePosting(unwrap(await financeApi.inventoryPostings.get(current.id)))
      if (request !== requestSequence || key !== sourceKey.value || !pageActive || !props.active) return false
      if (!detail || String(detail.id) !== String(current.id) || detail.financeStatus !== current.financeStatus) {
        throw new Error('审核状态已变化，请刷新后重新核对过账明细')
      }
      postingDetail.value = detail
    }
    loadedSourceKey.value = key
    emit('loaded', approval.movement ? (isReversalPending.value ? 'pending' : displayStatus.value) : null)
    return true
  } catch (error) {
    if (request !== requestSequence || key !== sourceKey.value) return false
    loadError.value = getApiErrorMessage(error, '获取审批状态失败')
    return false
  } finally {
    if (request === requestSequence) loading.value = false
  }
}

async function runAction(kind) {
  const allowed = () => kind === 'reverse' ? canReverse.value : kind === 'approve' ? canApprove.value : canReject.value
  const posting = () => kind === 'reverse' ? approval.movement : activePosting.value
  if (!pageActive || actionLoading.value || !allowed()) return
  const postingId = posting()?.id
  const wasReversal = isReversalPending.value
  const action = ++actionSequence
  const context = contextVersion
  const key = sourceKey.value
  const isCurrent = () => action === actionSequence && context === contextVersion && key === sourceKey.value && pageActive && props.active
  let mutationStarted = false
  actionLoading.value = true
  try {
    let data
    if (kind === 'approve') {
      await ElMessageBox.confirm(
        wasReversal ? '确认通过反审核申请？通过后将冲销原库存流水并更新业务单据。' : '确认通过财务审核？通过后确认存货成本并正式入账。',
        '财务审核确认'
      )
    } else {
      const { value } = await ElMessageBox.prompt(kind === 'reject' ? '请输入驳回原因' : '请输入反审核原因', kind === 'reject' ? '驳回审批' : '申请反审核', {
        inputValidator: (value) => {
          const reason = String(value || '').trim()
          return (reason.length > 0 && reason.length <= 1000) || '请填写 1 至 1000 字的原因'
        },
      })
      const remark = String(value || '').trim()
      if (!remark || remark.length > 1000) return
      data = { remark }
    }
    if (!isCurrent() || !allowed() || posting()?.id !== postingId) return
    mutationStarted = true
    if (data) await financeApi.inventoryPostings[kind](postingId, data)
    else await financeApi.inventoryPostings[kind](postingId)
    if (!isCurrent()) return
    ElMessage.success(kind === 'approve'
      ? (wasReversal ? '反审核已通过，库存已冲销' : '财务审核通过，已确认入账')
      : kind === 'reject' ? '审批已驳回' : '反审核申请已提交，待独立财务审核')
    await loadApproval()
    if (isCurrent()) emit('changed', approval)
  } catch (error) {
    if (isCurrent() && error !== 'cancel' && error !== 'close') {
      ElMessage.error(getApiErrorMessage(error, kind === 'approve' ? '审核失败' : kind === 'reject' ? '驳回失败' : '提交反审核失败'))
      // A conflict or interrupted response may mean another reviewer, or this request,
      // already changed the document. Re-read before offering another mutation.
      if (mutationStarted) {
        await loadApproval()
        if (isCurrent()) emit('changed', approval)
      }
    }
  } finally {
    if (action === actionSequence) actionLoading.value = false
  }
}

const approve = () => runAction('approve')
const reject = () => runAction('reject')
const reverse = () => runAction('reverse')

function invalidateContext() {
  contextVersion += 1
  requestSequence += 1
  actionSequence += 1
  actionLoading.value = false
  loading.value = false
  loadError.value = ''
  loadedSourceKey.value = ''
  postingDetail.value = null
  Object.assign(approval, emptyApproval())
}
watch(() => [sourceKey.value, actorKey.value, canViewApproval.value, props.active], () => {
  invalidateContext()
  loadApproval()
}, { immediate: true })
onDeactivated(() => { pageActive = false; invalidateContext() })
onActivated(() => {
  if (!pageActive) { pageActive = true; loadApproval() }
})
onBeforeUnmount(() => { pageActive = false; invalidateContext() })
defineExpose({ refresh: loadApproval })
</script>

<style scoped>
.inventory-approval-panel {
  margin-top: 20px;
  padding-top: 18px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.approval-panel__header,
.approval-panel__meta,
.approval-panel__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.approval-panel__header {
  justify-content: space-between;
  margin-bottom: 16px;
}

.approval-panel__title {
  margin: 0;
  font-size: 16px;
  color: var(--el-text-color-primary);
}

.approval-panel__subtitle {
  margin: 4px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.approval-panel__meta {
  flex-wrap: wrap;
  margin-top: 16px;
  color: var(--el-text-color-regular);
  font-size: 13px;
}

.approval-panel__events,
.approval-panel__details {
  margin-top: 18px;
}

.approval-panel__details :deep(.el-table) {
  margin-top: 12px;
}

.approval-panel__events-title {
  margin-bottom: 10px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.approval-panel__events :deep(.el-timeline) {
  margin: 0;
  padding-left: 4px;
}

.approval-panel__events small {
  display: block;
  margin-top: 3px;
  color: var(--el-text-color-secondary);
}

.approval-panel__actions {
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
