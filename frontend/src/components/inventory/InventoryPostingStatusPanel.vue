<template>
  <section v-if="showPanel" v-loading="loading" class="inventory-posting-status-panel">
    <div class="posting-status__header">
      <div>
        <h4>存货过账记录</h4>
        <p>查看来源单据的过账状态与处理记录，审核操作在存货过账工作台完成。</p>
      </div>
      <el-button text :loading="loading" @click="refresh">刷新</el-button>
    </div>

    <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon />
    <template v-else-if="approval.movement">
      <div class="posting-status__meta">
        <el-tag :type="statusType(displayStatus)" size="small">{{ statusLabel(displayStatus) }}</el-tag>
        <span>过账号：{{ activePosting?.postingNo || '-' }}</span>
        <span v-if="approval.movement.sourceType === 'outbound_supplement'">补发单号：{{ approval.movement.sourceNo }}</span>
        <span v-if="outboundPendingCount > 1">待审核：{{ outboundPendingCount }} 笔（含补发）</span>
        <span v-if="approval.movement.businessApprovedBy">业务完成人：{{ approval.movement.businessApprovedBy }}</span>
        <span v-if="approval.movement.businessApprovedAt">业务完成时间：{{ formatDateTime(approval.movement.businessApprovedAt) }}</span>
        <span v-if="activePosting?.financeApprovedLabel">财务审核人：{{ activePosting.financeApprovedLabel }}</span>
        <span v-if="activePosting?.financeApprovedAt">财务审核时间：{{ formatDateTime(activePosting.financeApprovedAt) }}</span>
        <span v-if="activePosting?.rejectedLabel">驳回人：{{ activePosting.rejectedLabel }}</span>
        <span v-if="activePosting?.remark">意见：{{ activePosting.remark }}</span>
      </div>

      <div v-if="approval.events.length" class="posting-status__events">
        <el-timeline>
          <el-timeline-item
            v-for="event in approval.events"
            :key="event.id || `${event.postingDocumentId}-${event.createdAt}-${event.eventType}`"
            :type="eventType(event.eventType)"
            :timestamp="formatDateTime(event.createdAt)"
          >
            {{ eventLabel(event) }}
            <span v-if="event.actorLabel">，{{ event.actorLabel }}</span>
            <span v-if="event.remark">：{{ event.remark }}</span>
          </el-timeline-item>
        </el-timeline>
      </div>
      <div class="posting-status__actions">
        <el-button type="primary" @click="openWorkbench">查看存货过账</el-button>
      </div>
    </template>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { financeApi } from '@/api/finance'
import { useAuthStore } from '@/stores/auth'
import { getApiErrorMessage } from '@/utils/errorHandler'

const props = defineProps({
  sourceType: { type: String, required: true },
  sourceId: { type: [Number, String], default: null },
  sourceNo: { type: String, default: '' },
})
const emit = defineEmits(['loaded'])
const router = useRouter()
const authStore = useAuthStore()
const loading = ref(false)
const loadError = ref('')
const emptyApproval = () => ({ movement: null, reversal: null, postings: [], events: [] })
const approval = reactive(emptyApproval())
let requestSequence = 0

const normalizePosting = (row) => row ? {
  ...row,
  postingNo: row.postingNo ?? row.posting_no,
  sourceType: row.sourceType ?? row.source_type,
  sourceId: row.sourceId ?? row.source_id,
  sourceNo: row.sourceNo ?? row.source_no,
  postingSequence: row.postingSequence ?? row.posting_sequence,
  postingKind: row.postingKind ?? row.posting_kind,
  financeStatus: row.financeStatus ?? row.finance_status,
  businessApprovedBy: row.businessApprovedBy ?? row.business_approved_by,
  businessApprovedAt: row.businessApprovedAt ?? row.business_approved_at,
  financeApprovedLabel: row.financeApprovedLabel ?? row.finance_approved_label,
  financeApprovedAt: row.financeApprovedAt ?? row.finance_approved_at,
  rejectedLabel: row.rejectedLabel ?? row.rejected_label,
} : null
const normalizeEvent = (row) => ({
  ...row,
  postingDocumentId: row.postingDocumentId ?? row.posting_document_id,
  eventType: row.eventType ?? row.event_type,
  actorLabel: row.actorLabel ?? row.actor_label,
  createdAt: row.createdAt ?? row.created_at,
})

const activePosting = computed(() =>
  ['pending', 'approved'].includes(approval.reversal?.financeStatus)
    ? approval.reversal
    : approval.movement
)
const displayStatus = computed(() => {
  if (approval.reversal?.financeStatus === 'pending') return 'reversal_pending'
  if (approval.reversal?.financeStatus === 'approved') return 'reversed'
  return approval.movement?.financeStatus || 'pending'
})
const showPanel = computed(() => authStore.canViewInventoryApproval &&
  Boolean(approval.movement || loading.value || loadError.value))
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
const statusLabel = (status) => ({
  pending: '待财务审核', approved: '已审核', rejected: '已驳回', reversed: '已冲销',
  reversal_pending: '冲销待审核',
}[status] || status || '-')
const statusType = (status) => ({
  pending: 'warning', approved: 'success', rejected: 'danger', reversed: 'info',
  reversal_pending: 'warning',
}[status] || 'info')
const formatDateTime = (value) => value ? String(value).replace('T', ' ').slice(0, 19) : ''
const eventLabel = (event) => ({
  business_approved: '业务审核完成',
  finance_approved: event.postingDocumentId === approval.reversal?.id ? '冲销审核通过' : '财务审核通过',
  finance_rejected: '财务审核驳回',
  reversal_requested: '提交冲销申请',
  finance_reversed: '原库存过账已冲销',
}[event.eventType] || event.eventType || '过账状态变更')
const eventType = (type) => ({
  business_approved: 'primary', finance_approved: 'success', finance_rejected: 'danger',
  reversal_requested: 'warning', finance_reversed: 'info',
}[type] || 'primary')

async function refresh() {
  const request = ++requestSequence
  Object.assign(approval, emptyApproval())
  loadError.value = ''
  emit('loaded', null)
  if (!authStore.canViewInventoryApproval || !props.sourceType || (!props.sourceId && !props.sourceNo)) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    const response = await financeApi.inventoryPostings.getBySource({
      sourceType: props.sourceType,
      ...(props.sourceId ? { sourceId: props.sourceId } : {}),
      ...(props.sourceNo ? { sourceNo: props.sourceNo } : {}),
    })
    if (request !== requestSequence) return
    const payload = response?.data ?? response ?? {}
    Object.assign(approval, {
      movement: normalizePosting(payload.movement),
      reversal: normalizePosting(payload.reversal),
      postings: (payload.postings || []).map(normalizePosting),
      events: (payload.events || []).map(normalizeEvent),
    })
    emit('loaded', approval.movement?.financeStatus || null)
  } catch (error) {
    if (request === requestSequence) loadError.value = getApiErrorMessage(error, '获取存货过账记录失败')
  } finally {
    if (request === requestSequence) loading.value = false
  }
}

function openWorkbench() {
  if (!authStore.canViewInventoryApproval || !activePosting.value) return
  router.push({
    name: 'finance-inventory-postings',
    query: {
      sourceType: props.sourceType,
      ...(props.sourceId ? { sourceId: String(props.sourceId) } : {}),
      ...(props.sourceNo ? { sourceNo: props.sourceNo } : {}),
      postingId: String(activePosting.value.id),
    },
  })
}

watch(() => [props.sourceType, props.sourceId, props.sourceNo, authStore.canViewInventoryApproval], refresh, { immediate: true })
onBeforeUnmount(() => { requestSequence += 1 })
defineExpose({ refresh })
</script>

<style scoped>
.inventory-posting-status-panel { margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--el-border-color-lighter); }
.posting-status__header, .posting-status__meta, .posting-status__actions { display: flex; align-items: center; gap: 12px; }
.posting-status__header { justify-content: space-between; margin-bottom: 16px; }
.posting-status__header h4 { margin: 0; font-size: 16px; color: var(--el-text-color-primary); }
.posting-status__header p { margin: 4px 0 0; color: var(--el-text-color-secondary); font-size: 13px; }
.posting-status__meta { flex-wrap: wrap; color: var(--el-text-color-regular); font-size: 13px; }
.posting-status__events { margin-top: 18px; }
.posting-status__events :deep(.el-timeline) { margin: 0; padding-left: 4px; }
.posting-status__actions { justify-content: flex-end; margin-top: 16px; }
</style>
