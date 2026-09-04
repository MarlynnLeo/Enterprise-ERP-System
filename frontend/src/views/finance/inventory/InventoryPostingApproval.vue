<template>
  <section class="inventory-posting-page">
    <div class="page-header">
      <div><h1>库存过账审核</h1><p>财务审核后正式锁定库存数量与成本；反审核申请仍需财务复核</p></div>
    </div>

    <div class="toolbar">
      <el-select v-model="filters.financeStatus" clearable placeholder="全部状态" @change="loadList">
        <el-option label="待审核" value="pending" />
        <el-option label="已通过" value="approved" />
        <el-option label="已驳回" value="rejected" />
        <el-option label="已反审核" value="reversed" />
      </el-select>
      <el-input v-model="filters.keyword" clearable placeholder="过账号 / 来源单号" @keyup.enter="loadList" />
      <el-button :icon="Refresh" @click="loadList">刷新</el-button>
    </div>

    <el-table v-loading="loading" :data="rows" border stripe>
      <el-table-column prop="postingNo" label="过账号" min-width="190" />
      <el-table-column prop="sourceType" label="来源类型" min-width="150" />
      <el-table-column prop="sourceNo" label="来源单号" min-width="170" />
      <el-table-column prop="transactionDate" label="交易日期" width="120" />
      <el-table-column prop="financeStatus" label="财务状态" width="110">
        <template #default="{ row }">
          <el-tag :type="statusType(row.financeStatus)">{{ statusLabel(row.financeStatus) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="lineCount" label="明细" width="75" />
      <el-table-column prop="businessApprovedBy" label="业务审核人" min-width="120" />
      <el-table-column prop="financeApprovedLabel" label="财务审核人" min-width="120" />
      <el-table-column label="操作" fixed="right" width="220">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">详情</el-button>
          <el-button v-if="row.financeStatus === 'pending'" v-permission="'finance:inventory:approve'" link type="success" @click="approve(row)">通过</el-button>
          <el-button v-if="row.financeStatus === 'pending'" v-permission="'finance:inventory:approve'" link type="danger" @click="reject(row)">驳回</el-button>
          <el-button v-if="row.financeStatus === 'approved' && row.postingKind !== 'reversal'" v-permission="'finance:inventory:reverse'" link type="warning" @click="reverse(row)">申请反审核</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="pagination.page"
      v-model:page-size="pagination.pageSize"
      :total="pagination.total"
      layout="total, sizes, prev, pager, next"
      @current-change="loadList"
      @size-change="loadList"
    />

    <AppDialog v-model="detailVisible" mode="view" title="库存过账详情" width="980px">
      <template v-if="detail">
        <el-descriptions :column="3" border>
          <el-descriptions-item label="过账号">{{ detail.postingNo }}</el-descriptions-item>
          <el-descriptions-item label="来源单号">{{ detail.sourceNo }}</el-descriptions-item>
          <el-descriptions-item label="财务状态">{{ statusLabel(detail.financeStatus) }}</el-descriptions-item>
          <el-descriptions-item label="快照哈希" :span="3">{{ detail.snapshotHash || '-' }}</el-descriptions-item>
        </el-descriptions>
        <el-table :data="detail.lines || []" border size="small" class="detail-table">
          <el-table-column prop="lineNo" label="#" width="55" />
          <el-table-column prop="materialId" label="物料" width="80" />
          <el-table-column prop="locationId" label="库位" width="80" />
          <el-table-column prop="signedQuantity" label="数量" width="100" />
          <el-table-column prop="unitCost" label="单位成本" width="110" />
          <el-table-column prop="batchNumber" label="批次" min-width="160" />
          <el-table-column prop="snapshotHash" label="明细哈希" min-width="220" />
        </el-table>
      </template>
    </AppDialog>
  </section>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index'
import { ElMessageBox } from 'element-plus/es/components/message-box/index'
import { Refresh } from '@element-plus/icons-vue'
import { financeApi } from '@/api/finance'
import AppDialog from '@/components/ui/AppDialog.vue'

const loading = ref(false)
const rows = ref([])
const detail = ref(null)
const detailVisible = ref(false)
const filters = reactive({ financeStatus: 'pending', keyword: '' })
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

const statusLabel = (value) => ({ pending: '待审核', approved: '已通过', rejected: '已驳回', reversed: '已反审核' }[value] || value || '-')
const statusType = (value) => ({ pending: 'warning', approved: 'success', rejected: 'danger', reversed: 'info' }[value] || '')

async function loadList() {
  loading.value = true
  try {
    const response = await financeApi.inventoryPostings.list({ ...filters, page: pagination.page, pageSize: pagination.pageSize })
    const data = response.data || response
    rows.value = data.list || data.items || []
    pagination.total = Number(data.total || 0)
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '获取库存过账列表失败')
  } finally {
    loading.value = false
  }
}

async function openDetail(row) {
  try {
    const response = await financeApi.inventoryPostings.get(row.id)
    detail.value = response.data || response
    detailVisible.value = true
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '获取详情失败')
  }
}

async function approve(row) {
  await ElMessageBox.confirm(`确认审核过账 ${row.sourceNo}？审核后库存数量和成本将正式锁定。`, '审核确认')
  await financeApi.inventoryPostings.approve(row.id)
  ElMessage.success('财务审核通过，库存已正式入账')
  await loadList()
}

async function reject(row) {
  const { value } = await ElMessageBox.prompt('请输入驳回原因', '驳回过账', { inputValidator: (v) => Boolean(String(v || '').trim()) || '驳回原因不能为空' })
  await financeApi.inventoryPostings.reject(row.id, { remark: value })
  ElMessage.success('过账已驳回')
  await loadList()
}

async function reverse(row) {
  const { value } = await ElMessageBox.prompt('请输入反审核原因', '反审核确认', { inputValidator: (v) => Boolean(String(v || '').trim()) || '反审核原因不能为空' })
  await financeApi.inventoryPostings.reverse(row.id, { remark: value })
  ElMessage.success('已提交反审核申请，待财务审批后正式冲销')
  await loadList()
}

onMounted(loadList)
</script>

<style scoped>
.inventory-posting-page { padding: 20px; }
.toolbar { display: flex; gap: 12px; margin: 16px 0; }
.toolbar .el-input { width: 260px; }
.el-pagination { margin-top: 16px; justify-content: flex-end; }
.detail-table { margin-top: 18px; }
</style>
