<template>
  <div class="module-page page-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>我的审批</h2>
          <p class="subtitle">查看我发起的流程，并处理分配给我的审批节点</p>
        </div>
        <div class="operation-btns">
          <el-radio-group v-model="activeTab" @change="onTabChange">
            <el-radio-button value="pending">待我审批</el-radio-button>
            <el-radio-button value="initiated">我发起的</el-radio-button>
          </el-radio-group>
        </div>
      </div>
    </el-card>

    <el-card class="data-card">
      <el-table :data="tableData" v-loading="loading" border stripe>
        <el-table-column prop="title" label="审批标题" min-width="220" show-overflow-tooltip />
        <el-table-column prop="business_type" label="业务类型" width="120">
          <template #default="{ row }">{{ btLabel[row.business_type] || row.business_type }}</template>
        </el-table-column>
        <el-table-column prop="business_code" label="单据编号" width="170" show-overflow-tooltip />
        <el-table-column v-if="activeTab === 'pending'" prop="initiator_name" label="发起人" width="110" />
        <el-table-column v-if="activeTab === 'pending'" label="当前节点" width="130">
          <template #default="{ row }">{{ row.node_name || '未命名节点' }}</template>
        </el-table-column>
        <el-table-column v-if="activeTab === 'initiated'" prop="status" label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="sTag[row.status || row.instance_status] || 'info'" size="small">
              {{ sLabel[row.status || row.instance_status] || row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="{ row }">
            <el-button link type="primary" @click="viewInstance(row)">详情</el-button>
            <template v-if="activeTab === 'pending'">
              <el-button type="success" size="small" @click="openApproval(row, 'approve')">通过</el-button>
              <el-button type="danger" size="small" @click="openApproval(row, 'reject')">拒绝</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-container">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          @change="fetchData"
        />
      </div>
    </el-card>

    <el-dialog v-model="detailVis" title="审批详情" width="650px" destroy-on-close>
      <template v-if="detail">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="标题">{{ detail.title }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="sTag[detail.status] || 'info'">{{ sLabel[detail.status] || detail.status }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="发起人">{{ detail.initiator_name }}</el-descriptions-item>
          <el-descriptions-item label="单据编号">{{ detail.business_code }}</el-descriptions-item>
        </el-descriptions>
        <h4 class="details-title">审批节点</h4>
        <el-timeline>
          <el-timeline-item
            v-for="node in (detail.nodes || [])"
            :key="node.id"
            :type="node.status === 'approved' ? 'success' : node.status === 'rejected' ? 'danger' : node.status === 'in_progress' ? 'primary' : 'info'"
            :hollow="node.status === 'pending'"
          >
            <strong>{{ node.node_name || '未命名节点' }}</strong>
            <el-tag :type="sTag[node.status] || 'info'" size="small" class="node-status">
              {{ nLabel[node.status] || node.status || '待配置' }}
            </el-tag>
            <div v-if="node.approver_name" class="node-meta">{{ node.approver_name }} {{ node.acted_at || '' }}</div>
            <div v-if="node.comment" class="node-comment">{{ node.comment }}</div>
          </el-timeline-item>
        </el-timeline>
      </template>
    </el-dialog>

    <el-dialog v-model="approvalVis" :title="approvalAct === 'approve' ? '审批通过' : '审批拒绝'" width="420px">
      <el-input v-model="approvalComment" type="textarea" :rows="3" placeholder="审批意见" />
      <template #footer>
        <el-button @click="approvalVis = false">取消</el-button>
        <el-button :type="approvalAct === 'approve' ? 'success' : 'danger'" @click="submitApproval" :loading="saving">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { workflowApi } from '@/api/workflow'

const activeTab = ref('pending')
const loading = ref(false)
const saving = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const tableData = ref([])
const detailVis = ref(false)
const detail = ref(null)
const approvalVis = ref(false)
const approvalAct = ref('approve')
const approvalComment = ref('')
const approvalRow = ref(null)

const btLabel = {
  purchase_order: '采购订单',
  purchase_requisition: '采购请购',
  expense: '费用报销',
  scrap: '报废审批',
  leave: '请假',
  hr_leave: '请假',
  hr_overtime: '加班',
  sales_order: '销售订单',
  contract: '合同',
  ecn: '工程变更',
  production_plan: '生产计划'
}
const sLabel = { pending: '待审批', in_progress: '审批中', approved: '已通过', rejected: '已拒绝', cancelled: '已取消', withdrawn: '已撤回' }
const sTag = { pending: 'info', in_progress: 'warning', approved: 'success', rejected: 'danger', cancelled: 'info', withdrawn: 'info' }
const nLabel = { pending: '待审批', in_progress: '审批中', approved: '已通过', rejected: '已拒绝', skipped: '已跳过', timeout: '已超时' }

const fetchData = async () => {
  loading.value = true
  try {
    const params = { page: page.value, pageSize: pageSize.value }
    const res = activeTab.value === 'initiated'
      ? await workflowApi.getMyInitiated(params)
      : await workflowApi.getMyPending(params)
    const data = res.data || res
    tableData.value = data.list || []
    total.value = data.total || 0
  } catch {
    ElMessage.error('加载审批列表失败')
  } finally {
    loading.value = false
  }
}

const onTabChange = () => {
  page.value = 1
  fetchData()
}

const viewInstance = async (row) => {
  try {
    const res = await workflowApi.getInstanceById(row.instance_id || row.id)
    detail.value = res.data || res
    detailVis.value = true
  } catch {
    ElMessage.error('获取详情失败')
  }
}

const openApproval = (row, action) => {
  approvalRow.value = row
  approvalAct.value = action
  approvalComment.value = ''
  approvalVis.value = true
}

const submitApproval = async () => {
  if (!approvalRow.value) return
  saving.value = true
  try {
    await workflowApi.approveNode(approvalRow.value.instance_id, {
      node_id: approvalRow.value.id,
      action: approvalAct.value,
      comment: approvalComment.value
    })
    ElMessage.success(approvalAct.value === 'approve' ? '已通过' : '已拒绝')
    approvalVis.value = false
    fetchData()
  } catch (error) {
    ElMessage.error(error.message || '操作失败')
  } finally {
    saving.value = false
  }
}

onMounted(fetchData)
</script>

<style scoped>
.node-status {
  margin-left: 8px;
}

.node-meta {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.node-comment {
  color: var(--color-text-placeholder);
  font-size: 12px;
}
</style>
