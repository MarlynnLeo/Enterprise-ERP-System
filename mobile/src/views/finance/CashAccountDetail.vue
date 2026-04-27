<!--
/**
 * CashAccountDetail.vue - 银行账户详情
 * @description 展示银行账户的完整信息
 * @date 2026-04-15
 * @version 1.0.0
 */
-->
<template>
  <div class="detail-page">
    <NavBar title="银行账户详情" left-arrow @click-left="$router.go(-1)" />

    <div class="detail-body" v-if="account">
      <!-- 头部卡片 -->
      <div class="hero-card">
        <div class="hero-icon">
          <SvgIcon name="bank" size="1.5rem" />
        </div>
        <div class="hero-info">
          <div class="hero-title">{{ account.accountName || account.account_name || '—' }}</div>
          <div class="hero-sub">{{ account.bankName || account.bank_name || '—' }}</div>
        </div>
        <div
          class="hero-status"
          :class="account.status === 'active' || account.is_active ? 'success' : 'default'"
        >
          {{ account.status === 'active' || account.is_active ? '正常' : '停用' }}
        </div>
      </div>

      <!-- 余额卡片 -->
      <div class="balance-card">
        <div class="balance-label">当前余额</div>
        <div class="balance-amount">
          ¥{{ formatMoney(account.balance ?? account.current_balance) }}
        </div>
        <div class="balance-row">
          <div class="balance-item">
            <span class="balance-sub-label">期初余额</span>
            <span class="balance-sub-value"
              >¥{{ formatMoney(account.initialBalance ?? account.opening_balance) }}</span
            >
          </div>
          <div class="balance-item">
            <span class="balance-sub-label">币种</span>
            <span class="balance-sub-value">{{
              account.currency || account.currency_code || 'CNY'
            }}</span>
          </div>
        </div>
      </div>

      <!-- 基本信息 -->
      <div class="info-section">
        <div class="section-title">账户信息</div>
        <div class="info-grid">
          <div class="info-item full">
            <span class="info-label">账户名称</span>
            <span class="info-value">{{ account.accountName || account.account_name || '—' }}</span>
          </div>
          <div class="info-item full">
            <span class="info-label">账号</span>
            <span class="info-value mono">{{
              account.accountNumber || account.account_number || '—'
            }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">开户行</span>
            <span class="info-value">{{ account.bankName || account.bank_name || '—' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">支行名称</span>
            <span class="info-value">{{ account.branchName || account.branch_name || '—' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">账户类型</span>
            <span class="info-value">{{ account.purpose || account.account_type || '—' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">状态</span>
            <span
              class="info-value"
              :class="account.status === 'active' || account.is_active ? 'text-green' : 'text-red'"
            >
              {{ account.status === 'active' || account.is_active ? '正常' : '停用' }}
            </span>
          </div>
          <div class="info-item full" v-if="account.notes">
            <span class="info-label">备注</span>
            <span class="info-value">{{ account.notes }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="loading-state" v-else-if="loading">
      <Loading size="24px" /><span>加载中...</span>
    </div>
    <Empty v-else description="账户不存在或加载失败" />
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { useRoute } from 'vue-router'
  import { NavBar, Loading, Empty, showToast } from 'vant'
  import SvgIcon from '@/components/icons/index.vue'
  import { financeApi } from '@/services/api'

  const route = useRoute()
  const account = ref(null)
  const loading = ref(true)

  const formatMoney = (v) => {
    const n = Number(v)
    return isNaN(n)
      ? '0.00'
      : n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  onMounted(async () => {
    try {
      const res = await financeApi.getCashAccountById(route.params.id)
      const d = res.data || res
      account.value = d.data || d
    } catch (e) {
      console.error('加载账户详情失败:', e)
      showToast('加载失败')
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
    background: rgba(99, 102, 241, 0.1);
    color: #6366f1;
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
    &.default {
      background: rgba(107, 114, 128, 0.1);
      color: var(--text-secondary);
    }
  }

  .balance-card {
    background: linear-gradient(135deg, var(--color-primary), #6366f1);
    border-radius: 14px;
    padding: 20px;
    color: var(--text-primary);
  }
  .balance-label {
    font-size: 0.75rem;
    opacity: 0.8;
  }
  .balance-amount {
    font-size: 1.75rem;
    font-weight: 800;
    margin: 6px 0 14px;
    font-family: 'SF Mono', monospace;
  }
  .balance-row {
    display: flex;
    gap: 16px;
  }
  .balance-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .balance-sub-label {
    font-size: 0.6875rem;
    opacity: 0.7;
  }
  .balance-sub-value {
    font-size: 0.875rem;
    font-weight: 600;
    font-family: 'SF Mono', monospace;
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
    &.full {
      grid-column: span 2;
    }
  }
  .info-label {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
  }
  .info-value {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-primary);
    &.mono {
      font-family: 'SF Mono', monospace;
      letter-spacing: 0.5px;
    }
  }
  .text-green {
    color: var(--color-success);
  }
  .text-red {
    color: var(--color-danger);
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
