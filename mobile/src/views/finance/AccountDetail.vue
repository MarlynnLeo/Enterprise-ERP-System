<!--
/**
 * AccountDetail.vue - 会计科目详情
 * @description 展示科目的完整信息、余额变动和关联凭证
 * @date 2026-04-15
 * @version 1.0.0
 */
-->
<template>
  <div class="detail-page">
    <NavBar title="科目详情" left-arrow @click-left="$router.go(-1)" />

    <div class="detail-body" v-if="account">
      <!-- 头部信息卡 -->
      <div class="detail-hero">
        <div class="hero-accent" :class="getTypeClass(account.account_type)"></div>
        <div class="hero-content">
          <div class="hero-top">
            <span class="hero-code">{{ account.account_code }}</span>
            <span class="hero-type" :class="getTypeClass(account.account_type)">
              {{ account.account_type }}
            </span>
          </div>
          <div class="hero-name">{{ account.account_name }}</div>
          <div class="hero-status" :class="{ active: account.is_active }">
            {{ account.is_active ? '● 已启用' : '○ 已停用' }}
          </div>
        </div>
      </div>

      <!-- 余额信息 -->
      <div class="balance-card">
        <div class="balance-row">
          <div class="balance-item">
            <span class="bal-label">当前余额</span>
            <span class="bal-value main">¥{{ formatMoney(account.balance || 0) }}</span>
          </div>
        </div>
        <div class="balance-row">
          <div class="balance-item">
            <span class="bal-label">借方累计</span>
            <span class="bal-value debit">¥{{ formatMoney(account.debit_total || 0) }}</span>
          </div>
          <div class="balance-item">
            <span class="bal-label">贷方累计</span>
            <span class="bal-value credit">¥{{ formatMoney(account.credit_total || 0) }}</span>
          </div>
        </div>
      </div>

      <!-- 基本信息 -->
      <div class="info-section">
        <div class="section-title">基本信息</div>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">科目编码</span>
            <span class="info-value mono">{{ account.account_code }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">科目名称</span>
            <span class="info-value">{{ account.account_name }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">科目类型</span>
            <span class="info-value">{{ account.account_type }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">借贷方向</span>
            <span class="info-value">{{ account.is_debit ? '借方' : '贷方' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">币种</span>
            <span class="info-value">{{ account.currency_code || 'CNY' }}</span>
          </div>
          <div class="info-item" v-if="account.parent_id">
            <span class="info-label">上级科目</span>
            <span class="info-value">{{ account.parent_name || account.parent_id }}</span>
          </div>
          <div class="info-item full" v-if="account.description">
            <span class="info-label">科目说明</span>
            <span class="info-value">{{ account.description }}</span>
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="action-bar">
        <Button type="primary" block round @click="editAccount">编辑科目</Button>
      </div>
    </div>

    <!-- 加载状态 -->
    <div class="loading-state" v-else-if="loading">
      <Loading size="24px" />
      <span>加载中...</span>
    </div>

    <!-- 错误状态 -->
    <Empty v-else description="科目不存在或加载失败" />
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { NavBar, Button, Loading, Empty, showToast } from 'vant'
  import { financeApi } from '@/services/api'

  const route = useRoute()
  const router = useRouter()
  const account = ref(null)
  const loading = ref(true)

  const formatMoney = (amount) => {
    if (!amount) return '0.00'
    return Number(amount).toLocaleString('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  }

  const getTypeClass = (type) => {
    const map = {
      资产: 'type-assets',
      负债: 'type-liabilities',
      所有者权益: 'type-equity',
      成本: 'type-costs',
      收入: 'type-revenue',
      费用: 'type-expenses'
    }
    return map[type] || 'type-default'
  }

  const loadAccount = async () => {
    loading.value = true
    try {
      const id = route.params.id
      const response = await financeApi.getAccount(id)
      const respData = response.data || response
      account.value = respData.data?.account || respData.account || respData.data || respData
    } catch (error) {
      console.error('加载科目详情失败:', error)
      showToast('加载失败')
    } finally {
      loading.value = false
    }
  }

  const editAccount = () => {
    // 返回列表页并触发编辑
    router.go(-1)
  }

  onMounted(() => {
    loadAccount()
  })
</script>

<style lang="scss" scoped>
  .detail-page {
    min-height: 100vh;
    background: var(--bg-primary);
    padding-bottom: 160px;
  }

  .detail-body {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  // 头部卡片
  .detail-hero {
    display: flex;
    background: var(--bg-secondary);
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid var(--glass-border);
  }

  .hero-accent {
    width: 5px;
    flex-shrink: 0;
    &.type-assets {
      background: linear-gradient(180deg, #3b82f6, #60a5fa);
    }
    &.type-liabilities {
      background: linear-gradient(180deg, #ef4444, #f87171);
    }
    &.type-equity {
      background: linear-gradient(180deg, #8b5cf6, #a78bfa);
    }
    &.type-costs {
      background: linear-gradient(180deg, #f59e0b, #fbbf24);
    }
    &.type-revenue {
      background: linear-gradient(180deg, #10b981, #34d399);
    }
    &.type-expenses {
      background: linear-gradient(180deg, #f97316, #fb923c);
    }
    &.type-default {
      background: linear-gradient(180deg, #6b7280, #9ca3af);
    }
  }

  .hero-content {
    flex: 1;
    padding: 16px;
  }

  .hero-top {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }

  .hero-code {
    font-size: 1.25rem;
    font-weight: 800;
    color: var(--text-primary);
    font-family: 'SF Mono', 'Consolas', monospace;
  }

  .hero-type {
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 0.6875rem;
    font-weight: 700;
    &.type-assets {
      background: rgba(59, 130, 246, 0.12);
      color: #3b82f6;
    }
    &.type-liabilities {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
    }
    &.type-equity {
      background: rgba(139, 92, 246, 0.1);
      color: #8b5cf6;
    }
    &.type-costs {
      background: rgba(245, 158, 11, 0.1);
      color: #d97706;
    }
    &.type-revenue {
      background: rgba(16, 185, 129, 0.1);
      color: #10b981;
    }
    &.type-expenses {
      background: rgba(249, 115, 22, 0.1);
      color: #f97316;
    }
    &.type-default {
      background: rgba(107, 114, 128, 0.1);
      color: #6b7280;
    }
  }

  .hero-name {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 6px;
  }

  .hero-status {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    &.active {
      color: #10b981;
    }
  }

  // 余额区
  .balance-card {
    background: var(--bg-secondary);
    border-radius: 14px;
    padding: 16px;
    border: 1px solid var(--glass-border);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .balance-row {
    display: flex;
    gap: 12px;
  }

  .balance-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .bal-label {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
  }

  .bal-value {
    font-size: 0.9375rem;
    font-weight: 700;
    font-family: 'SF Mono', 'Consolas', monospace;
    color: var(--text-primary);
    &.main {
      font-size: 1.375rem;
      color: var(--color-accent, #3b82f6);
    }
    &.debit {
      color: #10b981;
    }
    &.credit {
      color: #ef4444;
    }
  }

  // 信息区
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
      grid-column: 1 / -1;
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
      font-family: 'SF Mono', 'Consolas', monospace;
    }
  }

  // 操作栏
  .action-bar {
    position: fixed;
    bottom: 60px;
    left: 0;
    right: 0;
    padding: 12px 16px;
    padding-bottom: calc(12px + env(safe-area-inset-bottom));
    background: var(--bg-primary);
    border-top: 1px solid var(--glass-border);
  }

  // 加载
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding-top: 40vh;
    color: var(--text-tertiary);
  }
</style>
