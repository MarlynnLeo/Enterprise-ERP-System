<!--
/**
 * PlanDetail.vue - 生产计划详情
 * @description 统一卡片风格
 * @date 2026-04-15
 * @version 3.0.0
 */
-->
<template>
  <div class="detail-page">
    <NavBar title="计划详情" left-arrow @click-left="$router.go(-1)" />

    <div class="detail-body" v-if="plan">
      <!-- 头部卡片 -->
      <div class="hero-card">
        <div class="hero-icon"><SvgIcon name="calendar" size="1.5rem" /></div>
        <div class="hero-info">
          <div class="hero-title">{{ plan.name }}</div>
          <div class="hero-sub">{{ plan.code }}</div>
        </div>
        <div class="hero-status" :class="getStatusAccent(plan.status)">
          {{ getStatusText(plan.status) }}
        </div>
      </div>

      <!-- 进度卡片 -->
      <div class="progress-card">
        <div class="progress-header">
          <span class="progress-label">完成进度</span>
          <span class="progress-value">{{ plan.progress || 0 }}%</span>
        </div>
        <div class="progress-bar">
          <div
            class="progress-fill"
            :class="getProgressClass(plan.progress || 0)"
            :style="{ width: (plan.progress || 0) + '%' }"
          ></div>
        </div>
        <div class="progress-meta">
          <span
            >已完成 {{ plan.completedQuantity || 0 }} / {{ plan.quantity }}
            {{ plan.unit || '件' }}</span
          >
        </div>
      </div>

      <!-- 基本信息 -->
      <div class="info-section">
        <div class="section-title">基本信息</div>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">计划编号</span
            ><span class="info-value mono">{{ plan.code }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">计划名称</span><span class="info-value">{{ plan.name }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">产品名称</span
            ><span class="info-value">{{ plan.productName || '—' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">产品编码</span
            ><span class="info-value mono">{{ plan.productCode || '—' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">计划数量</span
            ><span class="info-value highlight">{{ plan.quantity }} {{ plan.unit || '件' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">已完成</span
            ><span class="info-value"
              >{{ plan.completedQuantity || 0 }} {{ plan.unit || '件' }}</span
            >
          </div>
        </div>
      </div>

      <!-- 时间信息 -->
      <div class="info-section">
        <div class="section-title">时间信息</div>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">计划开始</span
            ><span class="info-value">{{ formatDate(plan.startDate) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">计划结束</span
            ><span class="info-value">{{ formatDate(plan.endDate) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">实际开始</span
            ><span class="info-value">{{ formatDate(plan.actualStartDate) || '—' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">实际结束</span
            ><span class="info-value">{{ formatDate(plan.actualEndDate) || '—' }}</span>
          </div>
        </div>
      </div>

      <!-- 备注 -->
      <div class="info-section" v-if="plan.remark">
        <div class="section-title">备注</div>
        <div class="remark-text">{{ plan.remark }}</div>
      </div>

      <!-- 操作按钮（与网页端一致：计划只有取消操作） -->
      <div class="action-bar" v-if="showActions">
        <VanButton
          v-if="canCancel"
          v-permission="'production:plans:update'"
          type="danger"
          plain
          block
          round
          @click="handleCancel"
          >取消计划</VanButton
        >
      </div>
    </div>

    <div class="loading-state" v-else-if="loading">
      <Loading size="24px" /><span>加载中...</span>
    </div>
    <Empty v-else description="计划不存在" />
  </div>
</template>

<script setup>
  import { ref, computed, onMounted } from 'vue'
  import { useRoute } from 'vue-router'
  import { NavBar, Loading, Empty, Button as VanButton, showToast, showConfirmDialog } from 'vant'
  import SvgIcon from '@/components/icons/index.vue'
  import { productionApi } from '@/services/api'
  import dayjs from 'dayjs'

  const route = useRoute()
  const loading = ref(true)
  const plan = ref(null)

  // 与网页端一致：draft/preparing/material_issued/in_progress 状态均可取消
  const canCancel = computed(() => {
    const s = plan.value?.status
    return ['draft', 'preparing', 'material_issued', 'material_issuing', 'in_progress', 'allocated'].includes(s)
  })
  const showActions = computed(() => canCancel.value)

  const formatDate = (d) => (d ? dayjs(d).format('YYYY-MM-DD HH:mm') : '—')
  const getStatusAccent = (s) =>
    ({
      draft: 'st-pending',
      pending: 'st-pending',
      allocated: 'st-allocated',
      preparing: 'st-progress',
      material_issuing: 'st-progress',
      material_issued: 'st-progress',
      in_progress: 'st-progress',
      inspection: 'st-inspection',
      warehousing: 'st-inspection',
      completed: 'st-completed',
      paused: 'st-paused',
      cancelled: 'st-cancelled'
    })[s] || 'st-default'
  const getStatusText = (s) =>
    ({
      draft: '草稿',
      pending: '待开始',
      allocated: '已分配',
      preparing: '备料中',
      material_issuing: '发料中',
      material_partial_issued: '部分发料',
      material_issued: '已发料',
      in_progress: '生产中',
      inspection: '待检验',
      warehousing: '待入库',
      completed: '已完成',
      paused: '已暂停',
      cancelled: '已取消'
    })[s] || s
  const getProgressClass = (p) => {
    if (p >= 100) return 'fill-green'
    if (p >= 50) return 'fill-blue'
    if (p > 0) return 'fill-yellow'
    return 'fill-low'
  }

  const loadPlanDetail = async () => {
    loading.value = true
    try {
      const response = await productionApi.getProductionPlan(route.params.id)
      plan.value = response.data || response
    } catch (e) {
      console.error('加载计划详情失败:', e)
      showToast('加载失败')
    } finally {
      loading.value = false
    }
  }

  // 取消计划（与网页端 handleCancelPlan 一致）
  const handleCancel = async () => {
    try {
      await showConfirmDialog({
        title: '确认取消',
        message: '确定取消此生产计划？',
        confirmButtonColor: 'var(--color-danger)'
      })
      await productionApi.cancelProductionPlan(plan.value.id)
      showToast('已取消')
      loadPlanDetail()
    } catch (e) {
      if (e !== 'cancel' && e?.message !== 'cancel') {
        const errorMsg = e.response?.data?.message || '操作失败'
        showToast(errorMsg)
      }
    }
  }

  onMounted(() => loadPlanDetail())
</script>

<style lang="scss" scoped>
  .detail-page {
    min-height: 100vh;
    background: var(--bg-primary);
    padding-bottom: 120px;
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
    background: rgba(59, 130, 246, 0.1);
    color: var(--color-primary);
    flex-shrink: 0;
  }
  .hero-info {
    flex: 1;
    min-width: 0;
  }
  .hero-title {
    font-size: 1.0625rem;
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
    &.st-pending {
      background: rgba(148, 163, 184, 0.12);
      color: var(--text-secondary);
    }
    &.st-allocated {
      background: rgba(59, 130, 246, 0.1);
      color: var(--color-primary);
    }
    &.st-progress {
      background: rgba(245, 158, 11, 0.12);
      color: var(--color-warning);
    }
    &.st-inspection {
      background: rgba(168, 85, 247, 0.12);
      color: var(--module-purple);
    }
    &.st-completed {
      background: rgba(16, 185, 129, 0.12);
      color: var(--color-success);
    }
    &.st-paused {
      background: rgba(249, 115, 22, 0.12);
      color: var(--module-orange);
    }
    &.st-cancelled {
      background: rgba(239, 68, 68, 0.1);
      color: var(--color-danger);
    }
  }

  .progress-card {
    background: var(--bg-secondary);
    border-radius: 14px;
    padding: 16px;
    border: 1px solid var(--glass-border);
  }
  .progress-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }
  .progress-label {
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }
  .progress-value {
    font-size: 1.125rem;
    font-weight: 800;
    color: var(--text-primary);
    font-family: 'SF Mono', monospace;
  }
  .progress-bar {
    height: 8px;
    background: var(--glass-border);
    border-radius: 4px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.5s;
    &.fill-green {
      background: linear-gradient(90deg, var(--color-success), #34d399);
    }
    &.fill-blue {
      background: linear-gradient(90deg, var(--color-primary), #60a5fa);
    }
    &.fill-yellow {
      background: linear-gradient(90deg, var(--color-warning), var(--color-warning));
    }
    &.fill-low {
      background: linear-gradient(90deg, var(--color-danger), var(--color-danger));
    }
  }
  .progress-meta {
    margin-top: 8px;
    font-size: 0.75rem;
    color: var(--text-tertiary);
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
    &.mono {
      font-family: 'SF Mono', monospace;
    }
    &.highlight {
      color: var(--color-primary);
      font-weight: 700;
    }
  }
  .remark-text {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    line-height: 1.6;
  }

  .action-bar {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 8px;
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
