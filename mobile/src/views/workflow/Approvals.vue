<!--
  我的审批 — 移动端
  对接 /api/workflow/my/pending | initiated | approve
-->
<template>
  <div class="approvals-page">
    <van-nav-bar title="我的审批" left-arrow @click-left="$router.back()" fixed placeholder />

    <van-tabs v-model:active="activeTab" sticky offset-top="46" @change="onTabChange">
      <van-tab title="待我审批" name="pending" />
      <van-tab title="我发起的" name="initiated" />
    </van-tabs>

    <van-pull-refresh v-model="refreshing" @refresh="onRefresh">
      <van-list
        v-model:loading="loading"
        :finished="finished"
        finished-text="没有更多了"
        @load="loadMore"
      >
        <van-empty v-if="!loading && list.length === 0" description="暂无数据" />

        <div
          v-for="row in list"
          :key="rowKey(row)"
          class="approval-card"
          @click="openDetail(row)"
        >
          <div class="card-title">{{ row.title || '未命名审批' }}</div>
          <div class="card-meta">
            <span>{{ btLabel[row.businessType] || row.businessType || '-' }}</span>
            <span>{{ row.businessCode || '' }}</span>
          </div>
          <div class="card-meta">
            <span v-if="activeTab === 'pending'">发起人：{{ row.initiatorName || '-' }}</span>
            <span v-else>
              状态：{{ sLabel[row.instanceStatus] || row.status || '-' }}
            </span>
          </div>
          <div v-if="activeTab === 'pending'" class="card-actions" @click.stop>
            <van-button size="small" type="success" @click="openAction(row, 'approve')">
              通过
            </van-button>
            <van-button size="small" type="danger" plain @click="openAction(row, 'reject')">
              拒绝
            </van-button>
          </div>
          <div v-else-if="canWithdraw(row)" class="card-actions" @click.stop>
            <van-button size="small" type="warning" plain @click="onWithdraw(row)">
              撤回
            </van-button>
          </div>
        </div>
      </van-list>
    </van-pull-refresh>

    <van-popup v-model:show="detailVis" position="bottom" round :style="{ height: '70%' }">
      <div class="detail-panel" v-if="detail">
        <h3>{{ detail.title || '审批详情' }}</h3>
        <van-cell title="状态" :value="sLabel[detail.status] || detail.status" />
        <van-cell title="发起人" :value="detail.initiatorName || '-'" />
        <van-cell title="单据编号" :value="detail.businessCode || '-'" />
        <van-cell title="业务类型" :value="btLabel[detail.businessType] || detail.businessType" />
        <div class="nodes-title">审批节点</div>
        <van-steps direction="vertical" :active="activeNodeIndex">
          <van-step v-for="node in detail.nodes || []" :key="node.id">
            <h4>{{ node.nodeName || '节点' }}</h4>
            <p>{{ nLabel[node.status] || node.status }} · {{ node.approverName || '' }}</p>
            <p v-for="item in node.approvers || []" :key="item.id" class="comment">
              {{ item.approverName || item.approverId }} · {{ nLabel[item.status] || item.status }}
              <span v-if="item.comment"> · {{ item.comment }}</span>
            </p>
            <p v-if="node.comment" class="comment">{{ node.comment }}</p>
          </van-step>
        </van-steps>
      </div>
    </van-popup>

    <van-dialog
      v-model:show="actionVis"
      :title="actionType === 'approve' ? '审批通过' : '审批拒绝'"
      show-cancel-button
      :before-close="onSubmitAction"
    >
      <van-field
        v-model="comment"
        rows="3"
        autosize
        type="textarea"
        placeholder="审批意见（可选）"
      />
    </van-dialog>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { showToast, showSuccessToast, showConfirmDialog } from 'vant'
import { workflowApi } from '@/api/modules/workflow'

const activeTab = ref('pending')
const list = ref([])
const loading = ref(false)
const finished = ref(false)
const refreshing = ref(false)
const page = ref(1)
const pageSize = 20

const detailVis = ref(false)
const detail = ref(null)
const actionVis = ref(false)
const actionType = ref('approve')
const actionRow = ref(null)
const comment = ref('')
const saving = ref(false)

const btLabel = {
  purchase_order: '采购订单',
  purchase_requisition: '采购请购',
  expense: '费用报销',
  scrap: '报废审批',
  leave: '请假',
  hr_leave: '请假',
  hr_overtime: '加班',
  sales_order: '销售订单',
  sales_return: '销售退货',
  contract: '合同',
  ecn: '工程变更',
  production_plan: '生产计划',
  overtime: '加班',
}

const sLabel = {
  running: '进行中',
  in_progress: '审批中',
  approved: '已通过',
  rejected: '已拒绝',
  withdrawn: '已撤回',
  cancelled: '已取消',
  completed: '已完成',
  pending: '待处理',
}

const nLabel = {
  waiting: '等待前序',
  pending: '待处理',
  in_progress: '审批中',
  approved: '已通过',
  rejected: '已拒绝',
  skipped: '已跳过',
  timeout: '已超时',
}

const activeNodeIndex = computed(() => {
  const nodes = detail.value?.nodes || []
  const idx = nodes.findIndex((n) => n.status === 'in_progress')
  return idx >= 0 ? idx : Math.max(0, nodes.length - 1)
})

/**
 * pending 列表来自 workflow_instance_nodes：row.id = nodeId，row.instanceId = 实例
 * initiated 列表来自 workflow_instances：row.id = 实例 id
 */
function instanceIdOf(row) {
  if (!row) return null
  if (activeTab.value === 'pending') return row.instanceId || null
  return row.id || row.instanceId || null
}

function nodeIdOf(row) {
  if (!row) return null
  // 与 PC WorkflowApprovalCenter 一致：待审行 id 即节点 id
  return row.nodeId || row.id || row.currentNodeId || null
}

function rowKey(row) {
  if (activeTab.value === 'pending') {
    return `n-${row.id || row.nodeId}-${row.instanceId || ''}`
  }
  return `i-${row.id || row.instanceId}`
}

function canWithdraw(row) {
  const st = row.status || row.instanceStatus
  return st === 'running' || st === 'pending' || st === 'in_progress'
}

function extractList(body) {
  // mobile client 已解包 ResponseHandler → res.data = { list, total, ... }
  const data = body?.data ?? body
  if (Array.isArray(data)) return { items: data, total: data.length }
  return {
    items: data?.list || data?.items || data?.rows || [],
    total: data?.total ?? 0,
  }
}

async function fetchPage(reset = false) {
  if (reset) {
    page.value = 1
    finished.value = false
    list.value = []
  }
  loading.value = true
  try {
    const params = { page: page.value, pageSize }
    const res =
      activeTab.value === 'pending'
        ? await workflowApi.getMyPending(params)
        : await workflowApi.getMyInitiated(params)
    const { items } = extractList(res.data)
    if (reset) list.value = items
    else list.value = list.value.concat(items)
    if (items.length < pageSize) finished.value = true
    else page.value += 1
  } catch (e) {
    showToast(e?.message || '加载失败')
    finished.value = true
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

function loadMore() {
  if (finished.value) return
  fetchPage(false)
}

function onRefresh() {
  fetchPage(true)
}

function onTabChange() {
  fetchPage(true)
}

async function openDetail(row) {
  const instanceId = instanceIdOf(row)
  if (!instanceId) return
  try {
    const res = await workflowApi.getInstanceById(instanceId)
    // client 已解包，res.data 即为实例对象
    detail.value = res.data?.data || res.data
    detailVis.value = true
  } catch (e) {
    showToast(e?.message || '加载详情失败')
  }
}

function openAction(row, type) {
  actionRow.value = row
  actionType.value = type
  comment.value = ''
  actionVis.value = true
}

async function onSubmitAction(action) {
  if (action === 'cancel') return true
  if (saving.value) return false
  const row = actionRow.value
  if (!row) return true
  const instanceId = instanceIdOf(row)
  const nodeId = nodeIdOf(row)
  if (!instanceId || !nodeId) {
    showToast('缺少审批节点信息')
    return false
  }
  saving.value = true
  try {
    await workflowApi.approveNode(instanceId, {
      action: actionType.value === 'approve' ? 'approve' : 'reject',
      comment: comment.value || undefined,
      nodeId,
    })
    showSuccessToast(actionType.value === 'approve' ? '已通过' : '已拒绝')
    actionVis.value = false
    await fetchPage(true)
    return true
  } catch (e) {
    showToast(e?.response?.data?.message || e?.message || '提交失败')
    return false
  } finally {
    saving.value = false
  }
}

async function onWithdraw(row) {
  try {
    await showConfirmDialog({ title: '确认撤回', message: '撤回后需重新发起审批' })
    const instanceId = instanceIdOf(row)
    if (!instanceId) {
      showToast('缺少实例信息')
      return
    }
    await workflowApi.withdrawWorkflow(instanceId)
    showSuccessToast('已撤回')
    await fetchPage(true)
  } catch (e) {
    if (e !== 'cancel') showToast(e?.message || '撤回失败')
  }
}
</script>

<style scoped>
.approvals-page {
  min-height: 100vh;
  background: var(--bg-primary, #f5f6f8);
  padding-bottom: 24px;
}
.approval-card {
  margin: 10px 12px;
  padding: 12px 14px;
  background: var(--bg-secondary, #fff);
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}
.card-title {
  font-weight: 600;
  font-size: 15px;
  margin-bottom: 6px;
  color: var(--text-primary, #1a1a1a);
}
.card-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-secondary, #888);
  margin-top: 4px;
}
.card-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  justify-content: flex-end;
}
.detail-panel {
  padding: 16px;
}
.detail-panel h3 {
  margin: 0 0 12px;
  font-size: 16px;
}
.nodes-title {
  margin: 16px 0 8px;
  font-weight: 600;
}
.comment {
  color: #666;
  font-size: 12px;
}
</style>
