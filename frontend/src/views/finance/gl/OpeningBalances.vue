<!--
/**
 * OpeningBalances.vue
 * @description 期初余额设置界面
 * @date 2026-02-03
 * @version 1.0.0
 */
-->
<template>
  <div class="opening-balances-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>期初余额设置</h2>
          <p class="subtitle">设置各科目的期初借方/贷方余额</p>
        </div>
        <div class="header-actions">
          <el-date-picker
            v-model="balanceDate"
            type="date"
            placeholder="期初日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            style="width: 150px; margin-right: 10px;"
          />
          <el-button type="primary" @click="handleBatchSave" :loading="saving">
            <el-icon><Check /></el-icon> 批量保存
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- 统计信息 -->
    <div class="stats-row">
      <el-card class="stat-card">
        <div class="stat-content">
          <div class="stat-icon debit"><el-icon><TrendCharts /></el-icon></div>
          <div class="stat-info">
            <div class="stat-value">¥{{ formatAmount(totalDebit) }}</div>
            <div class="stat-label">借方合计</div>
          </div>
        </div>
      </el-card>
      <el-card class="stat-card">
        <div class="stat-content">
          <div class="stat-icon credit"><el-icon><TrendCharts /></el-icon></div>
          <div class="stat-info">
            <div class="stat-value">¥{{ formatAmount(totalCredit) }}</div>
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
              ¥{{ formatAmount(Math.abs(totalDebit - totalCredit)) }}
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
        style="width: 100%" 
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
        <el-table-column label="借方" width="200">
          <template #default="{ row }">
            <el-input-number
              v-model="row.opening_debit"
              :precision="2"
              :min="0"
              placeholder="借方金额"
              style="width: 100%"
              @change="recalculateTotals"
            />
          </template>
        </el-table-column>
        <el-table-column label="贷方" width="200">
          <template #default="{ row }">
            <el-input-number
              v-model="row.opening_credit"
              :precision="2"
              :min="0"
              placeholder="贷方金额"
              style="width: 100%"
              @change="recalculateTotals"
            />
          </template>
        </el-table-column>
        <el-table-column label="余额方向" width="100">
          <template #default="{ row }">
            <span v-if="row.is_debit" class="text-success">借方</span>
            <span v-else class="text-warning">贷方</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.opening_balance_set" type="success">已设置</el-tag>
            <el-tag v-else type="info">未设置</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { formatAmount } from '@/utils/format'
import { Check, TrendCharts, Warning, CircleCheck } from '@element-plus/icons-vue'
import request from '@/utils/request'

const loading = ref(false)
const saving = ref(false)
const accountList = ref([])
const balanceDate = ref(new Date().toISOString().split('T')[0])

// 计算借方合计
const totalDebit = computed(() => {
  return accountList.value.reduce((sum, acc) => sum + (parseFloat(acc.opening_debit) || 0), 0)
})

// 计算贷方合计
const totalCredit = computed(() => {
  return accountList.value.reduce((sum, acc) => sum + (parseFloat(acc.opening_credit) || 0), 0)
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

// 加载期初余额数据
const loadBalances = async () => {
  loading.value = true
  try {
    const res = await request.get('/finance/opening-balances')
    if (res.success) {
      accountList.value = res.data.map(item => ({
        ...item,
        opening_debit: parseFloat(item.opening_debit) || 0,
        opening_credit: parseFloat(item.opening_credit) || 0
      }))
    }
  } catch (error) {
    ElMessage.error('加载期初余额失败: ' + (error.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

// 重新计算合计
const recalculateTotals = () => {
  // 通过computed自动计算
}

// 批量保存
const handleBatchSave = async () => {
  if (!isBalanced.value) {
    ElMessage.warning('借贷不平衡，请检查数据')
    return
  }

  saving.value = true
  try {
    // 筛选有金额的科目
    const balancesToSave = accountList.value
      .filter(acc => (acc.opening_debit > 0 || acc.opening_credit > 0))
      .map(acc => ({
        accountId: acc.id,
        debit: acc.opening_debit || 0,
        credit: acc.opening_credit || 0
      }))

    if (balancesToSave.length === 0) {
      ElMessage.warning('没有需要保存的期初余额')
      return
    }

    const res = await request.post('/finance/opening-balances/batch', {
      balances: balancesToSave,
      balanceDate: balanceDate.value
    })

    if (res.success) {
      ElMessage.success(`成功保存${balancesToSave.length}个科目的期初余额`)
      loadBalances() // 重新加载
    }
  } catch (error) {
    ElMessage.error('保存失败: ' + (error.message || '未知错误'))
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadBalances()
})
</script>

<style scoped>
.opening-balances-container {
  padding: 20px;
}

.header-card {
  margin-bottom: 20px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
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
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
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
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 15px;
  font-size: 24px;
}

.stat-icon.debit {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: var(--color-on-primary, #fff);
}

.stat-icon.credit {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: var(--color-on-primary, #fff);
}

.stat-icon.balanced {
  background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
  color: var(--color-on-primary, #fff);
}

.stat-icon.unbalanced {
  background: linear-gradient(135deg, #eb3349 0%, #f45c43 100%);
  color: var(--color-on-primary, #fff);
}

.stat-info {
  flex: 1;
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

.data-card {
  margin-bottom: 20px;
}

.text-success {
  color: var(--color-success);
}

.text-warning {
  color: var(--color-warning);
}

.text-danger {
  color: var(--color-danger);
}
</style>
