<!--
/**
 * EntryDetail.vue - 会计凭证详情
 * @description 展示凭证摘要信息和分录明细列表
 * @date 2026-04-15
 * @version 1.0.0
 */
-->
<template>
  <div class="detail-page">
    <NavBar title="凭证详情" left-arrow @click-left="$router.go(-1)">
      <template #right>
        <div v-if="entry && !entry.is_posted" class="post-btn" @click="handlePost">过账</div>
      </template>
    </NavBar>

    <div class="detail-body" v-if="entry">
      <!-- 凭证头 -->
      <div class="entry-hero">
        <div class="hero-row">
          <span class="entry-number">{{ entry.entry_number || '—' }}</span>
          <span class="entry-status" :class="entry.is_posted ? 'posted' : 'draft'">
            {{ entry.is_posted ? '已过账' : '草稿' }}
          </span>
        </div>
        <div class="hero-desc">{{ entry.description || '无摘要' }}</div>
        <div class="hero-meta">
          <span><VanIcon name="calendar-o" /> {{ formatDate(entry.entry_date) }}</span>
          <span><VanIcon name="contact-o" /> {{ entry.created_by || '—' }}</span>
        </div>
      </div>

      <!-- 金额汇总 -->
      <div class="amount-summary">
        <div class="amount-card debit-bg">
          <span class="amount-label">借方合计</span>
          <span class="amount-value">¥{{ formatMoney(entry.total_debit || 0) }}</span>
        </div>
        <div class="amount-card credit-bg">
          <span class="amount-label">贷方合计</span>
          <span class="amount-value">¥{{ formatMoney(entry.total_credit || 0) }}</span>
        </div>
      </div>

      <!-- 分录明细 -->
      <div class="items-section">
        <div class="section-title">分录明细 ({{ items.length }})</div>
        <div v-for="(item, idx) in items" :key="idx" class="entry-item">
          <div class="item-left">
            <span class="item-idx">{{ idx + 1 }}</span>
          </div>
          <div class="item-body">
            <div class="item-account">
              <span class="account-code">{{ item.accountCode || item.account_code || '' }}</span>
              <span class="account-name">{{ item.accountName || item.account_name || '' }}</span>
            </div>
            <div class="item-desc" v-if="item.description">{{ item.description }}</div>
          </div>
          <div class="item-amounts">
            <div class="item-debit" v-if="(item.debitAmount || item.debit_amount) > 0">
              <span class="amt-label">借</span>
              <span class="amt-value"
                >¥{{ formatMoney(item.debitAmount || item.debit_amount) }}</span
              >
            </div>
            <div class="item-credit" v-if="(item.creditAmount || item.credit_amount) > 0">
              <span class="amt-label">贷</span>
              <span class="amt-value"
                >¥{{ formatMoney(item.creditAmount || item.credit_amount) }}</span
              >
            </div>
          </div>
        </div>
        <Empty v-if="items.length === 0" description="暂无分录明细" />
      </div>

      <!-- 附加信息 -->
      <div class="info-section">
        <div class="section-title">附加信息</div>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">凭证类型</span>
            <span class="info-value">{{ entry.document_type || '记账凭证' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">过账日期</span>
            <span class="info-value">{{ formatDate(entry.posting_date) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">会计期间</span>
            <span class="info-value">{{ entry.period_name || entry.period_id || '—' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">创建时间</span>
            <span class="info-value">{{ formatDate(entry.created_at) }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="loading-state" v-else-if="loading">
      <Loading size="24px" />
      <span>加载中...</span>
    </div>
    <Empty v-else description="凭证不存在或加载失败" />
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { useRoute } from 'vue-router'
  import { NavBar, Loading, Empty, showToast, showConfirmDialog } from 'vant'
  import { financeApi, default as api } from '@/services/api'
  import dayjs from 'dayjs'

  const route = useRoute()
  const entry = ref(null)
  const items = ref([])
  const loading = ref(true)

  const formatMoney = (amount) => {
    if (!amount) return '0.00'
    return Number(amount).toLocaleString('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  }

  const formatDate = (date) => {
    if (!date) return '—'
    return dayjs(date).format('YYYY-MM-DD')
  }

  const loadEntry = async () => {
    loading.value = true
    try {
      const id = route.params.id
      // 加载凭证主信息
      const response = await financeApi.getEntry(id)
      const respData = response.data || response
      entry.value = respData.data?.entry || respData.entry || respData.data || respData

      // 加载分录明细
      try {
        const itemsResp = await api.get(`/finance/entries/${id}/items`)
        const itemsData = itemsResp.data || itemsResp
        items.value = itemsData.data || itemsData || []
      } catch (e) {
        console.warn('加载分录明细失败:', e)
      }
    } catch (error) {
      console.error('加载凭证详情失败:', error)
      showToast('加载失败')
    } finally {
      loading.value = false
    }
  }

  const handlePost = async () => {
    try {
      await showConfirmDialog({ title: '确认过账', message: '过账后凭证将无法修改，确认过账？' })
      await financeApi.approveEntry(route.params.id)
      showToast('过账成功')
      loadEntry()
    } catch (e) {
      if (e !== 'cancel') {
        console.error('过账失败:', e)
        showToast('过账失败')
      }
    }
  }

  onMounted(() => {
    loadEntry()
  })
</script>

<style lang="scss" scoped>
  .detail-page {
    min-height: 100vh;
    background: var(--bg-primary);
    padding-bottom: 20px;
  }

  .detail-body {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .post-btn {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-accent, var(--color-primary));
    padding: 4px 12px;
    border-radius: 16px;
    background: var(--color-accent-bg, rgba(59, 130, 246, 0.1));
  }

  // 凭证头
  .entry-hero {
    background: var(--bg-secondary);
    border-radius: 14px;
    padding: 16px;
    border: 1px solid var(--glass-border);
  }

  .hero-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .entry-number {
    font-size: 1.125rem;
    font-weight: 800;
    color: var(--text-primary);
    font-family: 'SF Mono', 'Consolas', monospace;
  }

  .entry-status {
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 0.6875rem;
    font-weight: 700;
    &.posted {
      background: rgba(16, 185, 129, 0.1);
      color: var(--color-success);
    }
    &.draft {
      background: rgba(245, 158, 11, 0.1);
      color: #d97706;
    }
  }

  .hero-desc {
    font-size: 0.875rem;
    color: var(--text-primary);
    margin-bottom: 8px;
  }

  .hero-meta {
    display: flex;
    gap: 16px;
    font-size: 0.75rem;
    color: var(--text-tertiary);
  }

  // 金额汇总
  .amount-summary {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .amount-card {
    padding: 14px;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    &.debit-bg {
      background: rgba(16, 185, 129, 0.08);
      border: 1px solid rgba(16, 185, 129, 0.15);
    }
    &.credit-bg {
      background: rgba(239, 68, 68, 0.08);
      border: 1px solid rgba(239, 68, 68, 0.15);
    }
  }

  .amount-label {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
  }

  .amount-value {
    font-size: 1.0625rem;
    font-weight: 800;
    font-family: 'SF Mono', 'Consolas', monospace;
    color: var(--text-primary);
  }

  // 分录明细
  .items-section {
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

  .entry-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 0;
    border-bottom: 1px solid var(--glass-border);
    &:last-child {
      border-bottom: none;
    }
  }

  .item-left {
    .item-idx {
      width: 22px;
      height: 22px;
      border-radius: 6px;
      background: var(--color-accent-bg);
      color: var(--color-accent);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.6875rem;
      font-weight: 700;
    }
  }

  .item-body {
    flex: 1;
    min-width: 0;
  }

  .item-account {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .account-code {
    font-size: 0.75rem;
    font-weight: 700;
    font-family: 'SF Mono', 'Consolas', monospace;
    color: var(--text-secondary);
  }

  .account-name {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .item-desc {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
    margin-top: 2px;
  }

  .item-amounts {
    text-align: right;
    flex-shrink: 0;
  }

  .item-debit,
  .item-credit {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.8125rem;
    font-weight: 700;
    font-family: 'SF Mono', 'Consolas', monospace;
  }

  .amt-label {
    font-size: 0.5625rem;
    padding: 1px 4px;
    border-radius: 4px;
    font-weight: 700;
  }

  .item-debit .amt-label {
    background: rgba(16, 185, 129, 0.1);
    color: var(--color-success);
  }
  .item-credit .amt-label {
    background: rgba(239, 68, 68, 0.1);
    color: var(--color-danger);
  }

  .item-debit .amt-value {
    color: var(--color-success);
  }
  .item-credit .amt-value {
    color: var(--color-danger);
  }

  // 信息区
  .info-section {
    background: var(--bg-secondary);
    border-radius: 14px;
    padding: 16px;
    border: 1px solid var(--glass-border);
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

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding-top: 40vh;
    color: var(--text-tertiary);
  }
</style>
