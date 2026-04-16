<!--
/**
 * APPaymentDetail.vue - 付款详情
 * @date 2026-04-15
 */
-->
<template>
  <div class="detail-page">
    <NavBar title="付款详情" left-arrow @click-left="$router.go(-1)" />

    <div class="detail-body" v-if="payment">
      <div class="hero-card">
        <div class="hero-icon"><Icon name="credit-card" size="1.5rem" /></div>
        <div class="hero-info">
          <div class="hero-title">
            {{ payment.supplierName || payment.supplier_name || '未知供应商' }}
          </div>
          <div class="hero-sub">{{ payment.paymentNumber || payment.payment_number || '' }}</div>
        </div>
        <div
          class="hero-status"
          :class="payment.status === 'void' || payment.status === '已作废' ? 'danger' : 'success'"
        >
          {{ payment.status === 'void' || payment.status === '已作废' ? '已作废' : '正常' }}
        </div>
      </div>

      <div class="amount-card">
        <div class="amount-row">
          <div class="amount-item">
            <span class="amount-label">付款金额</span>
            <span class="amount-value primary"
              >¥{{ fm(payment.amount || payment.total_amount) }}</span
            >
          </div>
          <div class="amount-item">
            <span class="amount-label">付款日期</span>
            <span class="amount-value">{{ fd(payment.paymentDate || payment.payment_date) }}</span>
          </div>
        </div>
        <div class="amount-row">
          <div class="amount-item">
            <span class="amount-label">支付方式</span>
            <span class="amount-value">{{
              payment.paymentMethod || payment.payment_method || '—'
            }}</span>
          </div>
          <div class="amount-item">
            <span class="amount-label">银行账户</span>
            <span class="amount-value">{{
              payment.bankAccountName || payment.bank_account_name || '—'
            }}</span>
          </div>
        </div>
        <div class="amount-row" v-if="payment.referenceNumber || payment.reference_number">
          <div class="amount-item">
            <span class="amount-label">参考编号</span>
            <span class="amount-value">{{
              payment.referenceNumber || payment.reference_number
            }}</span>
          </div>
        </div>
      </div>

      <div class="info-section" v-if="payment.items && payment.items.length">
        <div class="section-title">付款明细</div>
        <div class="payment-item" v-for="item in payment.items" :key="item.id">
          <div class="payment-left">
            <div class="payment-invoice">
              {{ item.invoiceNumber || item.invoice_number || '—' }}
            </div>
          </div>
          <div class="payment-amount">¥{{ fm(item.amount) }}</div>
        </div>
      </div>

      <div class="info-section" v-if="payment.notes || payment.memo">
        <div class="section-title">备注</div>
        <div class="notes-text">{{ payment.notes || payment.memo }}</div>
      </div>
    </div>

    <div class="loading-state" v-else-if="loading">
      <Loading size="24px" /><span>加载中...</span>
    </div>
    <Empty v-else description="付款记录不存在" />
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { useRoute } from 'vue-router'
  import { NavBar, Loading, Empty } from 'vant'
  import Icon from '@/components/icons/index.vue'
  import { financeApi } from '@/services/api'
  import dayjs from 'dayjs'

  const route = useRoute()
  const payment = ref(null)
  const loading = ref(true)

  const fd = (d) => (d ? dayjs(d).format('YYYY-MM-DD') : '—')
  const fm = (v) => {
    const n = Number(v)
    return isNaN(n)
      ? '0.00'
      : n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  onMounted(async () => {
    try {
      const res = await financeApi.getAPPaymentById(route.params.id)
      const d = res.data || res
      payment.value = d.data || d
    } catch (e) {
      console.error('加载付款详情失败:', e)
    } finally {
      loading.value = false
    }
  })
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
    background: rgba(249, 115, 22, 0.1);
    color: #f97316;
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
      color: #10b981;
    }
    &.danger {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
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
      color: #f97316;
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
  .payment-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: var(--bg-primary);
    border-radius: 10px;
    margin-bottom: 6px;
  }
  .payment-invoice {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
  }
  .payment-amount {
    font-size: 0.9375rem;
    font-weight: 700;
    color: #f97316;
    font-family: 'SF Mono', monospace;
  }
  .notes-text {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    line-height: 1.6;
  }
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding-top: 40vh;
    color: var(--text-tertiary);
  }
</style>
