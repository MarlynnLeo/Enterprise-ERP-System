<template>
  <div class="module-page page-container">
    <!-- 页面头部卡片 -->
    <PageHeader title="合同管理" subtitle="管理采购、销售、服务等合同的全生命周期">
      <template #actions>
<el-button type="primary" v-permission="'contract:create'" @click="openForm()">新建合同</el-button>
      </template>
    </PageHeader>

    <!-- 搜索区域 -->
    <FinanceQueryCard
      @search="fetchList"
      @reset="resetSearch"
    >
      <template #basic>
        <el-form-item label="合同名称">
          <el-input v-model="keyword" placeholder="合同名称" clearable @keyup.enter="fetchList" />
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item label="类型">
          <el-select v-model="filterType" placeholder="全部" clearable @change="fetchList">
            <el-option
              v-for="opt in CONTRACT_TYPE_OPTIONS"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filterStatus" placeholder="全部" clearable @change="fetchList">
            <el-option
              v-for="opt in CONTRACT_STATUS_OPTIONS"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
      </template>
    </FinanceQueryCard>

    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table :data="tableData" v-loading="loading" border stripe class="table-row-click w-full"
      @row-click="(row, column, event) => handleTableRowView(row, column, event, () => viewDetail(row))">
      <el-table-column prop="code" label="合同编号" width="160" />
      <el-table-column prop="name" label="合同名称" min-width="200" show-overflow-tooltip />
      <el-table-column prop="type" label="类型" width="100">
        <template #default="{ row }">
          <el-tag :type="getContractTypeColor(row.type)" size="small">{{ getContractTypeText(row.type) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="getContractStatusColor(row.status)" size="small">{{ getContractStatusText(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="partyB" label="对方单位" min-width="160" show-overflow-tooltip />
      <el-table-column prop="totalAmount" label="金额" width="130">
        <template #default="{ row }">{{ formatAmount(row.totalAmount) }}</template>
      </el-table-column>
      <el-table-column prop="effectiveDate" label="生效日期" width="110" />
      <el-table-column prop="expiryDate" label="到期日期" width="110" />
      <el-table-column label="操作" min-width="300" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header"
      >
        <template #default="{ row }">
          <el-button v-if="row.status === 'draft'" type="success" size="small" v-permission="'contract:edit'" @click="submitContract(row)">
            提交审批
          </el-button>
          <el-button v-if="row.status === 'pending_approval'" type="warning" size="small" v-permission="'contract:approve'" @click="openApprovalDialog(row)">
            审批
          </el-button>
          <el-button v-if="row.status === 'draft'" type="primary" size="small" v-permission="'contract:edit'" @click="openForm(row)">
            <el-icon><Edit /></el-icon> 编辑
          </el-button>
          <el-popconfirm title="确定删除此合同？" @confirm="handleDelete(row.id)">
            <template #reference>
              <el-button type="danger" size="small" v-permission="'contract:delete'">
                <el-icon><Delete /></el-icon> 删除
              </el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

      <div class="pagination-container">
        <el-pagination v-model:current-page="page" v-model:page-size="pageSize"
          :total="total" :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next" @change="fetchList" />
      </div>
    </el-card>

    <!-- 合同表单对话框 -->
    <AppDialog
      v-model="formVisible"
      :title="formData.id ? '编辑合同' : '新建合同'"
      mode="form"
      width="800px"
    >
      <el-form :model="formData" label-width="100px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="合同名称" required>
              <el-input v-model="formData.name" placeholder="请输入合同名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="合同类型" required>
              <el-select v-model="formData.type" class="w-full">
                <el-option label="采购合同" value="purchase" />
                <el-option label="销售合同" value="sales" />
                <el-option label="服务合同" value="service" />
                <el-option label="其他" value="other" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="甲方" required>
              <el-input v-model="formData.partyA" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="乙方" required>
              <el-input v-model="formData.partyB" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="合同金额">
              <el-input-number v-model="formData.totalAmount" :min="0" :precision="2" class="w-full" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="生效日期">
              <el-date-picker v-model="formData.effectiveDate" type="date" value-format="YYYY-MM-DD" class="w-full" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="到期日期">
              <el-date-picker v-model="formData.expiryDate" type="date" value-format="YYYY-MM-DD" class="w-full" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="付款条件">
          <el-input v-model="formData.paymentTerms" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="合同摘要">
          <el-input v-model="formData.content" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" v-permission="formData.id ? 'contract:edit' : 'contract:create'" @click="handleSave" :loading="saving">保存</el-button>
      </template>
        </AppDialog>

    <!-- 合同详情对话框 -->
    <AppDialog
      v-model="detailVisible"
      title="合同详情"
      mode="view"
      content-width="wide"
      :detail-navigation="contractViewNavigation"
    >
      <template v-if="detailData">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="合同编号">{{ detailData.code }}</el-descriptions-item>
          <el-descriptions-item label="合同名称">{{ detailData.name }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ getContractTypeText(detailData.type) }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getContractStatusColor(detailData.status)">{{ getContractStatusText(detailData.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="甲方">{{ detailData.partyA }}</el-descriptions-item>
          <el-descriptions-item label="乙方">{{ detailData.partyB }}</el-descriptions-item>
          <el-descriptions-item label="合同金额">{{ formatAmount(detailData.totalAmount) }}</el-descriptions-item>
          <el-descriptions-item label="执行进度">{{ detailData.executionRate }}%</el-descriptions-item>
          <el-descriptions-item label="生效日期">{{ detailData.effectiveDate || '--' }}</el-descriptions-item>
          <el-descriptions-item label="到期日期">{{ detailData.expiryDate || '--' }}</el-descriptions-item>
        </el-descriptions>

        <h4 style="margin:16px 0 8px">合同明细</h4>
        <el-table :data="detailData.items || []" border size="small" max-height="200">
          <el-table-column prop="materialName" label="物料名称" />
          <el-table-column prop="specification" label="规格" />
          <el-table-column prop="quantity" label="数量" width="80" />
          <el-table-column prop="unitPrice" label="单价" width="100" />
          <el-table-column prop="amount" label="金额" width="120" />
        </el-table>

        <h4 style="margin:16px 0 8px">执行记录</h4>
        <el-table :data="detailData.executions || []" border size="small" max-height="200">
          <el-table-column prop="executionType" label="类型" width="100" />
          <el-table-column prop="businessCode" label="单据编号" />
          <el-table-column prop="amount" label="金额" width="120" />
          <el-table-column prop="executedAt" label="时间" width="160" />
        </el-table>

        <h4 style="margin:16px 0 8px">关联单据</h4>
        <el-table :data="detailData.documentLinks || []" border size="small" max-height="200">
          <el-table-column prop="relatedTypeLabel" label="关联类型" width="120" />
          <el-table-column prop="relatedCode" label="单据编号" />
          <el-table-column prop="direction" label="方向" width="80">
            <template #default="{ row }">{{ row.direction === 'forward' ? '→ 下游' : '← 上游' }}</template>
          </el-table-column>
        </el-table>
      </template>
    </AppDialog>
    <BusinessApprovalDialog
      v-model="approvalDialog.visible"
      title="审批合同"
      :loading="approvalDialog.loading"
      v-model:comment="approvalDialog.comment"
      :summary-items="contractApprovalSummary"
      @approve="handleApproval('approve')"
      @reject="handleApproval('reject')"
    />
  </div>
</template>

<script setup>
import { handleTableRowView } from '@/utils/tableRowView'
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Edit, Delete } from '@element-plus/icons-vue'
import { contractApi } from '@/api/contract'
import BusinessApprovalDialog from '@/components/workflow/BusinessApprovalDialog.vue'
import { useBusinessApproval } from '@/composables/useBusinessApproval'
import { useListDetailNavigation } from '@/composables/useListDetailNavigation'
import {
  getContractStatusText,
  getContractStatusColor,
  getContractTypeText,
  getContractTypeColor,
  CONTRACT_STATUS_OPTIONS,
  CONTRACT_TYPE_OPTIONS
} from '@/constants/systemConstants'

const loading = ref(false)
const saving = ref(false)
const keyword = ref('')
const filterType = ref('')
const filterStatus = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const tableData = ref([])
const {
  previousItem: previousViewContract,
  nextItem: nextViewContract,
  hasPrevious: hasPreviousViewContract,
  hasNext: hasNextViewContract,
  setCurrentItem: setCurrentViewContract
} = useListDetailNavigation(tableData)
const formVisible = ref(false)
const detailVisible = ref(false)
const formData = ref({})
const detailData = ref(null)
const detailLoading = ref(false)

const formatAmount = (v) => v != null ? Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : '--'

const { approvalDialog, openApprovalDialog, handleApproval } = useBusinessApproval({
  businessType: 'contract',
  onSuccess: () => fetchList()
})
const contractApprovalSummary = computed(() => {
  const row = approvalDialog.row || {}
  return [
    { label: '合同编号', value: row.code || '-' },
    { label: '合同名称', value: row.name || '-' },
    { label: '对方单位', value: row.partyB || '-' }
  ]
})
const submitContract = async (row) => {
  try {
    await contractApi.updateStatus(row.id, 'pending_approval')
    ElMessage.success('已提交审批')
    fetchList()
  } catch (error) {
    ElMessage.error(error.response?.data?.message || error.message || '提交审批失败')
  }
}
const fetchList = async () => {
  loading.value = true
  try {
    const res = await contractApi.getList({ keyword: keyword.value, type: filterType.value, status: filterStatus.value, page: page.value, pageSize: pageSize.value })
    const d = res.data || res
    tableData.value = d.list || []
    total.value = d.total || 0
  } catch { ElMessage.error('获取合同列表失败') }
  finally { loading.value = false }
}

const resetSearch = () => {
  keyword.value = ''
  filterType.value = ''
  filterStatus.value = ''
  page.value = 1
  fetchList()
}

const openForm = (row) => {
  formData.value = row ? { ...row } : { type: 'purchase', total_amount: 0 }
  formVisible.value = true
}

const handleSave = async () => {
  saving.value = true
  try {
    if (formData.value.id) {
      await contractApi.update(formData.value.id, formData.value)
    } else {
      await contractApi.create(formData.value)
    }
    ElMessage.success('保存成功')
    formVisible.value = false
    fetchList()
  } catch (e) { ElMessage.error(e.message || '保存失败') }
  finally { saving.value = false }
}

const handleDelete = async (id) => {
  try {
    await contractApi.delete(id)
    ElMessage.success('删除成功')
    fetchList()
  } catch { ElMessage.error('删除失败') }
}

const viewDetail = async (row) => {
  if (detailLoading.value) return

  detailLoading.value = true
  try {
    const res = await contractApi.getById(row.id)
    detailData.value = res.data || res
    setCurrentViewContract(row)
    detailVisible.value = true
  } catch {
    ElMessage.error('获取合同详情失败')
  } finally {
    detailLoading.value = false
  }
}

const handleViewPrevious = () => {
  if (previousViewContract.value) viewDetail(previousViewContract.value)
}

const handleViewNext = () => {
  if (nextViewContract.value) viewDetail(nextViewContract.value)
}

const contractViewNavigation = computed(() => ({
  hasPrevious: hasPreviousViewContract.value,
  hasNext: hasNextViewContract.value,
  loading: detailLoading.value,
  previous: handleViewPrevious,
  next: handleViewNext
}))

onMounted(fetchList)
</script>

<style scoped>
</style>
