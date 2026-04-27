<!--
/**
 * APInvoiceDetail.vue - 应付发票详情
 * @description 展示应付发票的完整信息
 * @date 2026-04-15
 * @version 1.0.0
 */
-->
<template>
  <div class="detail-page">
    <NavBar title="应付发票详情" left-arrow @click-left="$router.go(-1)" />

    <div class="detail-body" v-if="invoice">
      <!-- 头部卡片 -->
      <div class="hero-card">
        <div class="hero-icon">
          <SvgIcon name="receipt" size="1.5rem" />
        </div>
        <div class="hero-info">
          <div class="hero-title">{{ invoice.supplier_name || '未知供应商' }}</div>
          <div class="hero-sub">{{ invoice.invoice_number }}</div>
        </div>
        <div class="hero-status" :class="statusClass">{{ statusText }}</div>
      </div>

      <!-- 金额卡片 -->
      <div class="amount-card">
        <div class="amount-row">
          <div class="amount-item">
            <span class="amount-label">发票金额</span>
            <span class="amount-value primary">¥{{ formatMoney(invoice.total_amount) }}</span>
          </div>
          <div class="amount-item">
            <span class="amount-label">已付金额</span>
            <span class="amount-value success">¥{{ formatMoney(invoice.paid_amount) }}</span>
          </div>
        </div>
        <div class="amount-row">
          <div class="amount-item">
            <span class="amount-label">未付余额</span>
            <span class="amount-value danger">¥{{ formatMoney(invoice.balance_amount) }}</span>
          </div>
          <div class="amount-item">
            <span class="amount-label">币种</span>
            <span class="amount-value">{{ invoice.currency_code || 'CNY' }}</span>
          </div>
        </div>
      </div>

      <!-- 基本信息 -->
      <div class="info-section">
        <div class="section-title">基本信息</div>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">发票编号</span>
            <span class="info-value">{{ invoice.invoice_number }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">供应商</span>
            <span class="info-value">{{ invoice.supplier_name }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">开票日期</span>
            <span class="info-value">{{ formatDate(invoice.invoice_date) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">到期日期</span>
            <span class="info-value">{{ formatDate(invoice.due_date) }}</span>
          </div>
          <div class="info-item" v-if="invoice.notes">
            <span class="info-label">备注</span>
            <span class="info-value">{{ invoice.notes }}</span>
          </div>
        </div>
      </div>

      <!-- 付款记录 -->
      <div class="info-section" v-if="invoice.payments && invoice.payments.length">
        <div class="section-title">付款记录</div>
        <div class="payment-list">
          <div class="payment-item" v-for="p in invoice.payments" :key="p.id">
            <div class="payment-left">
              <div class="payment-date">{{ formatDate(p.payment_date) }}</div>
              <div class="payment-method">{{ p.payment_method || '—' }}</div>
            </div>
            <div class="payment-amount">¥{{ formatMoney(p.amount || p.total_amount) }}</div>
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="action-section" v-if="invoice.status === '草稿'" v-permission="'finance:ap:update'">
        <VanButton round block type="primary" @click="handleConfirm" :loading="actionLoading">
          确认发票
        </VanButton>
      </div>
      <div class="action-section" v-else-if="invoice.status === '已确认'" v-permission="'finance:ap:update'">
        <VanButton round block type="danger" @click="handleVoid" :loading="actionLoading">
          作废发票
        </VanButton>
      </div>
    </div>

    <div class="loading-state" v-else-if="loading">
      <Loading size="24px" /><span>加载中...</span>
    </div>
    <Empty v-else description="发票不存在或加载失败" />
  </div>
</template>

<script setup>
  import { ref, computed, onMounted } from 'vue'
  import { useRoute } from 'vue-router'
  import { NavBar, Loading, Empty, Button as VanButton, showToast, showConfirmDialog } from 'vant'
  import SvgIcon from '@/components/icons/index.vue'
  import { financeApi } from '@/services/api'
  import dayjs from 'dayjs'

  const route = useRoute()
  const invoice = ref(null)
  const loading = ref(true)
  const actionLoading = ref(false)

  const formatDate = (d) => (d ? dayjs(d).format('YYYY-MM-DD') : '—')
  const formatMoney = (v) => {
    const n = Number(v)
    return isNaN(n)
      ? '0.00'
      : n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const statusMap = {
    草稿: { text: '草稿', cls: 'default' },
    已确认: { text: '已确认', cls: 'info' },
    部分付款: { text: '部分付款', cls: 'warning' },
    已付款: { text: '已付款', cls: 'success' },
    已逾期: { text: '逾期', cls: 'danger' },
    已取消: { text: '已取消', cls: 'default' }
  }
  const statusText = computed(
    () => statusMap[invoice.value?.status]?.text || invoice.value?.status || '—'
  )
  const statusClass = computed(() => statusMap[invoice.value?.status]?.cls || 'default')

  const loadDetail = async () => {
    try {
      const res = await financeApi.getAPInvoiceById(route.params.id)
      const d = res.data || res
      invoice.value = d.data || d
    } catch (e) {
      console.error('加载发票详情失败:', e)
      showToast('加载失败')
    } finally {
      loading.value = false
    }
  }

  // 确认发票
  const handleConfirm = async () => {
    try {
      await showConfirmDialog({ title: '确认', message: '确定确认此应付发票？' })
      actionLoading.value = true
      await financeApi.updateAPInvoiceStatus(invoice.value.id, '已确认')
      showToast('发票已确认')
      await loadDetail()
    } catch (e) {
      if (e !== 'cancel') showToast(e.response?.data?.message || '操作失败')
    } finally {
      actionLoading.value = false
    }
  }

  // 作废发票
  const handleVoid = async () => {
    try {
      await showConfirmDialog({ title: '作废确认', message: '确定作废此应付发票？此操作不可撤销。' })
      actionLoading.value = true
      await financeApi.updateAPInvoiceStatus(invoice.value.id, '已取消')
      showToast('发票已作废')
      await loadDetail()
    } catch (e) {
      if (e !== 'cancel') showToast(e.response?.data?.message || '操作失败')
    } finally {
      actionLoading.value = false
    }
  }

  onMounted(loadDetail)
</script>

<style lang="scss" scoped>
  .detail-page {
    min-height: 100vh;
    background: var(--bg-primary);
    padding-bottom: 100px;
  }
  .detail-body {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .hero-card {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--bg-secondary);
    border-radius: 14px;
    padding: 16px;
    border: 1px solid var(--glass-border);
  }
  .hero-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(245, 158, 11, 0.1);
    color: var(--color-warning);
    flex-shrink: 0;
  }
  .hero-info {
    flex: 1;
  }
  .hero-title {
    font-size: 1.0625rem;
    font-weight: 700;
    color: var(--text-primary);
  }
  .hero-sub {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    margin-top: 2px;
    font-family: 'SF Mono', monospace;
  }
  .hero-status {
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 0.6875rem;
    font-weight: 700;
    flex-shrink: 0;
    &.success {
      background: rgba(16, 185, 129, 0.1);
      color: var(--color-success);
    }
    &.warning {
      background: rgba(245, 158, 11, 0.1);
      color: var(--color-warning);
    }
    &.danger {
      background: rgba(239, 68, 68, 0.1);
      color: var(--color-danger);
    }
    &.info {
      background: rgba(59, 130, 246, 0.1);
      color: var(--color-primary);
    }
    &.default {
      background: rgba(107, 114, 128, 0.1);
      color: var(--text-secondary);
    }
  }

  .amount-card {
    background: var(--bg-secondary);
    border-radius: 14px;
    padding: 16px;
    border: 1px solid var(--glass-border);
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .amount-row {
    display: flex;
    gap: 12px;
  }
  .amount-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .amount-label {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
  }
  .amount-value {
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-primary);
    font-family: 'SF Mono', monospace;
    &.primary {
      color: var(--color-primary);
    }
    &.success {
      color: var(--color-success);
    }
    &.danger {
      color: var(--color-danger);
    }
  }

  .info-section {
    background: var(--bg-secondary);
    border-radius: 14px;
    padding: 16px;
    border: 1px solid var(--glass-border);
  }
  .section-title {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 12px;
  }
  .info-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
  }
  .info-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .info-label {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
  }
  .info-value {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .payment-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .payment-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: var(--bg-primary);
    border-radius: 10px;
  }
  .payment-date {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
  }
  .payment-method {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
  }
  .payment-amount {
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--color-success);
    font-family: 'SF Mono', monospace;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding-top: 40vh;
    color: var(--text-tertiary);
  }
  .action-section {
    padding: 20px 16px;
  }
</style>
