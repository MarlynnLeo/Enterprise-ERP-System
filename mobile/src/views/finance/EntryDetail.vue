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
        <div v-if="canPost" v-permission="'finance:entries:approve'" class="post-btn" @click="handlePost">过账</div>
      </template>
    </NavBar>

    <div class="detail-body" v-if="entry">
      <!-- 凭证头 -->
      <div class="entry-hero">
        <div class="hero-row">
          <span class="entry-number">{{ entry.entryNumber || entry.technicalId || '—' }}</span>
          <span class="entry-status" :class="entry.isPosted ? 'posted' : 'draft'">
            {{ statusText }}
          </span>
        </div>
        <div class="hero-desc">{{ entry.description || '无摘要' }}</div>
        <div class="hero-meta">
          <span><VanIcon name="calendar-o" /> {{ formatDate(entry.entryDate) }}</span>
          <span><VanIcon name="contact-o" /> {{ entry.creatorName || entry.createdBy || '—' }}</span>
        </div>
      </div>

      <!-- 金额汇总 -->
      <div class="amount-summary">
        <div class="amount-card debit-bg">
          <span class="amount-label">借方合计</span>
          <span class="amount-value">¥{{ formatMoney(entry.totalDebit) }}</span>
        </div>
        <div class="amount-card credit-bg">
          <span class="amount-label">贷方合计</span>
          <span class="amount-value">¥{{ formatMoney(entry.totalCredit) }}</span>
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
              <span class="account-code">{{ item.accountCode || '' }}</span>
              <span class="account-name">{{ item.accountName || '' }}</span>
            </div>
            <div class="item-desc" v-if="item.description">{{ item.description }}</div>
          </div>
          <div class="item-amounts">
            <div class="item-debit" v-if="(item.debitAmount) > 0">
              <span class="amt-label">借</span>
              <span class="amt-value"
                >¥{{ formatMoney(item.debitAmount) }}</span
              >
            </div>
            <div class="item-credit" v-if="(item.creditAmount) > 0">
              <span class="amt-label">贷</span>
              <span class="amt-value"
                >¥{{ formatMoney(item.creditAmount) }}</span
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
            <span class="info-value">{{ entry.documentType || '记账凭证' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">过账日期</span>
            <span class="info-value">{{ formatDate(entry.postingDate) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">会计期间</span>
            <span class="info-value">{{ entry.periodName || entry.periodId || '—' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">创建时间</span>
            <span class="info-value">{{ formatDate(entry.createdAt) }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="loading-state" v-else-if="loading">
      <Loading size="24px" />
      <span>加载中...</span>
    </div>
    <Empty v-else :description="errorMessage || '凭证不存在或加载失败'">
      <Button type="primary" plain @click="loadEntry">重新加载凭证</Button>
    </Empty>
  </div>
</template>

<script setup>
  import { computed, ref, watch, onBeforeUnmount } from 'vue'
  import { useRoute } from 'vue-router'
  import { NavBar, Loading, Empty, Button, Icon as VanIcon, showToast, showConfirmDialog } from 'vant'
  import { financeApi, default as api } from '@/api'
  import { extractApiData } from '@/utils/apiHelper'
  import { getApiErrorMessage } from '@/utils/errorHandler'
  import dayjs from 'dayjs'

  const route = useRoute()
  const entry = ref(null)
  const items = ref([])
  const loading = ref(true)
  const posting = ref(false)
  const errorMessage = ref('')
  let requestSequence = 0
  let actionSequence = 0
  let disposed = false
  const canPost = computed(() => entry.value?.isPosted === false && !entry.value?.isReversed && !loading.value && !posting.value)
  const statusText = computed(() => entry.value?.isReversed ? '已冲销' : entry.value?.isPosted ? '已过账' : '草稿')

  const formatMoney = (amount) => {
    if (amount == null || !Number.isFinite(Number(amount))) return '—'
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
    const sequence = ++requestSequence
    const id = route.params.id
    const isCurrent = () => !disposed && sequence === requestSequence
    loading.value = true
    entry.value = null
    items.value = []
    errorMessage.value = ''
    try {
      if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new Error('凭证编号无效')
      const [response, itemsResp] = await Promise.all([
        financeApi.getEntry(id),
        api.get(`/finance/entries/${id}/items`)
      ])
      if (!isCurrent()) return
      const data = extractApiData(response)
      const loadedEntry = data.entry ?? data
      const loadedItems = extractApiData(itemsResp, [])
      if (String(loadedEntry?.id) !== String(id) || !Array.isArray(loadedItems)) {
        throw new Error('凭证数据不完整，请重新加载')
      }
      entry.value = loadedEntry
      items.value = loadedItems
    } catch (error) {
      if (!isCurrent()) return
      console.error('加载凭证详情失败:', error)
      errorMessage.value = getApiErrorMessage(error, '凭证加载失败，请重试')
    } finally {
      if (isCurrent()) loading.value = false
    }
  }

  const handlePost = async () => {
    if (!canPost.value) return
    const id = entry.value.id
    const sequence = ++actionSequence
    const isCurrent = () => !disposed && sequence === actionSequence && String(route.params.id) === String(id)
    posting.value = true
    try {
      await showConfirmDialog({ title: '确认过账', message: '过账后凭证将无法修改，确认过账？' })
      if (!isCurrent()) return
      await financeApi.approveEntry(id)
      if (!isCurrent()) return
      showToast('过账成功')
      await loadEntry()
    } catch (e) {
      if (isCurrent() && e !== 'cancel' && e !== 'close') {
        console.error('过账失败:', e)
        showToast(getApiErrorMessage(e, '过账失败'))
      }
    } finally {
      if (isCurrent()) posting.value = false
    }
  }

  watch(() => route.params.id, () => {
    actionSequence++
    posting.value = false
    loadEntry()
  }, { immediate: true })

  onBeforeUnmount(() => { disposed = true; requestSequence++; actionSequence++ })
</script>

<style lang="scss" scoped>
  .detail-page {
    min-height: 100%;
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
    color: var(--color-accent-text, var(--color-primary));
    padding: 4px 12px;
    border-radius: 16px;
    background: var(--color-accent-bg, rgba(59, 130, 246, 0.1));
  }

  // 凭证头
  .entry-hero {
    background: var(--bg-secondary);
    border-radius: 14px;
    padding: 16px;
    border: 1px solid var(--surface-border, var(--border-subtle));
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
    font-family: var(--font-ui);
  }

  .entry-status {
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 0.6875rem;
    font-weight: 700;
    &.posted {
      background: rgba(16, 185, 129, 0.1);
      color: var(--color-success-text);
    }
    &.draft {
      background: rgba(245, 158, 11, 0.1);
      color: var(--color-warning-text);
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
    font-family: var(--font-ui);
    color: var(--text-primary);
  }

  // 分录明细
  .items-section {
    background: var(--bg-secondary);
    border-radius: 14px;
    padding: 16px;
    border: 1px solid var(--surface-border, var(--border-subtle));
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
    border-bottom: 1px solid var(--surface-border, var(--border-subtle));
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
      color: var(--color-accent-text);
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
    font-family: var(--font-ui);
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
    font-family: var(--font-ui);
  }

  .amt-label {
    font-size: 0.5625rem;
    padding: 1px 4px;
    border-radius: 4px;
    font-weight: 700;
  }

  .item-debit .amt-label {
    background: rgba(16, 185, 129, 0.1);
    color: var(--color-success-text);
  }
  .item-credit .amt-label {
    background: rgba(239, 68, 68, 0.1);
    color: var(--color-danger-text);
  }

  .item-debit .amt-value {
    color: var(--color-success-text);
  }
  .item-credit .amt-value {
    color: var(--color-danger-text);
  }

  // 信息区
  .info-section {
    background: var(--bg-secondary);
    border-radius: 14px;
    padding: 16px;
    border: 1px solid var(--surface-border, var(--border-subtle));
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
