<!--
/**
 * PeriodDetail.vue - 会计期间详情
 * @description 展示会计期间的完整信息和状态操作
 * @date 2026-04-15
 * @version 1.0.0
 */
-->
<template>
  <div class="detail-page">
    <NavBar title="期间详情" left-arrow @click-left="$router.go(-1)" />

    <div class="detail-body" v-if="period">
      <!-- 头部卡片 -->
      <div class="period-hero">
        <div class="hero-icon" :class="period.is_closed ? 'closed' : 'open'">
          <SvgIcon :name="period.is_closed ? 'lock-closed' : 'calendar'" size="1.5rem" />
        </div>
        <div class="hero-info">
          <div class="hero-name">{{ period.period_name }}</div>
          <div class="hero-year">{{ period.fiscal_year }} 年度</div>
        </div>
        <div class="hero-status" :class="period.is_closed ? 'closed' : 'open'">
          {{ period.is_closed ? '已关闭' : '已开启' }}
        </div>
      </div>

      <!-- 日期范围 -->
      <div class="date-card">
        <div class="date-item">
          <span class="date-label">开始日期</span>
          <span class="date-value">{{ formatDate(period.start_date) }}</span>
        </div>
        <div class="date-divider">
          <SvgIcon name="chevron-right" size="1rem" />
        </div>
        <div class="date-item">
          <span class="date-label">结束日期</span>
          <span class="date-value">{{ formatDate(period.end_date) }}</span>
        </div>
      </div>

      <!-- 基本信息 -->
      <div class="info-section">
        <div class="section-title">基本信息</div>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">期间名称</span>
            <span class="info-value">{{ period.period_name }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">所属年度</span>
            <span class="info-value">{{ period.fiscal_year }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">是否调整期</span>
            <span class="info-value">{{ period.is_adjusting ? '是' : '否' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">期间状态</span>
            <span class="info-value" :class="period.is_closed ? 'text-red' : 'text-green'">
              {{ period.is_closed ? '已关闭' : '已开启' }}
            </span>
          </div>
          <div class="info-item" v-if="period.closed_at">
            <span class="info-label">关闭时间</span>
            <span class="info-value">{{ formatDate(period.closed_at) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">创建时间</span>
            <span class="info-value">{{ formatDate(period.created_at) }}</span>
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="action-bar">
        <Button v-if="!period.is_closed" type="danger" block round @click="handleClose"
          >关闭期间</Button
        >
        <Button v-else type="primary" block round @click="handleReopen">重新开启</Button>
      </div>
    </div>

    <div class="loading-state" v-else-if="loading">
      <Loading size="24px" />
      <span>加载中...</span>
    </div>
    <Empty v-else description="期间不存在或加载失败" />
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { useRoute } from 'vue-router'
  import { NavBar, Button, Loading, Empty, showToast, showConfirmDialog } from 'vant'
  import SvgIcon from '@/components/icons/index.vue'
  import { financeApi } from '@/services/api'
  import dayjs from 'dayjs'

  const route = useRoute()
  const period = ref(null)
  const loading = ref(true)

  const formatDate = (date) => {
    if (!date) return '—'
    return dayjs(date).format('YYYY-MM-DD')
  }

  const loadPeriod = async () => {
    loading.value = true
    try {
      const id = route.params.id
      const response = await financeApi.getPeriodById(id)
      const respData = response.data || response
      period.value = respData.data?.period || respData.period || respData.data || respData
    } catch (error) {
      console.error('加载期间详情失败:', error)
      showToast('加载失败')
    } finally {
      loading.value = false
    }
  }

  const handleClose = async () => {
    try {
      await showConfirmDialog({
        title: '确认关闭',
        message: '关闭后该期间将不能再录入凭证，确定关闭？'
      })
      await financeApi.closePeriod(route.params.id)
      showToast('期间已关闭')
      loadPeriod()
    } catch (e) {
      if (e !== 'cancel') showToast('操作失败')
    }
  }

  const handleReopen = async () => {
    try {
      await showConfirmDialog({ title: '确认开启', message: '重新开启该会计期间？' })
      await financeApi.reopenPeriod(route.params.id)
      showToast('期间已重新开启')
      loadPeriod()
    } catch (e) {
      if (e !== 'cancel') showToast('操作失败')
    }
  }

  onMounted(() => {
    loadPeriod()
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

  // 头部
  .period-hero {
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
    flex-shrink: 0;
    &.open {
      background: rgba(16, 185, 129, 0.1);
      color: var(--color-success);
    }
    &.closed {
      background: rgba(107, 114, 128, 0.1);
      color: var(--text-secondary);
    }
  }

  .hero-info {
    flex: 1;
  }

  .hero-name {
    font-size: 1.0625rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .hero-year {
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
    &.open {
      background: rgba(16, 185, 129, 0.1);
      color: var(--color-success);
    }
    &.closed {
      background: rgba(107, 114, 128, 0.1);
      color: var(--text-secondary);
    }
  }

  // 日期卡片
  .date-card {
    display: flex;
    align-items: center;
    background: var(--bg-secondary);
    border-radius: 14px;
    padding: 16px;
    border: 1px solid var(--glass-border);
  }

  .date-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .date-divider {
    padding: 0 12px;
    color: var(--text-tertiary);
  }

  .date-label {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
  }

  .date-value {
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-primary);
    font-family: 'SF Mono', 'Consolas', monospace;
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
  .text-green {
    color: var(--color-success);
  }
  .text-red {
    color: var(--color-danger);
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

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding-top: 40vh;
    color: var(--text-tertiary);
  }
</style>
