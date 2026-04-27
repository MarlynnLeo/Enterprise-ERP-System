<template>
  <div class="cip-list-container">
    <!-- 搜索栏 -->
    <el-card shadow="never" class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="工程编号">
          <el-input  v-model="searchForm.projectCode" placeholder="请输入工程编号" clearable
            @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="工程名称">
          <el-input  v-model="searchForm.projectName" placeholder="请输入工程名称" clearable
            @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select  v-model="searchForm.status" placeholder="全部状态" clearable>
            <el-option label="建设中" value="建设中" />
            <el-option label="已转固" value="已转固" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">
            <el-icon><Search /></el-icon> 搜索
          </el-button>
          <el-button @click="resetSearch">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 操作栏 + 表格 -->
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>在建工程列表</span>
          <el-button type="primary" @click="handleCreate">
            <el-icon><Plus /></el-icon> 新建在建工程
          </el-button>
        </div>
      </template>

      <el-table :data="tableData" v-loading="loading" border stripe style="width: 100%">
        <el-table-column prop="project_code" label="工程编号" width="140" />
        <el-table-column prop="project_name" label="工程名称" min-width="180" show-overflow-tooltip />
        <el-table-column prop="budget" label="预算金额" width="130" align="right">
          <template #default="{ row }">
            {{ formatMoney(row.budget) }}
          </template>
        </el-table-column>
        <el-table-column prop="accumulated_amount" label="已归集成本" width="130" align="right">
          <template #default="{ row }">
            <span :class="{ 'over-budget': parseFloat(row.accumulated_amount) > parseFloat(row.budget) }">
              {{ formatMoney(row.accumulated_amount) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="执行率" width="100" align="center">
          <template #default="{ row }">
            <el-progress
              :percentage="getProgressPercent(row)"
              :status="getProgressStatus(row)"
              :stroke-width="6"
              :show-text="true"
            />
          </template>
        </el-table-column>
        <el-table-column prop="start_date" label="开工日期" width="110">
          <template #default="{ row }">
            {{ formatDate(row.start_date) }}
          </template>
        </el-table-column>
        <el-table-column prop="estimated_end_date" label="预计完工" width="110">
          <template #default="{ row }">
            {{ formatDate(row.estimated_end_date) }}
          </template>
        </el-table-column>
        <el-table-column prop="responsible" label="负责人" width="100" />
        <el-table-column prop="department" label="部门" width="100" />
        <el-table-column prop="status" label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === '建设中' ? 'primary' : 'success'" size="small">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right" align="center">
          <template #default="{ row }">
            <template v-if="row.status === '建设中'">
              <el-button type="primary" link size="small" @click="handleAddCost(row)">归集成本</el-button>
              <el-button type="success" link size="small" @click="handleTransfer(row)">转固</el-button>
              <el-button type="warning" link size="small" @click="handleEdit(row)"
              v-permission="'finance:assets:update'">编辑</el-button>
              <el-button v-permission="'finance:assets:delete'" type="danger" link size="small" @click="handleDelete(row)"
                :disabled="parseFloat(row.accumulated_amount) > 0">删除</el-button>
            </template>
            <template v-else>
              <el-button type="info" link size="small" disabled>已完成</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :page-sizes="[10, 20, 50]"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="loadData"
          @current-change="loadData"
        />
      </div>
    </el-card>

    <!-- 新建/编辑对话框 -->
    <el-dialog
      v-model="formDialogVisible"
      :title="isEdit ? '编辑在建工程' : '新建在建工程'"
      width="600px"
      destroy-on-close
    >
      <el-form :model="form" :rules="formRules" ref="formRef" label-width="100px">
        <el-form-item label="工程编号" prop="project_code">
          <el-input v-model="form.project_code" :disabled="isEdit" placeholder="请输入工程编号" />
        </el-form-item>
        <el-form-item label="工程名称" prop="project_name">
          <el-input v-model="form.project_name" placeholder="请输入工程名称" />
        </el-form-item>
        <el-form-item label="预算金额" prop="budget">
          <el-input-number v-model="form.budget" :min="0" :precision="2" :controls="false" style="width: 100%" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="开工日期">
              <el-date-picker v-model="form.start_date" type="date" value-format="YYYY-MM-DD"
                placeholder="请选择" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="预计完工">
              <el-date-picker v-model="form.estimated_end_date" type="date" value-format="YYYY-MM-DD"
                placeholder="请选择" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="负责人">
              <el-input v-model="form.responsible" placeholder="负责人姓名" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="所属部门">
              <el-input v-model="form.department" placeholder="部门名称" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="备注">
          <el-input v-model="form.notes" type="textarea" :rows="2" placeholder="备注信息" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>

    <!-- 归集成本对话框 -->
    <el-dialog v-model="costDialogVisible" title="归集成本" width="450px" destroy-on-close>
      <el-descriptions :column="1" border>
        <el-descriptions-item label="工程名称">{{ currentProject?.project_name }}</el-descriptions-item>
        <el-descriptions-item label="当前归集">{{ formatMoney(currentProject?.accumulated_amount) }}</el-descriptions-item>
        <el-descriptions-item label="预算金额">{{ formatMoney(currentProject?.budget) }}</el-descriptions-item>
      </el-descriptions>
      <el-form style="margin-top: 16px" label-width="100px">
        <el-form-item label="归集金额" required>
          <el-input-number v-model="costAmount" :min="0.01" :precision="2" :controls="false" style="width: 100%"
            placeholder="请输入归集金额" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="costDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitCost" :loading="submitting">确认归集</el-button>
      </template>
    </el-dialog>

    <!-- 转固对话框 -->
    <el-dialog v-model="transferDialogVisible" title="在建工程转固" width="600px" destroy-on-close>
      <el-alert type="warning" :closable="false" style="margin-bottom: 16px">
        转固后，在建工程将标记为"已转固"，并在固定资产中生成一条新记录。此操作不可撤销。
      </el-alert>
      <el-descriptions :column="2" border style="margin-bottom: 16px">
        <el-descriptions-item label="工程编号">{{ currentProject?.project_code }}</el-descriptions-item>
        <el-descriptions-item label="工程名称">{{ currentProject?.project_name }}</el-descriptions-item>
        <el-descriptions-item label="归集成本">{{ formatMoney(currentProject?.accumulated_amount) }}</el-descriptions-item>
      </el-descriptions>
      <el-form :model="transferForm" :rules="transferRules" ref="transferFormRef" label-width="100px">
        <el-form-item label="资产编号" prop="asset_code">
          <el-input v-model="transferForm.asset_code" placeholder="请输入固定资产编号" />
        </el-form-item>
        <el-form-item label="资产名称" prop="asset_name">
          <el-input v-model="transferForm.asset_name" placeholder="请输入固定资产名称" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="入账日期">
              <el-date-picker v-model="transferForm.acquisition_date" type="date" value-format="YYYY-MM-DD"
                style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="使用年限">
              <el-input-number v-model="transferForm.useful_life" :min="1" :max="50" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="折旧方法">
          <el-select v-model="transferForm.depreciation_method" style="width: 100%">
            <el-option label="直线法" value="straight_line" />
            <el-option label="双倍余额递减法" value="double_declining" />
            <el-option label="年数总和法" value="sum_of_years" />
          </el-select>
        </el-form-item>
        <el-form-item label="残值">
          <el-input-number v-model="transferForm.salvage_value" :min="0" :precision="2" :controls="false"
            style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="transferDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitTransfer" :loading="submitting">确认转固</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'
import { api } from '@/services/api'
import { formatDate } from '@/utils/helpers/dateUtils'

// ========== 数据 ==========
const loading = ref(false)
const submitting = ref(false)
const tableData = ref([])
const formDialogVisible = ref(false)
const costDialogVisible = ref(false)
const transferDialogVisible = ref(false)
const isEdit = ref(false)
const currentProject = ref(null)
const costAmount = ref(0)
const formRef = ref(null)
const transferFormRef = ref(null)

const searchForm = reactive({
  projectCode: '',
  projectName: '',
  status: '',
})

const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0,
})

const form = reactive({
  id: null,
  project_code: '',
  project_name: '',
  budget: 0,
  start_date: '',
  estimated_end_date: '',
  responsible: '',
  department: '',
  notes: '',
})

const formRules = {
  project_code: [{ required: true, message: '请输入工程编号', trigger: 'blur' }],
  project_name: [{ required: true, message: '请输入工程名称', trigger: 'blur' }],
}

const transferForm = reactive({
  asset_code: '',
  asset_name: '',
  acquisition_date: new Date().toISOString().split('T')[0],
  useful_life: 5,
  depreciation_method: 'straight_line',
  salvage_value: 0,
})

const transferRules = {
  asset_code: [{ required: true, message: '请输入资产编号', trigger: 'blur' }],
  asset_name: [{ required: true, message: '请输入资产名称', trigger: 'blur' }],
}

// ========== 方法 ==========
const formatMoney = (val) => {
  const num = parseFloat(val || 0)
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(num)
}

// formatDate 已统一引用公共实现

const getProgressPercent = (row) => {
  const budget = parseFloat(row.budget || 0)
  if (budget <= 0) return 0
  return Math.min(Math.round((parseFloat(row.accumulated_amount || 0) / budget) * 100), 100)
}

const getProgressStatus = (row) => {
  const percent = getProgressPercent(row)
  if (percent >= 100) return 'exception'
  if (percent >= 80) return 'warning'
  return ''
}

// 加载列表数据
const loadData = async () => {
  loading.value = true
  try {
    const params = {
      page: pagination.page,
      limit: pagination.pageSize,
    }
    if (searchForm.projectCode) params.projectCode = searchForm.projectCode
    if (searchForm.projectName) params.projectName = searchForm.projectName
    if (searchForm.status) params.status = searchForm.status

    const response = await api.get('/finance/assets-cip', { params })
    const data = response.data
    tableData.value = data?.items || data?.data || []
    pagination.total = data?.total || 0
  } catch (error) {
    console.error('加载在建工程列表失败:', error)
    ElMessage.error('加载在建工程列表失败')
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  pagination.page = 1
  loadData()
}

const resetSearch = () => {
  searchForm.projectCode = ''
  searchForm.projectName = ''
  searchForm.status = ''
  handleSearch()
}

// 新建
const handleCreate = () => {
  isEdit.value = false
  Object.assign(form, {
    id: null, project_code: '', project_name: '', budget: 0,
    start_date: '', estimated_end_date: '', responsible: '', department: '', notes: '',
  })
  formDialogVisible.value = true
}

// 编辑
const handleEdit = (row) => {
  isEdit.value = true
  Object.assign(form, {
    id: row.id,
    project_code: row.project_code,
    project_name: row.project_name,
    budget: parseFloat(row.budget || 0),
    start_date: formatDate(row.start_date) === '-' ? '' : formatDate(row.start_date),
    estimated_end_date: formatDate(row.estimated_end_date) === '-' ? '' : formatDate(row.estimated_end_date),
    responsible: row.responsible || '',
    department: row.department || '',
    notes: row.notes || '',
  })
  formDialogVisible.value = true
}

// 提交表单
const submitForm = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    if (isEdit.value) {
      await api.put(`/finance/assets-cip/${form.id}`, form)
      ElMessage.success('更新成功')
    } else {
      await api.post('/finance/assets-cip', form)
      ElMessage.success('创建成功')
    }
    formDialogVisible.value = false
    loadData()
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

// 删除
const handleDelete = (row) => {
  ElMessageBox.confirm(`确定要删除工程 "${row.project_name}" 吗？`, '确认删除', {
    type: 'warning',
    confirmButtonText: '确定',
    cancelButtonText: '取消',
  }).then(async () => {
    try {
      await api.delete(`/finance/assets-cip/${row.id}`)
      ElMessage.success('删除成功')
      loadData()
    } catch (error) {
      ElMessage.error(error.response?.data?.message || '删除失败')
    }
  }).catch(() => {})
}

// 归集成本
const handleAddCost = (row) => {
  currentProject.value = row
  costAmount.value = 0
  costDialogVisible.value = true
}

const submitCost = async () => {
  if (!costAmount.value || costAmount.value <= 0) {
    ElMessage.warning('请输入有效的归集金额')
    return
  }
  submitting.value = true
  try {
    await api.post(`/finance/assets-cip/${currentProject.value.id}/cost`, {
      amount: costAmount.value,
    })
    ElMessage.success('成本归集成功')
    costDialogVisible.value = false
    loadData()
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '成本归集失败')
  } finally {
    submitting.value = false
  }
}

// 转固
const handleTransfer = (row) => {
  currentProject.value = row
  Object.assign(transferForm, {
    asset_code: '',
    asset_name: row.project_name,
    acquisition_date: new Date().toISOString().split('T')[0],
    useful_life: 5,
    depreciation_method: 'straight_line',
    salvage_value: 0,
  })
  transferDialogVisible.value = true
}

const submitTransfer = async () => {
  const valid = await transferFormRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    await api.post(`/finance/assets-cip/${currentProject.value.id}/transfer`, {
      assetData: transferForm,
    })
    ElMessage.success('转固成功！已生成固定资产记录')
    transferDialogVisible.value = false
    loadData()
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '转固失败')
  } finally {
    submitting.value = false
  }
}

// ========== 生命周期 ==========
onMounted(() => {
  loadData()
})
</script>

<style scoped>
.cip-list-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.search-card {
  margin-bottom: 0;
}

.search-form {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.over-budget {
  color: var(--el-color-danger);
  font-weight: bold;
}
</style>
