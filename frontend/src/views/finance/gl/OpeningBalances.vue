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
          <el-button v-permission="'finance:accounts:update'" type="primary" @click="handleBatchSave" :loading="saving">
            <el-icon><Check /></el-icon> 完成初始化
          </el-button>
      </template>
    </PageHeader>

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

    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table
        :data="accountList"
        class="w-full"
        border
        v-loading="loading"
        row-key="id"
        :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
      >
        <el-table-column prop="account_code" label="科目编码" width="150" />
        <el-table-column prop="account_name" label="科目名称" width="200" />
        <el-table-column prop="account_type" label="科目类型" width="100">
          <template #default="{ row }">
            <el-tag :type="getAccountTypeTag(row.account_type)">{{ row.account_type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="数据来源" min-width="180">
          <template #default="{ row }">
            <el-tooltip
              v-if="sourceDetailText(row)"
              :content="sourceDetailText(row)"
              placement="top"
            >
              <el-tag :type="getSourceTag(row.source_type)">
                {{ row.source_label }}
              </el-tag>
            </el-tooltip>
            <el-tag v-else :type="getSourceTag(row.source_type)">
              {{ row.source_label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="期初余额" width="220">
          <template #default="{ row }">
            <el-input-number
              v-if="row.manual_allowed"
              v-model="row.opening_amount"
              :precision="2"
              :min="0"
              :controls="false"
              placeholder="期初余额"
              class="w-full"
            />
            <span v-else class="generated-amount">{{ formatCurrency(row.opening_amount) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="系统方向" width="100">
          <template #default="{ row }">
            <el-tag :type="row.opening_direction === 'debit' ? 'success' : 'warning'">
              {{ row.opening_direction === 'debit' ? '借方' : '贷方' }}
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
            <el-tag v-if="row.source_type === 'system'" type="success">系统生成</el-tag>
            <el-tag v-else-if="row.opening_balance_set" type="warning">已补录</el-tag>
            <el-tag v-else type="info">待补录</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { formatCurrency, formatLocalDate } from '@/utils/format'
import { Check, TrendCharts, Warning, CircleCheck, Refresh } from '@element-plus/icons-vue'
import { financeApi } from '@/api'
import { parseDataObject } from '@/utils/responseParser'

const loading = ref(false)
const saving = ref(false)
const accountList = ref([])
const warnings = ref([])
const balanceDate = ref(formatLocalDate(new Date()))

// 计算借方合计
const totalDebit = computed(() => {
  return accountList.value.reduce((sum, acc) => sum + getOpeningDebit(acc), 0)
})

// 计算贷方合计
const totalCredit = computed(() => {
  return accountList.value.reduce((sum, acc) => sum + getOpeningCredit(acc), 0)
})

// 判断是否平衡
const isBalanced = computed(() => {
  return Math.abs(totalDebit.value - totalCredit.value) < 0.01
})

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
      opening_amount: parseFloat(item.opening_amount) || 0,
      opening_direction: item.opening_direction || getDefaultDirection(item)
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
</style>
