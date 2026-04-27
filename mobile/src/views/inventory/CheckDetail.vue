<!--
/**
 * CheckDetail.vue
 * @description 盘点单详情页面 — 暗色主题统一风格
 * @date 2026-04-15
 * @version 2.0.0
 */
-->
<template>
  <div class="detail-page">
    <NavBar title="盘点单详情" left-arrow @click-left="router.push('/inventory/check')" />

    <div class="content-wrapper" v-if="!loading && detail.id">
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
            <span class="order-date" v-if="detail.check_date">{{ detail.check_date }}</span>
          </div>
          <span class="order-no">{{ detail.check_no }}</span>
        </div>
      </div>

      <!-- 基本信息 -->
      <div class="section-header">基本信息</div>
      <div class="info-card">
        <div class="info-row">
          <span class="info-label">盘点类型</span>
          <span class="info-value">{{ getCheckTypeText(detail.check_type) }}</span>
        </div>
        <div class="info-row" v-if="detail.warehouse">
          <span class="info-label">仓库/库区</span>
          <span class="info-value">{{ detail.warehouse }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">创建人</span>
          <span class="info-value">{{ detail.creator || '—' }}</span>
        </div>
        <div class="info-row" v-if="detail.status === 'completed'">
          <span class="info-label">盘点结果</span>
          <span class="info-value" :class="getResultClass(detail.profit_loss)">
            {{ getResultText(detail.profit_loss) }}
          </span>
        </div>
        <div class="info-row" v-if="detail.description">
          <span class="info-label">描述</span>
          <span class="info-value remark">{{ detail.description }}</span>
        </div>
        <div class="info-row" v-if="detail.remarks">
          <span class="info-label">备注</span>
          <span class="info-value remark">{{ detail.remarks }}</span>
        </div>
      </div>

      <!-- 物料明细 -->
      <div class="section-header">
        物料明细
        <span class="section-count">{{ detail.items ? detail.items.length : 0 }}</span>
      </div>

      <div v-if="!detail.items || detail.items.length === 0" class="empty-items">
        <Empty description="暂无物料明细" />
      </div>

      <div
        v-for="(item, index) in detail.items"
        :key="item.id || index"
        class="material-card"
        :style="{ animationDelay: `${index * 0.05}s` }"
      >
        <div class="card-accent" :class="getDiffAccent(item.book_qty, item.actual_qty)"></div>
        <div class="card-body">
          <div class="mat-header">
            <div class="mat-title-area">
              <span class="mat-name">{{ item.material_name || '未知物料' }}</span>
              <span class="mat-code">{{ item.material_code || '' }}</span>
            </div>
            <span class="diff-badge" :class="getDiffAccent(item.book_qty, item.actual_qty)">
              {{ getDiffText(item.book_qty, item.actual_qty) }}
            </span>
          </div>
          <div class="mat-details">
            <div class="detail-cell">
              <span class="detail-label">账面数量</span>
              <span class="detail-value">{{ item.book_qty }} {{ item.unit_name || '' }}</span>
            </div>
            <div class="detail-cell">
              <span class="detail-label">实盘数量</span>
              <span class="detail-value highlight"
                >{{ item.actual_qty }} {{ item.unit_name || '' }}</span
              >
            </div>
          </div>
          <div class="mat-remark" v-if="item.remarks">
            <span class="remark-label">备注:</span> {{ item.remarks }}
          </div>
        </div>
      </div>
    </div>

    <!-- 加载中 -->
    <div class="loading-container" v-else-if="loading">
      <Loading size="24px" vertical color="var(--color-accent)">加载中...</Loading>
    </div>
    <!-- 空状态 -->
    <div class="empty-container" v-else>
      <Empty description="未找到盘点单信息" />
    </div>

    <!-- 底部操作栏 -->
    <div
      class="bottom-bar"
      v-if="
        detail.id &&
        (detail.status === 'draft' ||
          detail.status === 'in_progress' ||
          (detail.status === 'completed' && detail.profit_loss !== 0))
      "
    >
      <template v-if="detail.status === 'draft'">
        <VanButton
          type="default"
          round
          size="small"
          @click="router.push(`/inventory/check/${detail.id}/edit`)"
          style="flex: 1"
          >编辑</VanButton
        >
        <VanButton
          type="primary"
          round
          size="small"
          @click="handleUpdateStatus('in_progress')"
          :loading="submitting"
          style="flex: 1"
          >开始盘点</VanButton
        >
      </template>
      <VanButton
        v-if="detail.status === 'in_progress'"
        type="primary"
        round
        block
        :loading="submitting"
        @click="handleUpdateStatus('completed')"
        >完成盘点</VanButton
      >
      <VanButton
        v-if="detail.status === 'completed' && detail.profit_loss !== 0"
        type="warning"
        round
        block
        :loading="submitting"
        @click="handleAdjust"
        >调整库存</VanButton
      >
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { useRouter, useRoute } from 'vue-router'
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

  const router = useRouter()
  const route = useRoute()
  const loading = ref(true)
  const submitting = ref(false)
  const detail = ref({})

  const loadDetail = async () => {
    loading.value = true
    try {
      const res = await inventoryApi.getCheckDetail(route.params.id)
      detail.value = res?.data || {}
    } catch (e) {
      console.error('获取盘点单详情失败:', e)
      showToast('加载失败')
    } finally {
      loading.value = false
    }
  }

  const getStatusText = (s) =>
    ({
      draft: '草稿',
      in_progress: '进行中',
      pending: '待审核',
      completed: '已完成',
      cancelled: '已取消'
    })[s] || s
  const getStatusIcon = (s) =>
    ({ draft: 'edit', in_progress: 'clock-o', completed: 'checked', cancelled: 'close' })[s] ||
    'info-o'
  const getStatusAccent = (s) =>
    ({
      draft: 'status-draft',
      in_progress: 'status-progress',
      completed: 'status-completed',
      cancelled: 'status-cancelled'
    })[s] || ''
  const getCheckTypeText = (t) =>
    ({ cycle: '周期盘点', random: '随机盘点', full: '全面盘点', special: '专项盘点' })[t] ||
    t ||
    '—'
  const getResultText = (v) => (!v ? '无差异' : v > 0 ? `盘盈 +${v}` : `盘亏 ${v}`)
  const getResultClass = (v) => (!v ? '' : v > 0 ? 'text-profit' : 'text-loss')
  const getDiffText = (book, actual) => {
    if (book === undefined || actual === undefined) return '0'
    const d = actual - book
    return d > 0 ? `+${d}` : `${d}`
  }
  const getDiffAccent = (book, actual) => {
    if (book === undefined || actual === undefined) return 'accent-neutral'
    const d = actual - book
    return d > 0 ? 'accent-green' : d < 0 ? 'accent-red' : 'accent-neutral'
  }

  const handleUpdateStatus = async (newStatus) => {
    try {
      await showConfirmDialog({
        title: '确认操作',
        message: `确定要将状态更新为"${getStatusText(newStatus)}"吗？`
      })
      submitting.value = true
      await inventoryApi.updateCheckStatus(detail.value.id, newStatus)
      showToast('状态更新成功')
      await loadDetail()
    } catch (e) {
      if (e !== 'cancel') showToast('操作失败')
    } finally {
      submitting.value = false
    }
  }

  const handleAdjust = async () => {
    try {
      await showConfirmDialog({ title: '调整库存', message: '确定要根据盘点结果调整库存吗？' })
      submitting.value = true
      await inventoryApi.adjustInventory(detail.value.id)
      showToast('库存调整成功')
      await loadDetail()
    } catch (e) {
      if (e !== 'cancel') showToast('操作失败')
    } finally {
      submitting.value = false
    }
  }

  onMounted(() => loadDetail())
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
      color: var(--text-secondary);
    }
    &.status-progress {
      background: rgba(245, 158, 11, 0.12);
      color: var(--color-warning);
    }
    &.status-completed {
      background: rgba(16, 185, 129, 0.12);
      color: var(--color-success);
    }
    &.status-cancelled {
      background: rgba(239, 68, 68, 0.1);
      color: var(--color-danger);
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
      color: var(--text-secondary);
    }
    &.status-progress {
      background: rgba(245, 158, 11, 0.12);
      color: var(--color-warning);
    }
    &.status-completed {
      background: rgba(16, 185, 129, 0.12);
      color: var(--color-success);
    }
    &.status-cancelled {
      background: rgba(239, 68, 68, 0.1);
      color: var(--color-danger);
    }
  }
  .order-date {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
  }
  .order-no {
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--text-primary);
    font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
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
    background: var(--color-warning);
    color: var(--text-primary);
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
    &.text-profit {
      color: var(--color-success);
      font-weight: 700;
    }
    &.text-loss {
      color: var(--color-danger);
      font-weight: 700;
    }
  }

  .empty-items {
    padding: 30px 0;
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
    &.accent-green {
      background: linear-gradient(180deg, var(--color-success), #34d399);
    }
    &.accent-red {
      background: linear-gradient(180deg, var(--color-danger), var(--color-danger));
    }
    &.accent-neutral {
      background: linear-gradient(180deg, var(--text-secondary), #cbd5e1);
    }
  }
  .card-body {
    flex: 1;
    padding: 12px 14px;
    min-width: 0;
  }
  .mat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .mat-title-area {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    flex: 1;
  }
  .mat-name {
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mat-code {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
    font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
    flex-shrink: 0;
  }
  .diff-badge {
    padding: 2px 10px;
    border-radius: 10px;
    font-size: 0.75rem;
    font-weight: 800;
    flex-shrink: 0;
    font-family: 'SF Mono', 'Menlo', monospace;
    &.accent-green {
      background: rgba(16, 185, 129, 0.12);
      color: var(--color-success);
    }
    &.accent-red {
      background: rgba(239, 68, 68, 0.12);
      color: var(--color-danger);
    }
    &.accent-neutral {
      background: rgba(148, 163, 184, 0.1);
      color: var(--text-secondary);
    }
  }
  .mat-details {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    padding-top: 8px;
    border-top: 1px solid var(--glass-border);
  }
  .detail-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .detail-label {
    font-size: 0.625rem;
    color: var(--text-tertiary);
  }
  .detail-value {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-primary);
    &.highlight {
      color: var(--color-warning);
      font-weight: 700;
    }
  }
  .mat-remark {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px dashed var(--glass-border);
    font-size: 0.6875rem;
    color: var(--text-tertiary);
    .remark-label {
      font-weight: 600;
    }
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
    display: flex;
    gap: 8px;
  }
</style>
