<!--
/**
 * OpeningBalances.vue
 * @description 期初余额设置界面
 * @date 2026-02-03
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page opening-balances-container">
    <PageHeader title="期初余额" subtitle="来源驱动的总账期初初始化">
      <template #actions>
<el-date-picker
            v-model="balanceDate"
            type="date"
            placeholder="期初日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            class="form-control-150-mr"
            @change="loadPreview"
          />
          <el-button @click="loadPreview" :loading="loading">
            <el-icon><Refresh /></el-icon> 重新读取业务数据
          </el-button>
          <el-button
            v-permission="'finance:accounts:update'"
            type="primary"
            :disabled="hasImportedOpening"
            :loading="saving"
            @click="handleBatchSave"
          >
            <el-icon><Check /></el-icon> 完成初始化
          </el-button>
      </template>
    </PageHeader>

    <el-alert
      v-if="hasImportedOpening"
      class="mb-md"
      type="warning"
      show-icon
      :closable="false"
      title="总账期初已从老系统导入（2026-08-01）"
      description="不要点「完成初始化」。该操作会按银行/库存年结/应收发票重算，当前这些来源是空的，会把已导入的期初冲掉。"
    />

    <div v-if="warnings.length" class="warning-list">
      <el-alert
        v-for="warning in warnings"
        :key="warning"
        :title="warning"
        type="warning"
        :closable="false"
        show-icon
      />
    </div>

    <!-- 统计信息 -->
    <div class="stats-row">
      <el-card class="stat-card">
        <div class="stat-content">
          <div class="stat-icon debit"><el-icon><TrendCharts /></el-icon></div>
          <div class="stat-info">
            <div class="stat-value">{{ formatCurrency(totalDebit) }}</div>
            <div class="stat-label">借方合计</div>
          </div>
        </div>
      </el-card>
      <el-card class="stat-card">
        <div class="stat-content">
          <div class="stat-icon credit"><el-icon><TrendCharts /></el-icon></div>
          <div class="stat-info">
            <div class="stat-value">{{ formatCurrency(totalCredit) }}</div>
            <div class="stat-label">贷方合计</div>
          </div>
        </div>
      </el-card>
      <el-card class="stat-card">
        <div class="stat-content">
          <div class="stat-icon" :class="{ 'balanced': isBalanced, 'unbalanced': !isBalanced }">
            <el-icon><Warning v-if="!isBalanced" /><CircleCheck v-else /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value" :class="{ 'text-success': isBalanced, 'text-danger': !isBalanced }">
              {{ formatCurrency(Math.abs(totalDebit - totalCredit)) }}
            </div>
            <div class="stat-label">{{ isBalanced ? '借贷平衡' : '差额' }}</div>
          </div>
        </div>
      </el-card>
    </div>

    <!-- 筛选搜索栏 -->
    <FinanceQueryCard
      :model="searchForm"
      :loading="loading"
      @search="handleSearch"
      @reset="handleResetSearch"
    >
      <template #basic>
        <el-form-item label="关键字">
          <el-input
            v-model="searchForm.keyword"
            placeholder="科目编码 / 科目名称"
            clearable
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="科目类型">
          <el-select v-model="searchForm.accountType" placeholder="全部类型" clearable @change="handleSearch">
            <el-option label="全部" value="" />
            <el-option label="资产" value="资产" />
            <el-option label="负债" value="负债" />
            <el-option label="所有者权益" value="所有者权益" />
            <el-option label="权益" value="权益" />
            <el-option label="收入" value="收入" />
            <el-option label="费用" value="费用" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部状态" clearable @change="handleSearch">
            <el-option label="全部" value="" />
            <el-option label="系统生成" value="system" />
            <el-option label="已补录" value="manual_set" />
            <el-option label="待补录" value="manual_pending" />
          </el-select>
        </el-form-item>
      </template>
    </FinanceQueryCard>

    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table
        :data="pagedAccountList"
        class="w-full"
        border
        v-loading="loading"
        row-key="id"
      >
        <el-table-column prop="accountCode" label="科目编码" width="150" />
        <el-table-column prop="accountName" label="科目名称" width="200" />
        <el-table-column prop="accountType" label="科目类型" width="100">
          <template #default="{ row }">
            <el-tag :type="getAccountTypeTag(row.accountType)">{{ row.accountType }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="数据来源" min-width="180">
          <template #default="{ row }">
            <el-tooltip
              v-if="sourceDetailText(row)"
              :content="sourceDetailText(row)"
              placement="top"
            >
              <el-tag :type="getSourceTag(row.sourceType)">
                {{ row.sourceLabel }}
              </el-tag>
            </el-tooltip>
            <el-tag v-else :type="getSourceTag(row.sourceType)">
              {{ row.sourceLabel }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="期初余额" width="220">
          <template #default="{ row }">
            <el-input-number
              v-if="row.manualAllowed"
              v-model="row.openingAmount"
              :precision="2"
              :min="0"
              :controls="false"
              placeholder="期初余额"
              class="w-full"
            />
            <span v-else class="generated-amount">{{ formatCurrency(row.openingAmount) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="系统方向" width="100">
          <template #default="{ row }">
            <el-tag :type="row.openingDirection === 'debit' ? 'success' : 'warning'">
              {{ row.openingDirection === 'debit' ? '借方' : '贷方' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="借方金额" width="160" align="right">
          <template #default="{ row }">
            <span>{{ formatCurrency(getOpeningDebit(row)) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="贷方金额" width="160" align="right">
          <template #default="{ row }">
            <span>{{ formatCurrency(getOpeningCredit(row)) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="科目余额方向" width="120">
          <template #default="{ row }">
            <span v-if="isDebitAccount(row)" class="text-success">借方</span>
            <span v-else class="text-warning">贷方</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.sourceType === 'system'" type="success">系统生成</el-tag>
            <el-tag v-else-if="row.openingBalanceSet" type="warning">已补录</el-tag>
            <el-tag v-else type="info">待补录</el-tag>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页区域 -->
      <div class="pagination-container mt-md flex-end">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="filteredAccountList.length"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { formatCurrency, formatLocalDate } from '@/utils/format'
import { Check, TrendCharts, Warning, CircleCheck, Refresh } from '@element-plus/icons-vue'
import { financeApi } from '@/api'
import { parseDataObject } from '@/utils/responseParser'
import FinanceQueryCard from '@/components/common/FinanceQueryCard.vue'

const loading = ref(false)
const saving = ref(false)
const accountList = ref([])
const warnings = ref([])
const balanceDate = ref(formatLocalDate(new Date()))

// 搜索与分页状态
const searchForm = reactive({
  keyword: '',
  accountType: '',
  status: ''
})

const currentPage = ref(1)
const pageSize = ref(20)

// 过滤后的科目列表
const filteredAccountList = computed(() => {
  let list = accountList.value
  const kw = searchForm.keyword?.trim().toLowerCase()
  if (kw) {
    list = list.filter(item =>
      (item.accountCode && String(item.accountCode).toLowerCase().includes(kw)) ||
      (item.accountName && String(item.accountName).toLowerCase().includes(kw))
    )
  }
  if (searchForm.accountType) {
    list = list.filter(item => item.accountType === searchForm.accountType)
  }
  if (searchForm.status) {
    if (searchForm.status === 'system') {
      list = list.filter(item => item.sourceType === 'system')
    } else if (searchForm.status === 'manual_set') {
      list = list.filter(item => item.sourceType !== 'system' && item.openingBalanceSet)
    } else if (searchForm.status === 'manual_pending') {
      list = list.filter(item => item.sourceType !== 'system' && !item.openingBalanceSet)
    }
  }
  return list
})

// 分页切片数据（大幅降低 DOM 节点数与卡顿）
const pagedAccountList = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredAccountList.value.slice(start, end)
})

const handleSearch = () => {
  currentPage.value = 1
}

const handleResetSearch = () => {
  searchForm.keyword = ''
  searchForm.accountType = ''
  searchForm.status = ''
  currentPage.value = 1
}

// 计算借方合计（基于全量数据）
const totalDebit = computed(() => {
  return accountList.value.reduce((sum, acc) => sum + getOpeningDebit(acc), 0)
})

// 计算贷方合计（基于全量数据）
const totalCredit = computed(() => {
  return accountList.value.reduce((sum, acc) => sum + getOpeningCredit(acc), 0)
})

// 判断是否平衡（基于全量数据）
const isBalanced = computed(() => {
  return Math.abs(totalDebit.value - totalCredit.value) < 0.01
})

const hasImportedOpening = computed(() =>
  accountList.value.some((row) =>
    row.openingSourceType === 'import' || row.opening_source_type === 'import'
  )
)

// 格式化金额 - 已统一使用 @/utils/format 导入

// 获取科目类型标签颜色
const getAccountTypeTag = (type) => {
  const typeMap = {
    '资产': 'primary',
    '负债': 'warning',
    '权益': 'success',
    '收入': 'info',
    '费用': 'danger'
  }
  return typeMap[type] || 'info'
}

const getSourceTag = (type) => type === 'system' ? 'success' : 'info'

const sourceDetailText = (account) => {
  if (!account.source_details) return ''
  return JSON.stringify(account.source_details).slice(0, 500)
}

const toAmount = (value) => {
  const amount = parseFloat(value)
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

const isDebitAccount = (account) => {
  return account.is_debit === true || account.is_debit === 1 || account.is_debit === '1'
}

const getDefaultDirection = (account) => {
  return isDebitAccount(account) ? 'debit' : 'credit'
}

const getOpeningDebit = (account) => {
  return account.opening_direction === 'debit' ? toAmount(account.opening_amount) : 0
}

const getOpeningCredit = (account) => {
  return account.opening_direction === 'credit' ? toAmount(account.opening_amount) : 0
}

// 从业务子模块重新生成预览，系统来源金额由后端统一计算。
const loadPreview = async () => {
  loading.value = true
  try {
    const res = await financeApi.openingBalances.preview({ balanceDate: balanceDate.value })
    const preview = parseDataObject(res, { enableLog: false }) || {}
    warnings.value = preview.warnings || []
    accountList.value = (preview.rows || []).map(item => ({
      ...item,
      opening_amount: parseFloat(item.openingAmount) || 0,
      opening_direction: item.openingDirection || getDefaultDirection(item)
    }))
  } catch (error) {
    ElMessage.error('加载期初余额预览失败: ' + (error.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

// 系统来源在后端重新计算，前端只提交允许补录的余额。
const handleBatchSave = async () => {
  if (!isBalanced.value) {
    ElMessage.warning('借贷不平衡，请检查数据')
    return
  }

  saving.value = true
  try {
    const manualBalances = accountList.value
      .filter(acc => acc.manual_allowed)
      .map(acc => ({
        accountId: acc.id,
        amount: acc.opening_amount || 0
      }))

    await financeApi.openingBalances.initialize({
      manualBalances,
      balanceDate: balanceDate.value
    })

    ElMessage.success('期初余额完成')
    loadPreview()
  } catch (error) {
    ElMessage.error('初始化失败: ' + (error.message || '未知错误'))
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadPreview()
})
</script>

<style scoped>
.opening-balances-container {
  padding: 20px;
}

.header-card {
  margin-bottom: 20px;
}

.title-section h2 {
  margin: 0;
  font-size: 24px;
  color: var(--color-text-primary);
}

.subtitle {
  margin: 5px 0 0;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.warning-list {
  display: grid;
  gap: 10px;
  margin-bottom: 20px;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
  gap: 20px;
  margin-bottom: 20px;
}

.stat-card {
  cursor: default;
}

.stat-content {
  display: flex;
  align-items: center;
  padding: 10px;
}

.stat-icon {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 15px;
  font-size: 24px;
}

.stat-icon.debit {
  background: var(--color-primary);
  color: var(--color-on-primary);
}

.stat-icon.credit {
  background: var(--color-warning);
  color: var(--color-on-primary);
}

.stat-icon.balanced {
  background: var(--color-success);
  color: var(--color-on-primary);
}

.stat-icon.unbalanced {
  background: var(--color-danger);
  color: var(--color-on-primary);
}

.stat-info {
  flex: 1;
  min-width: 0;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.stat-label {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-top: 4px;
}

.text-danger {
  color: var(--color-danger);
}

.generated-amount {
  color: var(--color-text-primary);
  font-weight: 600;
}

.pagination-container {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
