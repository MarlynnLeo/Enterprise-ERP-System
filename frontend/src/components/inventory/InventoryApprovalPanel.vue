<template>
  <section v-if="canViewApproval && hasApprovalRecord" class="inventory-approval-panel" v-loading="loading">
    <div class="approval-panel__header">
      <div>
        <h4 class="approval-panel__title">财务审核</h4>
        <p class="approval-panel__subtitle">业务单据完成后，由财务审核确认存货成本与入账凭证</p>
      </div>
      <el-button text :loading="loading" @click="loadApproval">刷新</el-button>
    </div>

    <el-steps :active="financeStepActive" finish-status="success" process-status="process" align-center>
      <el-step title="业务完成" :status="businessStepStatus">
        <template #description>
          <span>{{ approval.movement.businessApprovedBy || '未完成' }}</span>
          <small v-if="approval.movement.businessApprovedAt">{{ formatDateTime(approval.movement.businessApprovedAt) }}</small>
        </template>
      </el-step>
      <el-step :title="isReversalPending ? '反审核' : '财务审核'" :status="financeStepStatus">
        <template #description>
          <span>{{ financeStepDescription }}</span>
          <small v-if="activePosting?.financeApprovedAt">{{ formatDateTime(activePosting.financeApprovedAt) }}</small>
          <small v-else-if="activePosting?.rejectedAt">{{ formatDateTime(activePosting.rejectedAt) }}</small>
        </template>
      </el-step>
    </el-steps>

    <div v-if="approval.movement" class="approval-panel__meta">
      <el-tag :type="statusType(displayStatus)" size="small">{{ statusLabel(displayStatus) }}</el-tag>
      <span>过账号：{{ approval.movement.postingNo || '-' }}</span>
      <span v-if="approval.movement.financeApprovedLabel">财务审核人：{{ approval.movement.financeApprovedLabel }}</span>
      <span v-if="approval.movement.rejectedLabel">驳回人：{{ approval.movement.rejectedLabel }}</span>
      <span v-if="approval.movement.remark">意见：{{ approval.movement.remark }}</span>
    </div>

    <div v-if="approval.events?.length" class="approval-panel__events">
      <div class="approval-panel__events-title">审核记录</div>
      <el-timeline>
        <el-timeline-item
          v-for="event in approval.events"
          :key="`${event.postingDocumentId}-${event.createdAt}-${event.eventType}`"
          :type="eventType(event.eventType)"
          :timestamp="formatDateTime(event.createdAt)"
        >
          {{ eventLabel(event) }}
          <span v-if="event.actorLabel">，{{ event.actorLabel }}</span>
          <span v-if="event.remark">：{{ event.remark }}</span>
        </el-timeline-item>
      </el-timeline>
    </div>

    <div class="approval-panel__actions">
      <template v-if="canApprove">
        <el-button
          v-permission="'finance:inventory:approve'"
          type="success"
          :loading="actionLoading"
          :disabled="approvalSeparationBlocked"
          :title="approvalSeparationBlocked ? approvalSeparationMessage : ''"
          @click="approve"
        >
          财务审核通过
        </el-button>
        <el-button
          v-permission="'finance:inventory:approve'"
          type="danger"
          :loading="actionLoading"
          :disabled="approvalSeparationBlocked"
          :title="approvalSeparationBlocked ? approvalSeparationMessage : ''"
          @click="reject"
        >
          驳回
        </el-button>
        <span v-if="approvalSeparationBlocked" class="approval-panel__blocked-hint">
          {{ approvalSeparationMessage }}
        </span>
      </template>
      <el-button
        v-if="canReverse"
        type="warning"
        v-permission="'finance:inventory:reverse'"
        :loading="actionLoading"
        @click="reverse"
      >
        申请反审核
      </el-button>
      <el-button
        v-if="canResubmit"
        v-permission="'finance:inventory:approve'"
        type="primary"
        :loading="actionLoading"
        @click="resubmit"
      >
        重新提交审核
      </el-button>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { financeApi } from '@/api/finance'
import { useAuthStore } from '@/stores/auth'

const props = defineProps({
  sourceType: { type: String, required: true },
  sourceId: { type: [Number, String], default: null },
  sourceNo: { type: String, default: '' },
  resubmitStatus: { type: String, default: '' },
})

const emit = defineEmits(['changed', 'resubmit'])

const loading = ref(false)
const actionLoading = ref(false)
const approval = reactive({ movement: null, reversal: null, current: null, postings: [], events: [] })
const authStore = useAuthStore()
const canViewApproval = computed(() => authStore.canViewInventoryApproval)
const hasApprovalRecord = computed(() => Boolean(
  approval.current ||
  approval.movement ||
  approval.reversal ||
  approval.postings.length
))

const unwrap = (response) => response?.data ?? response ?? null
const isActiveStatus = (status) => ['pending', 'approved'].includes(status)
const normalizePosting = (row) => {
  if (!row) return null
  return {
    ...row,
    postingNo: row.postingNo ?? row.posting_no,
    sourceType: row.sourceType ?? row.source_type,
    sourceId: row.sourceId ?? row.source_id,
    sourceNo: row.sourceNo ?? row.source_no,
    postingSequence: row.postingSequence ?? row.posting_sequence,
    postingKind: row.postingKind ?? row.posting_kind,
    financeStatus: row.financeStatus ?? row.finance_status,
    businessApprovedById: row.businessApprovedById ?? row.business_approved_by_id,
    businessApprovedBy: row.businessApprovedBy ?? row.business_approved_by,
    businessApprovedAt: row.businessApprovedAt ?? row.business_approved_at,
    financeApprovedBy: row.financeApprovedBy ?? row.finance_approved_by,
    financeApprovedLabel: row.financeApprovedLabel ?? row.finance_approved_label,
    financeApprovedAt: row.financeApprovedAt ?? row.finance_approved_at,
    rejectedBy: row.rejectedBy ?? row.rejected_by,
    rejectedLabel: row.rejectedLabel ?? row.rejected_label,
    rejectedAt: row.rejectedAt ?? row.rejected_at,
    reversedBy: row.reversedBy ?? row.reversed_by,
    reversedLabel: row.reversedLabel ?? row.reversed_label,
    reversedAt: row.reversedAt ?? row.reversed_at,
  }
}
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
  if (isReversalPending.value) return 'pending'
  if (approval.reversal?.financeStatus === 'approved') return 'reversed'
  return approval.movement?.financeStatus || 'pending'
})
const canApprove = computed(
  () => authStore.canApproveInventoryApproval && activePosting.value?.financeStatus === 'pending'
)
const currentActorLabels = computed(() => [
  authStore.user?.realName,
  authStore.user?.name,
  authStore.user?.username,
].map((value) => String(value || '').trim()).filter(Boolean))
const approvalForbiddenActors = computed(() => {
  const posting = activePosting.value
  const movement = approval.movement
  const ids = [
    posting?.businessApprovedById,
    movement?.businessApprovedById,
    movement?.financeApprovedBy,
  ]
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0)
  const labels = [
    posting?.businessApprovedBy,
    movement?.businessApprovedBy,
    movement?.financeApprovedLabel,
  ].map((value) => String(value || '').trim()).filter(Boolean)
  return { ids, labels }
})
const approvalSeparationBlocked = computed(() => {
  if (!canApprove.value) return false
  const actorId = Number(authStore.user?.id || 0)
  const { ids, labels } = approvalForbiddenActors.value
  return (actorId > 0 && ids.includes(actorId)) || currentActorLabels.value.some((label) => labels.includes(label))
})
const approvalSeparationMessage = '当前用户已完成该单据的业务审核，需由其他财务审核人处理'
const canReverse = computed(() =>
  authStore.canReverseInventoryApproval &&
  approval.movement?.financeStatus === 'approved' &&
  !isActiveStatus(approval.reversal?.financeStatus)
)
const canResubmit = computed(() =>
  authStore.canApproveInventoryApproval &&
  approval.movement?.financeStatus === 'rejected' &&
  Boolean(props.resubmitStatus)
)
const financeStepActive = computed(() => (approval.movement ? 1 : 0))
const businessStepStatus = computed(() => (approval.movement ? 'success' : 'process'))
const financeStepStatus = computed(() => {
  if (!approval.movement) return 'wait'
  if (displayStatus.value === 'approved' || displayStatus.value === 'reversed') return 'success'
  if (displayStatus.value === 'rejected') return 'error'
  return 'process'
})
const financeStepDescription = computed(() => {
  if (isReversalPending.value) return '待财务审批反审核'
  if (approval.reversal?.financeStatus === 'approved') return '已完成反审核'
  if (approval.movement?.financeStatus === 'approved') return '已审核并正式入账'
  if (approval.movement?.financeStatus === 'rejected') return '已驳回，等待重新提交'
  return '待财务审核'
})

const statusLabel = (status) => ({
  pending: '待财务审核',
  approved: '财务已审核',
  rejected: '已驳回',
  reversed: '已反审核',
}[status] || status || '-')
const statusType = (status) => ({
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  reversed: 'info',
}[status] || 'info')
const formatDateTime = (value) => value ? String(value).replace('T', ' ').slice(0, 19) : ''
const eventLabel = (event) => ({
  business_approved: '业务审核完成',
  finance_approved: event.postingDocumentId === approval.reversal?.id ? '反审核通过' : '财务审核通过',
  finance_rejected: '财务审核驳回',
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
  if (!canViewApproval.value) {
    Object.assign(approval, { movement: null, reversal: null, current: null, postings: [], events: [] })
    return
  }
  if (!props.sourceType || (!props.sourceId && !props.sourceNo)) {
    Object.assign(approval, { movement: null, reversal: null, current: null, postings: [], events: [] })
    return
  }
  loading.value = true
  try {
    const response = await financeApi.inventoryPostings.getBySource({
      sourceType: props.sourceType,
      ...(props.sourceId ? { sourceId: props.sourceId } : {}),
      ...(props.sourceNo ? { sourceNo: props.sourceNo } : {}),
    })
    const payload = unwrap(response) || {}
    Object.assign(approval, {
      current: normalizePosting(payload.current),
      movement: normalizePosting(payload.movement),
      reversal: normalizePosting(payload.reversal),
      postings: (payload.postings || []).map(normalizePosting),
      events: (payload.events || []).map(normalizeEvent),
    })
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || '获取审批状态失败')
  } finally {
    loading.value = false
  }
}

async function runAction(action, postingId, message, successMessage, data) {
  actionLoading.value = true
  try {
    await action(postingId, data)
    ElMessage.success(successMessage)
    await loadApproval()
    emit('changed', approval)
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || message)
  } finally {
    actionLoading.value = false
  }
}

async function approve() {
  if (approvalSeparationBlocked.value) {
    ElMessage.warning(approvalSeparationMessage)
    return
  }
  await ElMessageBox.confirm(
    isReversalPending.value ? '确认通过反审核申请？通过后将冲销原库存流水并更新业务单据。' : '确认通过财务审核？通过后确认存货成本并正式入账。',
    '财务审核确认'
  )
  await runAction(
    financeApi.inventoryPostings.approve,
    activePosting.value.id,
    '审核失败',
    isReversalPending.value ? '反审核已通过，库存已冲销' : '财务审核通过，已确认入账'
  )
}

async function reject() {
  if (approvalSeparationBlocked.value) {
    ElMessage.warning(approvalSeparationMessage)
    return
  }
  const { value } = await ElMessageBox.prompt('请输入驳回原因', '驳回审批', {
    inputValidator: (value) => Boolean(String(value || '').trim()) || '驳回原因不能为空',
  })
  await runAction(
    financeApi.inventoryPostings.reject,
    activePosting.value.id,
    '驳回失败',
    '审批已驳回',
    { remark: value }
  )
}

async function reverse() {
  const { value } = await ElMessageBox.prompt('请输入反审核原因', '申请反审核', {
    inputValidator: (value) => Boolean(String(value || '').trim()) || '反审核原因不能为空',
  })
  await runAction(
    financeApi.inventoryPostings.reverse,
    approval.movement.id,
    '提交反审核失败',
    '反审核申请已提交',
    { remark: value }
  )
}

async function resubmit() {
  emit('resubmit', props.resubmitStatus)
}

watch(() => [props.sourceType, props.sourceId, props.sourceNo], loadApproval)
onMounted(loadApproval)
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

.approval-panel__blocked-hint {
  color: var(--el-color-warning);
  font-size: 13px;
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

.approval-panel__events {
  margin-top: 18px;
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
