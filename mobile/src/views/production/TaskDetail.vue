<!--
/**
 * TaskDetail.vue - 生产任务详情
 * @description 统一卡片风格
 * @date 2026-04-15
 * @version 3.0.0
 */
-->
<template>
  <div class="detail-page">
    <NavBar title="任务详情" left-arrow @click-left="$router.go(-1)" />

    <div class="detail-body" v-if="task">
      <!-- 头部卡片 -->
      <div class="hero-card">
        <div class="hero-icon"><SvgIcon name="clipboard-check" size="1.5rem" /></div>
        <div class="hero-info">
          <div class="hero-title">{{ task.product_name }}</div>
          <div class="hero-sub">{{ task.task_code }}</div>
        </div>
        <div class="hero-status" :class="getStatusAccent(task.status)">
          {{ getStatusText(task.status) }}
        </div>
      </div>

      <!-- 进度卡片 -->
      <div class="progress-card">
        <div class="progress-header">
          <span class="progress-label">完成进度</span>
          <span class="progress-value">{{ task.progress || 0 }}%</span>
        </div>
        <div class="progress-bar">
          <div
            class="progress-fill"
            :class="getProgressClass(task.progress || 0)"
            :style="{ width: (task.progress || 0) + '%' }"
          ></div>
        </div>
        <div class="progress-meta">
          已完成 {{ task.completed_quantity || 0 }} / {{ task.quantity }} {{ task.unit || '件' }}
        </div>
      </div>

      <!-- 基本信息 -->
      <div class="info-section">
        <div class="section-title">基本信息</div>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">任务编号</span
            ><span class="info-value mono">{{ task.task_code }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">产品名称</span
            ><span class="info-value">{{ task.product_name }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">产品编码</span
            ><span class="info-value mono">{{ task.product_code || '—' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">工序名称</span
            ><span class="info-value">{{ task.process_name || '—' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">任务数量</span
            ><span class="info-value highlight">{{ task.quantity }} {{ task.unit || '件' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">已完成</span
            ><span class="info-value"
              >{{ task.completed_quantity || 0 }} {{ task.unit || '件' }}</span
            >
          </div>
          <div class="info-item">
            <span class="info-label">工作中心</span
            ><span class="info-value">{{ task.work_center_name || '—' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">负责人</span
            ><span class="info-value">{{ task.operator_name || '—' }}</span>
          </div>
        </div>
      </div>

      <!-- 时间信息 -->
      <div class="info-section">
        <div class="section-title">时间信息</div>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">计划开始</span
            ><span class="info-value">{{ formatDate(task.plan_start_time) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">计划结束</span
            ><span class="info-value">{{ formatDate(task.plan_end_time) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">实际开始</span
            ><span class="info-value">{{ formatDate(task.actual_start_time) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">实际结束</span
            ><span class="info-value">{{ formatDate(task.actual_end_time) }}</span>
          </div>
        </div>
      </div>

      <!-- 备注 -->
      <div class="info-section" v-if="task.remark">
        <div class="section-title">备注</div>
        <div class="remark-text">{{ task.remark }}</div>
      </div>

      <!-- 操作按钮（与网页端一致） -->
      <div class="action-bar" v-if="showActions">
        <!-- pending状态可删除（网页端只有pending可删除） -->
        <VanButton
          v-if="task.status === 'pending'"
          v-permission="'production:tasks:delete'"
          type="danger"
          plain
          block
          round
          @click="handleDelete"
          >删除任务</VanButton
        >
        <!-- in_progress状态可报工 -->
        <VanButton
          v-if="task.status === 'in_progress'"
          v-permission="'production:tasks:update'"
          type="warning"
          block
          round
          @click="handleReport"
          >生产报工</VanButton
        >
      </div>
    </div>

    <div class="loading-state" v-else-if="loading">
      <Loading size="24px" /><span>加载中...</span>
    </div>
    <Empty v-else description="任务不存在" />
  </div>
</template>

<script setup>
  import { ref, computed, onMounted } from 'vue'
  import { useRouter, useRoute } from 'vue-router'
  import { NavBar, Loading, Empty, Button as VanButton, showToast, showConfirmDialog } from 'vant'
  import SvgIcon from '@/components/icons/index.vue'
  import { productionApi } from '@/services/api'
  import dayjs from 'dayjs'

  const router = useRouter()
  const route = useRoute()
  const loading = ref(true)
  const task = ref(null)

  // 是否显示操作栏
  const showActions = computed(() => {
    const s = task.value?.status
    return s === 'pending' || s === 'in_progress'
  })

  const formatDate = (d) => (d ? dayjs(d).format('YYYY-MM-DD HH:mm') : '—')
  const getStatusAccent = (s) =>
    ({
      draft: 'st-pending',
      pending: 'st-pending',
      allocated: 'st-pending',
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

  const loadTaskDetail = async () => {
    loading.value = true
    try {
      const response = await productionApi.getProductionTask(route.params.id)
      task.value = response.data || response
    } catch (e) {
      console.error('加载任务详情失败:', e)
      showToast('加载失败')
    } finally {
      loading.value = false
    }
  }

  // 生产报工
  const handleReport = () => router.push(`/production/tasks/${task.value.id}/report`)

  // 删除任务（仅pending状态，与网页端一致）
  const handleDelete = async () => {
    try {
      await showConfirmDialog({
        title: '删除确认',
        message: '确定要删除该生产任务吗？此操作无法恢复。',
        confirmButtonColor: 'var(--color-danger)'
      })
      await productionApi.deleteProductionTask(task.value.id)
      showToast('已删除')
      router.back()
    } catch (e) {
      if (e !== 'cancel' && e?.message !== 'cancel') {
        const errorMsg = e.response?.data?.message || '操作失败'
        showToast(errorMsg)
      }
    }
  }

  onMounted(() => loadTaskDetail())
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
    background: rgba(168, 85, 247, 0.1);
    color: #a855f7;
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
    &.st-progress {
      background: rgba(245, 158, 11, 0.12);
      color: var(--color-warning);
    }
    &.st-inspection {
      background: rgba(168, 85, 247, 0.12);
      color: #a855f7;
    }
    &.st-completed {
      background: rgba(16, 185, 129, 0.12);
      color: var(--color-success);
    }
    &.st-paused {
      background: rgba(249, 115, 22, 0.12);
      color: #f97316;
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
      color: #a855f7;
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
