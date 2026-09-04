<!--
/**
 * Expenses.vue
 * @description 费用台账页面
 * @date 2026-01-17
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page expenses-container">
    <!-- 页面标题 -->
    <PageHeader title="费用台账" subtitle="管理日常费用录入与审批">
      <template #actions>
<el-button v-permission="'finance:expenses:update'" @click="handleSyncDingtalk" :loading="syncing">
            <el-icon><Refresh /></el-icon> 同步钉钉审批
          </el-button>
          <el-button v-permission="'finance:expenses:create'" type="primary" @click="handleAdd">
            <el-icon><Plus /></el-icon> 新增费用
          </el-button>
      </template>
    </PageHeader>

    <!-- 统计卡片 -->
    <div class="stats-row">
      <el-card class="stat-card">
        <div class="stat-content">
          <div class="stat-icon total"><el-icon><Tickets /></el-icon></div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.total_count || 0 }}</div>
            <div class="stat-label">总费用笔数</div>
          </div>
        </div>
      </el-card>
      <el-card class="stat-card">
        <div class="stat-content">
          <div class="stat-icon pending"><el-icon><Clock /></el-icon></div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.pending_count || 0 }}</div>
            <div class="stat-label">待审批</div>
          </div>
        </div>
      </el-card>
      <el-card class="stat-card">
        <div class="stat-content">
          <div class="stat-icon approved"><el-icon><Select /></el-icon></div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.approved_count || 0 }}</div>
            <div class="stat-label">已审批</div>
          </div>
        </div>
      </el-card>
      <el-card class="stat-card">
        <div class="stat-content">
          <div class="stat-icon paid"><el-icon><Money /></el-icon></div>
          <div class="stat-info">
            <div class="stat-value">{{ formatMoney(stats.paid_amount) }}</div>
            <div class="stat-label">已付款总额</div>
          </div>
        </div>
      </el-card>
    </div>

    <!-- 搜索筛选 -->
    <FinanceQueryCard
      :model="searchForm"
      :expanded="showAdvancedSearch"
      @update:expanded="showAdvancedSearch = $event"
      @search="handleSearch"
      @reset="handleReset"
    >
      <template #basic>
        <el-form-item label="费用类型">
          <el-cascader
            v-model="searchForm.categoryId"
            :options="categoryTree"
            :props="{ value: 'id', label: 'name', checkStrictly: true, emitPath: false }"
            placeholder="全部类型"
            clearable

          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部状态" clearable>
            <el-option label="草稿" value="draft" />
            <el-option label="待审批" value="pending" />
            <el-option label="已审批" value="approved" />
            <el-option label="已驳回" value="rejected" />
            <el-option label="已付款" value="paid" />
            <el-option label="已取消" value="cancelled" />
          </el-select>
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item label="日期范围">
          <el-date-picker
            v-model="searchForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"

          />
        </el-form-item>
        <el-form-item label="关键词">
          <el-input v-model="searchForm.keyword" placeholder="标题/编号/收款方" clearable />
        </el-form-item>
      </template>
    </FinanceQueryCard>

    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table :data="expenseList" class="table-row-click w-full" border v-loading="loading"
      @row-click="(row, column, event) => handleTableRowView(row, column, event, () => handleView(row))">
        <template #empty>
          <EmptyState description="暂无费用数据" />
        </template>
        <el-table-column prop="expenseNumber" label="审批编码" width="200" />
        <el-table-column prop="categoryName" label="费用类型" width="160">
          <template #default="{ row }">
            <span>{{ row.parentCategoryName ? row.parentCategoryName + ' / ' : '' }}{{ row.categoryName }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="费用标题" min-width="200" show-overflow-tooltip />
        <el-table-column prop="amount" label="金额" width="120">
          <template #default="{ row }">
            <span class="amount-text">{{ formatMoney(row.amount) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="expenseDate" label="费用日期" width="110">
          <template #default="{ row }">
            {{ formatDate(row.expenseDate) }}
          </template>
        </el-table-column>
        <el-table-column prop="payee" label="收款方" width="150" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">{{ getStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdByName" label="创建人" width="100" />
        <el-table-column label="操作" min-width="360" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header"
      >
          <template #default="{ row }">
            <div class="table-actions">
              
              <el-button
                v-if="['draft', 'rejected'].includes(row.status)"
                type="warning" size="small"
                @click="handleEdit(row)"
                v-permission="'finance:expenses:update'"
              >
                <el-icon><Edit /></el-icon> 编辑
              </el-button>
              <el-button
                v-if="['draft', 'rejected'].includes(row.status)"
                type="success" size="small"
                @click="handleSubmit(row)"
                v-permission="'finance:expenses:update'"
              >
                <el-icon><Promotion /></el-icon> 提交
              </el-button>
              <el-button
                v-if="row.status === 'pending'"
                type="success" size="small"
                @click="handleApprove(row)"
                v-permission="'finance:expenses:approve'"
              >
                <el-icon><Check /></el-icon> 审批
              </el-button>
              <el-button
                v-if="row.status === 'approved'"
                type="primary" size="small"
                @click="handlePay(row)"
                v-permission="'finance:expenses:pay'"
              >
                <el-icon><Wallet /></el-icon> 付款
              </el-button>
              <el-button
                v-if="row.status === 'paid'"
                type="danger" size="small"
                @click="handleVoidPayment(row)"
                v-permission="'finance:expenses:pay'"
              >
                <el-icon><CircleClose /></el-icon> 作废付款
              </el-button>
              <el-button
                v-if="['draft', 'pending', 'approved', 'rejected'].includes(row.status)"
                type="info" size="small"
                @click="handleCancelExpense(row)"
                v-permission="'finance:expenses:update'"
              >
                <el-icon><Close /></el-icon> 取消
              </el-button>
              <el-button v-permission="'finance:expenses:delete'"
                v-if="['draft', 'rejected', 'cancelled'].includes(row.status)"
                type="danger" size="small"
                @click="handleDelete(row)"
              >
                <el-icon><Delete /></el-icon> 删除
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="fetchExpenses"
          @current-change="fetchExpenses"
        />
      </div>
    </el-card>

    <!-- 新增/编辑对话框 -->
    <AppDialog
      v-model="dialogVisible"
      :title="dialogMode === 'add' ? '新增费用' : dialogMode === 'edit' ? '编辑费用' : '费用详情'"
      :mode="dialogMode === 'view' ? 'view' : 'form'"
      width="800px"
      content-width="wide"
      :close-on-click-modal="false"
    >
      <el-form
        :model="expenseForm"
        :rules="expenseRules"
        ref="expenseFormRef"
        label-width="100px"
        :disabled="dialogMode === 'view'"
      >
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="费用编号">
              <el-input v-model="expenseForm.expenseNumber" disabled placeholder="自动生成" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="费用类型" prop="categoryId">
              <el-cascader
                v-model="expenseForm.categoryId"
                :options="categoryTree"
                :props="{ value: 'id', label: 'name', emitPath: false }"
                placeholder="选择费用类型"
                class="w-full"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="费用标题" prop="title">
          <el-input v-model="expenseForm.title" placeholder="请输入费用标题" />
        </el-form-item>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="金额" prop="amount">
              <el-input-number
                v-model="expenseForm.amount"
                :precision="2"
                :min="0.01"
                :controls="false"
                placeholder="请输入金额"
                class="w-full"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="费用日期" prop="expenseDate">
              <el-date-picker
                v-model="expenseForm.expense_date"
                type="date"
                placeholder="选择日期"
                value-format="YYYY-MM-DD"
                class="w-full"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="收款方">
              <el-input v-model="expenseForm.payee" placeholder="收款方/供应商名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="发票号码">
              <el-input v-model="expenseForm.invoice_number" placeholder="相关发票号码" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="费用说明">
          <el-input
            v-model="expenseForm.description"
            type="textarea"
            :rows="3"
            placeholder="请输入费用说明"
          />
        </el-form-item>

        <!-- 审批信息（仅查看模式显示） -->
        <template v-if="dialogMode === 'view' && expenseForm.status !== 'draft'">
          <el-divider content-position="left">审批信息</el-divider>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="状态">
              <el-tag :type="getStatusType(expenseForm.status)">{{ getStatusText(expenseForm.status) }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="提交人">{{ expenseForm.submitted_by_name || '-' }}</el-descriptions-item>
            <el-descriptions-item label="提交时间">{{ expenseForm.submitted_at || '-' }}</el-descriptions-item>
            <el-descriptions-item label="审批人">{{ expenseForm.approved_by_name || '-' }}</el-descriptions-item>
            <el-descriptions-item label="审批时间">{{ expenseForm.approved_at || '-' }}</el-descriptions-item>
            <el-descriptions-item label="审批备注">{{ expenseForm.approval_remark || '-' }}</el-descriptions-item>
          </el-descriptions>
        </template>

        <template v-if="dialogMode === 'view' && expenseForm.status === 'paid'">
          <el-divider content-position="left">付款信息</el-divider>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="付款日期">{{ formatDate(expenseForm.paid_at) }}</el-descriptions-item>
            <el-descriptions-item label="付款账户">{{ expenseForm.payment_bank_account_name || '-' }}</el-descriptions-item>
            <el-descriptions-item label="银行流水">{{ expenseForm.payment_transaction_number || '-' }}</el-descriptions-item>
            <el-descriptions-item label="总账凭证">{{ expenseForm.payment_voucher_number || '-' }}</el-descriptions-item>
          </el-descriptions>
        </template>
      </el-form>
      <template #footer v-if="dialogMode !== 'view'">
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button v-permission="expenseForm.id ? 'finance:expenses:update' : 'finance:expenses:create'" type="primary" @click="handleSave" :loading="saving">保存</el-button>
        <el-button v-permission="expenseForm.id ? 'finance:expenses:update' : 'finance:expenses:create'" type="success" @click="handleSaveAndSubmit" :loading="saving">保存并提交</el-button>
      </template>
    </AppDialog>

    <!-- 审批对话框 -->
    <AppDialog
      v-model="approveDialogVisible"
      title="费用审批"
      mode="form"
      width="500px"
    >
      <el-form :model="approveForm" label-width="80px">
        <el-form-item label="费用编号">
          <el-input :value="currentExpense?.expenseNumber" disabled />
        </el-form-item>
        <el-form-item label="费用标题">
          <el-input :value="currentExpense?.title" disabled />
        </el-form-item>
        <el-form-item label="金额">
          <el-input :value="formatMoney(currentExpense?.amount)" disabled />
        </el-form-item>
        <el-form-item label="审批意见">
          <el-input v-model="approveForm.remark" type="textarea" :rows="3" placeholder="请输入审批意见（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="approveDialogVisible = false">取消</el-button>
        <el-button v-permission="'finance:expenses:approve'" type="danger" @click="handleApproveAction('reject')" :loading="approving">驳回</el-button>
        <el-button v-permission="'finance:expenses:approve'" type="success" @click="handleApproveAction('approve')" :loading="approving">通过</el-button>
      </template>
        </AppDialog>

    <!-- 付款对话框 -->
    <AppDialog
      v-model="payDialogVisible"
      title="费用付款"
      mode="form"
      width="500px"
    >
      <el-form :model="payForm" :rules="payRules" ref="payFormRef" label-width="100px">
        <el-form-item label="费用编号">
          <el-input :value="currentExpense?.expenseNumber" disabled />
        </el-form-item>
        <el-form-item label="付款金额">
          <el-input :value="formatMoney(currentExpense?.amount)" disabled />
        </el-form-item>
        <el-form-item label="付款账户" prop="bankAccountId">
          <el-select v-model="payForm.bankAccountId" placeholder="选择付款账户" class="w-full">
            <el-option
              v-for="account in bankAccounts"
              :key="account.id"
              :label="account.accountName || `账户${account.id}`"
              :value="account.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="付款日期" prop="paymentDate">
          <el-date-picker
            v-model="payForm.payment_date"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择付款日期"
            class="w-full"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="payDialogVisible = false">取消</el-button>
        <el-button v-permission="'finance:expenses:pay'" type="primary" @click="handlePayAction" :loading="paying">确认付款</el-button>
      </template>
        </AppDialog>
  </div>
</template>

<script setup>
import { handleTableRowView } from '@/utils/tableRowView'
import { formatLocalDate } from '@/utils/format';
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index'
import { ElMessageBox } from 'element-plus/es/components/message-box/index'
import { Plus, Tickets, Clock, Select, Money, Refresh, Edit, Promotion, Check, Wallet, CircleClose, Close, Delete } from '@element-plus/icons-vue'
import { financeApi } from '@/api'
import { parseDataObject, parseListData, parsePaginatedData } from '@/utils/responseParser'

// 响应式数据
const loading = ref(false)
const saving = ref(false)
const approving = ref(false)
const syncing = ref(false)
const paying = ref(false)
const expenseList = ref([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)
const showAdvancedSearch = ref(false)
const categoryTree = ref([])
const bankAccounts = ref([])
const stats = ref({})

// 搜索表单
const searchForm = reactive({
  categoryId: null,
  status: '',
  dateRange: null,
  keyword: ''
})

// 对话框
const dialogVisible = ref(false)
const dialogMode = ref('add') // add, edit, view
const expenseFormRef = ref(null)
const expenseForm = reactive({
  id: null,
  expenseNumber: '',
  categoryId: null,
  title: '',
  amount: null,
  expense_date: '',
  payee: '',
  invoice_number: '',
  description: '',
  status: 'draft'
})

const expenseRules = {
  categoryId: [{ required: true, message: '请选择费用类型', trigger: 'change' }],
  title: [{ required: true, message: '请输入费用标题', trigger: 'blur' }],
  amount: [
    { required: true, message: '请输入金额', trigger: 'blur' },
    { type: 'number', min: 0.01, message: '金额必须大于0', trigger: 'change' }
  ],
  expense_date: [{ required: true, message: '请选择费用日期', trigger: 'change' }]
}

// 审批对话框
const approveDialogVisible = ref(false)
const currentExpense = ref(null)
const approveForm = reactive({
  remark: ''
})

// 付款对话框
const payDialogVisible = ref(false)
const payFormRef = ref(null)
const payForm = reactive({
  bankAccountId: null,
  payment_date: formatLocalDate(new Date())
})
const payRules = {
  bankAccountId: [{ required: true, message: '请选择付款账户', trigger: 'change' }],
  payment_date: [{ required: true, message: '请选择付款日期', trigger: 'change' }]
}

// 格式化函数
const formatAmount = (value) => {
  if (value === null || value === undefined || value === '') return '-'
  const amount = Number(value)
  if (Number.isNaN(amount)) return '-'
  return amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const formatMoney = (value) => {
  const formatted = formatAmount(value)
  return formatted === '-' ? '-' : `¥${formatted}`
}

// formatDate 已统一引用公共实现

// 日期格式化
const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return formatLocalDate(date);
  } catch {
    return dateStr;
  }
};

const getStatusType = (status) => {
  const map = {
    draft: 'info',
    pending: 'warning',
    approved: 'success',
    rejected: 'danger',
    paid: '',
    cancelled: 'info'
  }
  return map[status] || 'info'
}

const getStatusText = (status) => {
  const map = {
    draft: '草稿',
    pending: '待审批',
    approved: '已审批',
    rejected: '已驳回',
    paid: '已付款',
    cancelled: '已取消'
  }
  return map[status] || status
}

// 数据获取
const fetchExpenses = async () => {
  loading.value = true
  try {
    const params = {
      page: currentPage.value,
      pageSize: pageSize.value
    }
    if (searchForm.categoryId) params.categoryId = searchForm.categoryId
    if (searchForm.status) params.status = searchForm.status
    if (searchForm.dateRange?.length === 2) {
      params.startDate = searchForm.dateRange[0]
      params.endDate = searchForm.dateRange[1]
    }
    if (searchForm.keyword) params.keyword = searchForm.keyword

    const res = await financeApi.getExpenses(params)
    const pageData = parsePaginatedData(res, { enableLog: false })
    expenseList.value = pageData.list
    total.value = pageData.total
  } catch (error) {
    console.error('获取费用列表失败:', error)
  } finally {
    loading.value = false
  }
}

const fetchCategories = async () => {
  try {
    const res = await financeApi.getExpenseCategories({ tree: 'true' })
    categoryTree.value = parseListData(res, { enableLog: false })
  } catch (error) {
    console.error('获取费用类型失败:', error)
  }
}

const fetchBankAccounts = async () => {
  try {
    const res = await financeApi.getBankAccounts()
    bankAccounts.value = parseListData(res, { enableLog: false }).filter(acc => acc && acc.id != null)
  } catch (error) {
    console.error('获取银行账户失败:', error)
  }
}

const fetchStats = async () => {
  try {
    const res = await financeApi.getExpenseStats()
    const data = parseDataObject(res, { enableLog: false }) || {}
    stats.value = data.overview || {}
  } catch (error) {
    console.error('获取统计数据失败:', error)
  }
}

// 搜索
const handleSearch = () => {
  currentPage.value = 1
  fetchExpenses()
}

const handleReset = () => {
  searchForm.categoryId = null
  searchForm.status = ''
  searchForm.dateRange = null
  searchForm.keyword = ''
  handleSearch()
}

// 新增费用
const handleAdd = async () => {
  dialogMode.value = 'add'
  Object.assign(expenseForm, {
    id: null,
    expenseNumber: '',
    categoryId: null,
    title: '',
    amount: null,
    expense_date: formatLocalDate(new Date()),
    payee: '',
    invoice_number: '',
    description: '',
    status: 'draft'
  })
  // 获取新编号
  try {
    const res = await financeApi.generateExpenseNumber()
    const data = parseDataObject(res, { enableLog: false }) || {}
    expenseForm.expenseNumber = data.expenseNumber || ''
  } catch (error) {
    console.error('获取费用编号失败:', error)
  }
  dialogVisible.value = true
}

// 查看
const handleView = async (row) => {
  dialogMode.value = 'view'
  try {
    const res = await financeApi.getExpense(row.id)
    const data = { ...(parseDataObject(res, { enableLog: false }) || {}) }
    // 确保金额是数字类型
    if (data.amount) data.amount = parseFloat(data.amount)
    Object.assign(expenseForm, data)
  } catch (error) {
    console.error('获取费用详情失败:', error)
  }
  dialogVisible.value = true
}

// 编辑
const handleEdit = async (row) => {
  dialogMode.value = 'edit'
  try {
    const res = await financeApi.getExpense(row.id)
    const data = { ...(parseDataObject(res, { enableLog: false }) || {}) }
    // 确保金额是数字类型
    if (data.amount) data.amount = parseFloat(data.amount)
    Object.assign(expenseForm, data)
  } catch (error) {
    console.error('获取费用详情失败:', error)
  }
  dialogVisible.value = true
}

// 保存
const handleSave = async () => {
  try {
    await expenseFormRef.value.validate()
    saving.value = true

    const data = {
      categoryId: expenseForm.categoryId,
      title: expenseForm.title,
      amount: expenseForm.amount,
      expense_date: expenseForm.expense_date,
      payee: expenseForm.payee,
      invoice_number: expenseForm.invoice_number,
      description: expenseForm.description
    }

    if (dialogMode.value === 'add') {
      await financeApi.createExpense(data)
    } else {
      await financeApi.updateExpense(expenseForm.id, data)
    }

    ElMessage.success(dialogMode.value === 'add' ? '创建成功' : '更新成功')
    dialogVisible.value = false
    fetchExpenses()
    fetchStats()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('保存失败: ' + (error.message || '未知错误'))
    }
  } finally {
    saving.value = false
  }
}

// 保存并提交
const handleSaveAndSubmit = async () => {
  try {
    await expenseFormRef.value.validate()
    saving.value = true

    const data = {
      categoryId: expenseForm.categoryId,
      title: expenseForm.title,
      amount: expenseForm.amount,
      expense_date: expenseForm.expense_date,
      payee: expenseForm.payee,
      invoice_number: expenseForm.invoice_number,
      description: expenseForm.description
    }

    let expenseId = expenseForm.id
    if (dialogMode.value === 'add') {
      const res = await financeApi.createExpense(data)
      const createdExpense = parseDataObject(res, { enableLog: false }) || {}
      expenseId = createdExpense.id
    } else {
      await financeApi.updateExpense(expenseForm.id, data)
    }

    if (!expenseId) {
      throw new Error('保存成功但未返回费用ID，无法提交审批')
    }

    // 提交审批
    await financeApi.submitExpense(expenseId)
    ElMessage.success('已保存并提交审批')
    dialogVisible.value = false
    fetchExpenses()
    fetchStats()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('操作失败: ' + (error.message || '未知错误'))
    }
  } finally {
    saving.value = false
  }
}

// 提交审批
const handleSubmit = async (row) => {
  try {
    await ElMessageBox.confirm('确定要提交该费用进行审批吗？', '提交确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'info'
    })

    await financeApi.submitExpense(row.id)
    ElMessage.success('已提交审批')
    fetchExpenses()
    fetchStats()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('提交失败: ' + (error.message || '未知错误'))
    }
  }
}

// 审批
const handleApprove = (row) => {
  currentExpense.value = row
  approveForm.remark = ''
  approveDialogVisible.value = true
}

const handleApproveAction = async (action) => {
  approving.value = true
  try {
    await financeApi.approveExpense(currentExpense.value.id, {
      action,
      remark: approveForm.remark
    })
    ElMessage.success(action === 'approve' ? '审批通过' : '已驳回')
    approveDialogVisible.value = false
    fetchExpenses()
    fetchStats()
  } catch (error) {
    ElMessage.error('操作失败: ' + (error.message || '未知错误'))
  } finally {
    approving.value = false
  }
}

// 付款
const handlePay = (row) => {
  currentExpense.value = row
  payForm.bankAccountId = null
  payForm.payment_date = formatLocalDate(new Date())
  payDialogVisible.value = true
}

const handlePayAction = async () => {
  try {
    await payFormRef.value.validate()
    await ElMessageBox.confirm(
      `确认支付费用「${currentExpense.value.title || currentExpense.value.expenseNumber}」吗？`,
      '确认付款',
      { type: 'warning', confirmButtonText: '确认付款', cancelButtonText: '取消' }
    )
    paying.value = true

    await financeApi.payExpense(currentExpense.value.id, {
      bankAccountId: payForm.bankAccountId,
      payment_date: payForm.payment_date
    })
    ElMessage.success('付款成功')
    payDialogVisible.value = false
    fetchExpenses()
    fetchStats()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('付款失败: ' + (error.message || '未知错误'))
    }
  } finally {
    paying.value = false
  }
}

// 作废已付款
const handleVoidPayment = async (row) => {
  try {
    const { value } = await ElMessageBox.prompt('请填写作废原因', '作废费用付款', {
      confirmButtonText: '确认作废',
      cancelButtonText: '取消',
      inputPattern: /\S+/,
      inputErrorMessage: '作废原因不能为空',
      type: 'warning',
    })
    await financeApi.voidExpensePayment(row.id, { void_reason: value })
    ElMessage.success('费用付款已作废')
    fetchExpenses()
    fetchStats()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('作废失败: ' + (error.message || '未知错误'))
    }
  }
}

// 取消费用
const handleCancelExpense = async (row) => {
  try {
    await ElMessageBox.confirm('确定要取消该费用记录吗？', '取消确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })

    await financeApi.cancelExpense(row.id)
    ElMessage.success('费用已取消')
    fetchExpenses()
    fetchStats()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('取消失败: ' + (error.message || '未知错误'))
    }
  }
}

// 删除
const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm('确定要删除该费用记录吗？', '删除确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })

    await financeApi.deleteExpense(row.id)
    ElMessage.success('删除成功')
    fetchExpenses()
    fetchStats()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败: ' + (error.message || '未知错误'))
    }
  }
}

// 同步钉钉审批
const handleSyncDingtalk = async () => {
  syncing.value = true
  try {
    const res = await financeApi.importDingtalkExpenses({ days: 3 })
    const data = parseDataObject(res, { enableLog: false }) || {}
    ElMessage.success(`同步完成：新增${data.imported || 0}条，更新${data.updated || 0}条，跳过${data.skipped || 0}条`)
    fetchExpenses()
    fetchStats()
  } catch (error) {
    ElMessage.error('同步失败: ' + (error.message || '未知错误'))
  } finally {
    syncing.value = false
  }
}

// 初始化
onMounted(() => {
  fetchCategories()
  fetchBankAccounts()
  fetchExpenses()
  fetchStats()
})
</script>

<style scoped>
.expenses-container {
  padding: 20px;
}

.header-card {
  margin-bottom: 20px;
}

.title-section h2 {
  margin: 0;
  font-size: 20px;
  color: var(--el-text-color-primary);
}

.subtitle {
  margin: 5px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  margin-bottom: 20px;
}

.stat-card {
  --el-card-padding: 16px;
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.stat-icon.total {
  background: var(--color-primary);
  color: var(--color-on-primary);
}

.stat-icon.pending {
  background: var(--color-warning);
  color: var(--color-on-primary);
}

.stat-icon.approved {
  background: var(--color-success);
  color: var(--color-on-primary);
}

.stat-icon.paid {
  background: var(--color-text-secondary);
  color: var(--color-on-primary);
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.stat-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.search-card {
  margin-bottom: 20px;
}

.search-form {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.data-card {
  --el-card-padding: 20px;
}

.amount-text {
  font-weight: 500;
  color: var(--el-color-danger);
}

.pagination-container {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 1200px) {
  .stats-row {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .stats-row {
    grid-template-columns: 1fr;
  }

  .header-content {
    flex-direction: column;
    align-items: flex-start;
    gap: 15px;
  }
}
</style>
