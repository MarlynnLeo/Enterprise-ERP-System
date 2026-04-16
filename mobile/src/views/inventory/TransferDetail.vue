<!--
/**
 * TransferDetail.vue
 * @description 调拨单详情页面 — 与出库/入库详情统一风格，字段与后端对齐
 * @date 2026-04-15
 * @version 2.0.0
 */
-->
<template>
  <div class="detail-page">
    <NavBar title="调拨单详情" left-arrow @click-left="router.back()" />

    <div class="content-wrapper" v-if="detail">
      <!-- 状态卡片 -->
      <div class="status-banner">
        <div class="status-icon-wrap" :class="getStatusAccent(detail.status)">
          <Icon :name="getStatusIcon(detail.status)" size="1.5rem" />
        </div>
        <div class="status-main">
          <div class="status-top-row">
            <span class="status-tag" :class="getStatusAccent(detail.status)">{{
              getStatusText(detail.status)
            }}</span>
            <span class="order-date">{{ formatDate(detail.created_at) }}</span>
          </div>
          <span class="order-no">{{ detail.transfer_no }}</span>
        </div>
      </div>

      <!-- 调拨路线 -->
      <div class="route-card">
        <div class="route-side">
          <span class="route-label">调出仓库</span>
          <span class="route-name from">{{ detail.from_location || '—' }}</span>
        </div>
        <div class="route-arrow">
          <Icon name="arrow" size="20" color="var(--text-tertiary)" />
        </div>
        <div class="route-side">
          <span class="route-label">调入仓库</span>
          <span class="route-name to">{{ detail.to_location || '—' }}</span>
        </div>
      </div>

      <!-- 基本信息 -->
      <div class="section-header">基本信息</div>
      <div class="info-card">
        <div class="info-row">
          <span class="info-label">调拨日期</span>
          <span class="info-value">{{ detail.transfer_date || '—' }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">创建人</span>
          <span class="info-value">{{ detail.creator || '—' }}</span>
        </div>
        <div class="info-row" v-if="detail.remark">
          <span class="info-label">备注</span>
          <span class="info-value remark">{{ detail.remark }}</span>
        </div>
      </div>

      <!-- 物料明细 -->
      <div class="section-header">
        物料明细
        <span class="section-count">{{ detail.items ? detail.items.length : 0 }}</span>
      </div>

      <div
        v-for="(item, index) in detail.items"
        :key="item.id || index"
        class="material-card"
        :style="{ animationDelay: `${index * 0.05}s` }"
      >
        <div class="card-accent accent-purple"></div>
        <div class="card-body">
          <div class="material-header">
            <div class="material-title-area">
              <span class="material-name">{{ item.material_name || '未知物料' }}</span>
              <span class="material-code">{{ item.material_code || '' }}</span>
            </div>
            <span class="material-qty"
              >{{ item.quantity }} <span class="qty-unit">{{ item.unit_name || '' }}</span></span
            >
          </div>
          <div class="material-spec" v-if="item.specification">{{ item.specification }}</div>
        </div>
      </div>

      <div v-if="!detail.items || detail.items.length === 0" class="empty-items">
        <Empty description="暂无物料明细" />
      </div>
    </div>

    <!-- 加载中 -->
    <div class="loading-container" v-else-if="loading">
      <Loading size="24px" vertical color="var(--color-accent)">加载中...</Loading>
    </div>
    <!-- 空状态 -->
    <div class="empty-container" v-else>
      <Empty description="未找到调拨单信息" />
      <VanButton size="small" type="primary" plain @click="fetchDetail" style="margin-top: 12px"
        >重试</VanButton
      >
    </div>

    <!-- 底部操作栏 -->
    <div
      class="bottom-bar"
      v-if="detail && (detail.status === 'draft' || detail.status === 'approved')"
    >
      <VanButton
        v-if="detail.status === 'draft'"
        type="primary"
        block
        round
        :loading="submitting"
        @click="handleSubmit"
        >提交审批</VanButton
      >
      <VanButton
        v-if="detail.status === 'approved'"
        type="warning"
        block
        round
        :loading="submitting"
        @click="handleComplete"
        >执行调拨</VanButton
      >
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import {
    NavBar,
    Icon,
    Empty,
    Loading,
    Button as VanButton,
    showToast,
    showConfirmDialog
  } from 'vant'
  import { inventoryApi } from '@/services/api'
  import dayjs from 'dayjs'

  const route = useRoute()
  const router = useRouter()
  const id = route.params.id
  const loading = ref(true)
  const submitting = ref(false)
  const detail = ref(null)

  const fetchDetail = async () => {
    loading.value = true
    try {
      const res = await inventoryApi.getTransferDetail(id)
      detail.value = res.data || res
    } catch (e) {
      console.error('获取调拨单详情失败:', e)
      showToast('加载失败')
    } finally {
      loading.value = false
    }
  }

  const formatDate = (d) => (d ? dayjs(d).format('YYYY-MM-DD HH:mm') : '—')
  const getStatusText = (s) =>
    ({
      draft: '草稿',
      pending: '待审批',
      approved: '已批准',
      completed: '已完成',
      cancelled: '已取消'
    })[s] || s
  const getStatusIcon = (s) =>
    ({
      draft: 'edit',
      pending: 'clock-o',
      approved: 'passed',
      completed: 'checked',
      cancelled: 'close'
    })[s] || 'info-o'
  const getStatusAccent = (s) =>
    ({
      draft: 'status-draft',
      pending: 'status-pending',
      approved: 'status-approved',
      completed: 'status-completed',
      cancelled: 'status-cancelled'
    })[s] || ''

  const handleSubmit = async () => {
    try {
      await showConfirmDialog({ title: '提交审批', message: '确定要提交该调拨单审批吗？' })
      submitting.value = true
      await inventoryApi.updateTransferStatus(id, 'pending')
      showToast({ type: 'success', message: '已提交' })
      fetchDetail()
    } catch (e) {
      if (e !== 'cancel') showToast('操作失败')
    } finally {
      submitting.value = false
    }
  }

  const handleComplete = async () => {
    try {
      await showConfirmDialog({
        title: '执行调拨',
        message: '确认执行该调拨单？\n库存将从调出仓库转移至调入仓库。'
      })
      submitting.value = true
      await inventoryApi.updateTransferStatus(id, 'completed')
      showToast({ type: 'success', message: '调拨成功' })
      fetchDetail()
    } catch (e) {
      if (e !== 'cancel') showToast('操作失败')
    } finally {
      submitting.value = false
    }
  }

  onMounted(() => fetchDetail())
</script>

<style lang="scss" scoped>
  .detail-page {
    min-height: 100vh;
    background-color: var(--bg-primary);
    padding-bottom: 80px;
  }
  .content-wrapper {
    padding: 0 12px 12px;
  }

  .status-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--bg-secondary);
    border-radius: 12px;
    padding: 14px 16px;
    margin: 8px 0;
    border: 1px solid var(--glass-border);
  }
  .status-icon-wrap {
    width: 48px;
    height: 48px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    &.status-draft {
      background: rgba(148, 163, 184, 0.15);
      color: #94a3b8;
    }
    &.status-pending {
      background: rgba(245, 158, 11, 0.12);
      color: #f59e0b;
    }
    &.status-approved {
      background: rgba(59, 130, 246, 0.12);
      color: #3b82f6;
    }
    &.status-completed {
      background: rgba(16, 185, 129, 0.12);
      color: #10b981;
    }
    &.status-cancelled {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
    }
  }
  .status-main {
    flex: 1;
    min-width: 0;
  }
  .status-top-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }
  .status-tag {
    display: inline-flex;
    padding: 2px 10px;
    border-radius: 10px;
    font-size: 0.75rem;
    font-weight: 700;
    &.status-draft {
      background: rgba(148, 163, 184, 0.12);
      color: #94a3b8;
    }
    &.status-pending {
      background: rgba(245, 158, 11, 0.12);
      color: #f59e0b;
    }
    &.status-approved {
      background: rgba(59, 130, 246, 0.12);
      color: #3b82f6;
    }
    &.status-completed {
      background: rgba(16, 185, 129, 0.12);
      color: #10b981;
    }
    &.status-cancelled {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
    }
  }
  .order-date {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
    font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  }
  .order-no {
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--text-primary);
    font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  }

  // 调拨路线卡片
  .route-card {
    display: flex;
    align-items: center;
    background: var(--bg-secondary);
    border-radius: 12px;
    padding: 14px 8px;
    margin: 8px 0;
    border: 1px solid var(--glass-border);
  }
  .route-side {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .route-label {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
  }
  .route-name {
    font-size: 0.9375rem;
    font-weight: 700;
    &.from {
      color: #ef4444;
    }
    &.to {
      color: #10b981;
    }
  }
  .route-arrow {
    padding: 0 8px;
    flex-shrink: 0;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8125rem;
    font-weight: 700;
    color: var(--text-secondary);
    margin: 16px 4px 8px;
  }
  .section-count {
    min-width: 18px;
    height: 18px;
    line-height: 18px;
    text-align: center;
    font-size: 0.625rem;
    font-weight: 700;
    border-radius: 9px;
    background: #a855f7;
    color: #fff;
    padding: 0 5px;
  }

  .info-card {
    background: var(--bg-secondary);
    border-radius: 12px;
    padding: 4px 0;
    border: 1px solid var(--glass-border);
  }
  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 10px 16px;
    &:not(:last-child) {
      border-bottom: 1px solid var(--glass-border);
    }
  }
  .info-label {
    font-size: 0.8125rem;
    color: var(--text-tertiary);
    flex-shrink: 0;
    min-width: 70px;
  }
  .info-value {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-primary);
    text-align: right;
    flex: 1;
    &.remark {
      color: var(--text-secondary);
      font-size: 0.75rem;
    }
  }

  .material-card {
    display: flex;
    background: var(--bg-secondary);
    border-radius: 12px;
    margin-bottom: 10px;
    overflow: hidden;
    border: 1px solid var(--glass-border);
    animation: fadeInUp 0.35s ease-out both;
  }
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .card-accent {
    width: 4px;
    flex-shrink: 0;
    &.accent-purple {
      background: linear-gradient(180deg, #a855f7, #c084fc);
    }
  }
  .card-body {
    flex: 1;
    padding: 12px 14px;
    min-width: 0;
  }
  .material-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }
  .material-title-area {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    flex: 1;
  }
  .material-name {
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .material-code {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
    font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
    flex-shrink: 0;
  }
  .material-qty {
    font-size: 0.875rem;
    font-weight: 800;
    color: #a855f7;
    flex-shrink: 0;
    font-family: 'SF Mono', 'Menlo', monospace;
    .qty-unit {
      font-size: 0.625rem;
      font-weight: 500;
      opacity: 0.7;
    }
  }
  .material-spec {
    font-size: 0.75rem;
    color: var(--text-tertiary);
  }

  .empty-items {
    padding: 30px 0;
  }
  .loading-container,
  .empty-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px 20px;
  }
  .bottom-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 12px 16px;
    padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    background: var(--bg-secondary);
    border-top: 1px solid var(--glass-border);
    z-index: 40;
  }
</style>
