<!--
/**
 * CashFlowReport.vue - 出纳报表
 * @date 2026-04-15
 */
-->
<template>
  <div class="report-page">
    <NavBar title="出纳报表" left-arrow @click-left="$router.go(-1)" />

    <div class="report-body">
      <div class="date-picker-card">
        <div class="date-range">
          <span class="date-label">期间</span>
          <span class="date-value">{{ startDate }} ~ {{ endDate }}</span>
        </div>
      </div>

      <div v-if="loading" class="loading-state">
        <Loading size="24px" /><span>报表生成中...</span>
      </div>

      <template v-else-if="reportData.length">
        <div
          class="account-card"
          v-for="item in reportData"
          :key="item.id"
          :class="{ 'total-row': item.type === 'total' }"
        >
          <div class="account-name">{{ item.name }}</div>
          <div class="account-grid">
            <div class="grid-item">
              <span class="grid-label">上月结存</span>
              <span class="grid-value">¥{{ fm(item.lastMonthBalance) }}</span>
            </div>
            <div class="grid-item">
              <span class="grid-label">本月收入</span>
              <span class="grid-value success">¥{{ fm(item.currentMonthIncome) }}</span>
            </div>
            <div class="grid-item">
              <span class="grid-label">本月支出</span>
              <span class="grid-value danger">¥{{ fm(item.currentMonthExpense) }}</span>
            </div>
            <div class="grid-item">
              <span class="grid-label">本月结存</span>
              <span class="grid-value primary">¥{{ fm(item.currentMonthBalance) }}</span>
            </div>
          </div>
        </div>
      </template>
      <Empty v-else description="暂无报表数据" />
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { NavBar, Loading, Empty } from 'vant'
  import { financeApi } from '@/services/api'
  import dayjs from 'dayjs'

  const now = dayjs()
  const startDate = ref(now.startOf('month').format('YYYY-MM-DD'))
  const endDate = ref(now.format('YYYY-MM-DD'))
  const loading = ref(true)
  const reportData = ref([])

  const fm = (v) => {
    const n = Number(v)
    return isNaN(n)
      ? '0.00'
      : n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const loadReport = async () => {
    loading.value = true
    try {
      const res = await financeApi.getCashFlowStatement({
        startDate: startDate.value,
        endDate: endDate.value
      })
      const d = res.data || res
      reportData.value = d.data || d || []
      if (!Array.isArray(reportData.value)) reportData.value = []
    } catch (e) {
      console.error('加载出纳报表失败:', e)
      reportData.value = []
    } finally {
      loading.value = false
    }
  }

  onMounted(loadReport)
</script>

<style lang="scss" scoped>
  .report-page {
    min-height: 100vh;
    background: var(--bg-primary);
    padding-bottom: 80px;
  }
  .report-body {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .date-picker-card {
    background: var(--bg-secondary);
    border-radius: 12px;
    padding: 14px 16px;
    border: 1px solid var(--glass-border);
  }
  .date-range {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .date-label {
    font-size: 0.8125rem;
    color: var(--text-tertiary);
  }
  .date-value {
    font-size: 0.875rem;
    font-weight: 600;
    color: #3b82f6;
    font-family: 'SF Mono', monospace;
  }

  .account-card {
    background: var(--bg-secondary);
    border-radius: 14px;
    padding: 14px 16px;
    border: 1px solid var(--glass-border);
    &.total-row {
      border-color: #3b82f6;
      background: rgba(59, 130, 246, 0.05);
    }
  }
  .account-name {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 10px;
  }
  .account-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  .grid-item {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .grid-label {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
  }
  .grid-value {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
    font-family: 'SF Mono', monospace;
    &.primary {
      color: #3b82f6;
    }
    &.success {
      color: #10b981;
    }
    &.danger {
      color: #ef4444;
    }
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding-top: 30vh;
    color: var(--text-tertiary);
  }
</style>
