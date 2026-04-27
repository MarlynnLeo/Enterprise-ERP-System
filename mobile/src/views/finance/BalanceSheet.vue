<!--
/**
 * BalanceSheet.vue - 资产负债表
 * @date 2026-04-15
 */
-->
<template>
  <div class="report-page">
    <NavBar title="资产负债表" left-arrow @click-left="$router.go(-1)" />

    <div class="report-body">
      <!-- 日期选择 -->
      <div class="date-picker-card">
        <span class="date-label">报表日期</span>
        <span class="date-value" @click="showDatePicker = true">{{ reportDate }}</span>
      </div>

      <div v-if="loading" class="loading-state">
        <Loading size="24px" /><span>报表生成中...</span>
      </div>

      <template v-else-if="report">
        <!-- 关键指标 -->
        <div class="metrics-card">
          <div class="metric">
            <span class="metric-label">资产总计</span>
            <span class="metric-value primary">¥{{ fm(report.summary?.totalAssets) }}</span>
          </div>
          <div class="metric">
            <span class="metric-label">负债总计</span>
            <span class="metric-value danger">¥{{ fm(report.summary?.totalLiabilities) }}</span>
          </div>
          <div class="metric">
            <span class="metric-label">所有者权益</span>
            <span class="metric-value success">¥{{ fm(report.summary?.totalEquity) }}</span>
          </div>
        </div>

        <!-- 报表明细 -->
        <div class="section-card" v-for="section in report.sections || []" :key="section.title">
          <div class="section-title">{{ section.title }}</div>
          <div class="section-item" v-for="item in section.items || []" :key="item.account_code">
            <span class="item-name" :class="{ indent: item.level > 1, bold: item.isTotal }">
              {{ item.account_name || item.name }}
            </span>
            <span class="item-amount" :class="{ bold: item.isTotal }"
              >¥{{ fm(item.balance || item.amount) }}</span
            >
          </div>
          <div class="section-total" v-if="section.total !== undefined">
            <span>{{ section.totalLabel || '小计' }}</span>
            <span>¥{{ fm(section.total) }}</span>
          </div>
        </div>

        <Empty v-if="!report.sections || report.sections.length === 0" description="暂无报表数据" />
      </template>
      <Empty v-else description="加载失败，请稍后重试" />
    </div>

    <Popup v-model:show="showDatePicker" position="bottom" round>
      <DatePicker
        v-model="datePickerValue"
        title="选择报表日期"
        @confirm="onDateConfirm"
        @cancel="showDatePicker = false"
      />
    </Popup>
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { NavBar, Loading, Empty, Popup, DatePicker } from 'vant'
  import { financeApi } from '@/services/api'
  import dayjs from 'dayjs'

  const reportDate = ref(dayjs().format('YYYY-MM-DD'))
  const now = new Date()
  const datePickerValue = ref([
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ])
  const showDatePicker = ref(false)
  const loading = ref(true)
  const report = ref(null)

  const fm = (v) => {
    const n = Number(v)
    return isNaN(n)
      ? '0.00'
      : n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const loadReport = async () => {
    loading.value = true
    try {
      const res = await financeApi.getBalanceSheet({ reportDate: reportDate.value })
      const d = res.data || res
      report.value = d.data || d
    } catch (e) {
      console.error('加载资产负债表失败:', e)
      report.value = null
    } finally {
      loading.value = false
    }
  }

  const onDateConfirm = ({ selectedValues }) => {
    showDatePicker.value = false
    const [y, m, d] = selectedValues
    reportDate.value = `${y}-${m}-${d}`
    loadReport()
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
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--bg-secondary);
    border-radius: 12px;
    padding: 14px 16px;
    border: 1px solid var(--glass-border);
  }
  .date-label {
    font-size: 0.8125rem;
    color: var(--text-tertiary);
  }
  .date-value {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-primary);
    cursor: pointer;
    font-family: 'SF Mono', monospace;
  }

  .metrics-card {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    background: var(--bg-secondary);
    border-radius: 14px;
    padding: 16px;
    border: 1px solid var(--glass-border);
  }
  .metric {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: center;
  }
  .metric-label {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
  }
  .metric-value {
    font-size: 0.875rem;
    font-weight: 700;
    font-family: 'SF Mono', monospace;
    &.primary {
      color: var(--color-primary);
    }
    &.danger {
      color: var(--color-danger);
    }
    &.success {
      color: var(--color-success);
    }
  }

  .section-card {
    background: var(--bg-secondary);
    border-radius: 14px;
    padding: 16px;
    border: 1px solid var(--glass-border);
  }
  .section-title {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 10px;
    border-bottom: 1px solid var(--glass-border);
    padding-bottom: 8px;
  }
  .section-item {
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
    font-size: 0.8125rem;
  }
  .item-name {
    color: var(--text-secondary);
    &.indent {
      padding-left: 16px;
    }
    &.bold {
      font-weight: 700;
      color: var(--text-primary);
    }
  }
  .item-amount {
    color: var(--text-primary);
    font-family: 'SF Mono', monospace;
    font-weight: 500;
    &.bold {
      font-weight: 700;
    }
  }
  .section-total {
    display: flex;
    justify-content: space-between;
    padding: 8px 0 0;
    margin-top: 6px;
    border-top: 1px dashed var(--glass-border);
    font-weight: 700;
    font-size: 0.875rem;
    color: var(--text-primary);
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
