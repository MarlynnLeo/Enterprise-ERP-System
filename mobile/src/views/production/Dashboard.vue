<!--
/**
 * Dashboard.vue - 生产看板
 * @description 生产数据可视化看板 - Glassmorphism 风格
 * @date 2025-12-29
 * @version 1.0.0
 */
-->
<template>
  <div class="dashboard-page">
    <!-- 背景模糊层 -->
    <div class="bg-overlay"></div>

    <!-- 顶部导航栏 -->
    <header class="page-header">
      <button class="header-btn" @click="goBack">
        <Icon name="chevron-right" size="1.5rem" class-name="rotate-180" />
      </button>
      <h1 class="header-title">生产看板</h1>
      <button class="header-btn" @click="refreshData">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    </header>

    <!-- 主要内容区域 -->
    <div class="page-content">
      <!-- 今日概览 -->
      <div class="overview-section">
        <h3 class="section-title">今日概览</h3>
        <div class="overview-grid">
          <div class="overview-card">
            <div class="card-icon bg-blue">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div class="card-content">
              <p class="card-label">生产任务</p>
              <p class="card-value">{{ todayStats.totalTasks }}</p>
              <p class="card-trend success">+{{ todayStats.newTasks }} 新增</p>
            </div>
          </div>

          <div class="overview-card">
            <div class="card-icon bg-green">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div class="card-content">
              <p class="card-label">已完成</p>
              <p class="card-value">{{ todayStats.completedTasks }}</p>
              <p class="card-trend success">{{ todayStats.completionRate }}% 完成率</p>
            </div>
          </div>

          <div class="overview-card">
            <div class="card-icon bg-yellow">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div class="card-content">
              <p class="card-label">进行中</p>
              <p class="card-value">{{ todayStats.inProgressTasks }}</p>
              <p class="card-trend">{{ todayStats.inProgressRate }}% 进行中</p>
            </div>
          </div>

          <div class="overview-card">
            <div class="card-icon bg-purple">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <div class="card-content">
              <p class="card-label">产量</p>
              <p class="card-value">{{ todayStats.totalOutput }}</p>
              <p class="card-trend success">{{ todayStats.outputUnit }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- 生产效率 -->
      <div class="efficiency-section">
        <h3 class="section-title">生产效率</h3>
        <div class="efficiency-card">
          <div class="efficiency-item">
            <div class="efficiency-label">
              <span class="label-text">设备利用率</span>
              <span class="label-value">{{ efficiency.equipmentUtilization }}%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: efficiency.equipmentUtilization + '%' }"></div>
            </div>
          </div>

          <div class="efficiency-item">
            <div class="efficiency-label">
              <span class="label-text">人员利用率</span>
              <span class="label-value">{{ efficiency.personnelUtilization }}%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: efficiency.personnelUtilization + '%' }"></div>
            </div>
          </div>

          <div class="efficiency-item">
            <div class="efficiency-label">
              <span class="label-text">合格率</span>
              <span class="label-value">{{ efficiency.qualificationRate }}%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill success" :style="{ width: efficiency.qualificationRate + '%' }"></div>
            </div>
          </div>

          <div class="efficiency-item">
            <div class="efficiency-label">
              <span class="label-text">准时交付率</span>
              <span class="label-value">{{ efficiency.onTimeDeliveryRate }}%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: efficiency.onTimeDeliveryRate + '%' }"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 实时任务 -->
      <div class="realtime-section">
        <h3 class="section-title">实时任务</h3>
        <div class="task-list">
          <div v-for="task in realtimeTasks" :key="task.id" class="task-card">
            <div class="task-header">
              <span class="task-code">{{ task.code }}</span>
              <span class="task-status" :class="getStatusClass(task.status)">
                {{ getStatusText(task.status) }}
              </span>
            </div>
            <h4 class="task-name">{{ task.productName }}</h4>
            <div class="task-progress">
              <div class="progress-info">
                <span class="progress-text">{{ task.completedQuantity }} / {{ task.totalQuantity }} {{ task.unit }}</span>
                <span class="progress-percent">{{ task.progress }}%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: task.progress + '%' }"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '@/components/icons/index.vue'
import { showToast } from 'vant'
import { productionApi } from '@/services/api'

const router = useRouter()

const todayStats = ref({
  totalTasks: 0,
  newTasks: 0,
  completedTasks: 0,
  completionRate: 0,
  inProgressTasks: 0,
  inProgressRate: 0,
  totalOutput: 0,
  outputUnit: '件'
})

const efficiency = ref({
  equipmentUtilization: 0,
  personnelUtilization: 0,
  qualificationRate: 0,
  onTimeDeliveryRate: 0
})

const realtimeTasks = ref([])

const getResponseData = (response) => response?.data || response || {}

const toTaskCard = (task) => {
  const totalQuantity = Number(task.planned_quantity || task.quantity || task.totalQuantity || 0)
  const completedQuantity = Number(task.completed_quantity || task.completedQuantity || 0)
  const progress = totalQuantity > 0 ? Math.min(Math.round((completedQuantity / totalQuantity) * 100), 100) : 0

  return {
    id: task.id,
    code: task.task_code || task.code || task.task_no || '-',
    productName: task.product_name || task.productName || task.material_name || '-',
    totalQuantity,
    completedQuantity,
    unit: task.unit_name || task.unit || '件',
    progress,
    status: task.status || 'pending'
  }
}

const loadDashboardData = async () => {
  const [statsRes, tasksRes] = await Promise.allSettled([
    productionApi.getDashboardStatistics(),
    productionApi.getProductionTasks({ page: 1, pageSize: 10, limit: 10 })
  ])

  if (statsRes.status === 'fulfilled') {
    const stats = getResponseData(statsRes.value)
    const totalTasks = Number(stats.totalTasks || stats.total_tasks || 0)
    const completedTasks = Number(stats.completedTasks || stats.completed_tasks || 0)
    const inProgressTasks = Number(stats.inProgressTasks || stats.in_progress_tasks || 0)

    todayStats.value = {
      totalTasks,
      newTasks: Number(stats.newTasks || stats.new_tasks || stats.pendingTasks || 0),
      completedTasks,
      completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      inProgressTasks,
      inProgressRate: totalTasks > 0 ? Math.round((inProgressTasks / totalTasks) * 100) : 0,
      totalOutput: Number(stats.totalOutput || stats.total_output || stats.completedQuantity || 0),
      outputUnit: stats.outputUnit || stats.output_unit || '件'
    }

    efficiency.value = {
      equipmentUtilization: Number(stats.equipmentUtilization || stats.equipment_utilization || 0),
      personnelUtilization: Number(stats.personnelUtilization || stats.personnel_utilization || 0),
      qualificationRate: Number(stats.qualificationRate || stats.qualification_rate || 0),
      onTimeDeliveryRate: Number(stats.onTimeDeliveryRate || stats.on_time_delivery_rate || 0)
    }
  }

  if (tasksRes.status === 'fulfilled') {
    const data = getResponseData(tasksRes.value)
    const tasks = Array.isArray(data) ? data : (data.items || data.list || data.data || [])
    realtimeTasks.value = Array.isArray(tasks) ? tasks.map(toTaskCard) : []
  }
}

const goBack = () => {
  router.back()
}

const refreshData = async () => {
  try {
    await loadDashboardData()
    showToast({ type: 'success', message: '数据已刷新' })
  } catch (error) {
    console.error('刷新生产看板失败:', error)
    showToast('刷新失败')
  }
}

const getStatusClass = (status) => {
  const statusMap = {
    pending: 'status-pending',
    in_progress: 'status-progress',
    completed: 'status-completed'
  }
  return statusMap[status] || 'status-pending'
}

const getStatusText = (status) => {
  const statusMap = {
    pending: '待开始',
    in_progress: '进行中',
    completed: '已完成'
  }
  return statusMap[status] || '未知'
}

onMounted(() => {
  loadDashboardData().catch((error) => {
    console.error('加载生产看板失败:', error)
  })
})
</script>

<style lang="scss" scoped>
.dashboard-page {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--bg-primary);
}

.bg-overlay {
  position: absolute;
  inset: 0;
  background: var(--bg-primary);
  backdrop-filter: blur(48px);
  -webkit-backdrop-filter: blur(48px);
  z-index: -1;
}

.page-header {
  padding: 3rem 1.5rem 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  background: var(--bg-secondary);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.header-btn {
  padding: 0.5rem;
  margin: -0.5rem;
  border-radius: 50%;
  background: none;
  border: none;
  color: rgb(226, 232, 240);
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.header-btn:active {
  transform: scale(0.95);
}

.header-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary);
}

.page-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.page-content::-webkit-scrollbar {
  display: none;
}

.section-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.75rem;
}

/* 今日概览 */
.overview-section {
  margin-bottom: 1.5rem;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}

.overview-card {
  background: var(--bg-secondary);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--van-border-color);
  border-radius: 0.75rem;
  padding: 1rem;
  display: flex;
  gap: 0.75rem;
}

.card-icon {
  width: 3rem;
  height: 3rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.card-icon.bg-blue {
  background: linear-gradient(135deg, var(--color-primary) 0%, #764ba2 100%);
}

.card-icon.bg-green {
  background: linear-gradient(135deg, #2CCFB0 0%, #1BA392 100%);
}

.card-icon.bg-yellow {
  background: linear-gradient(135deg, var(--color-warning) 0%, #FF8A3D 100%);
}

.card-icon.bg-purple {
  background: linear-gradient(135deg, #a855f7 0%, #9333ea 100%);
}

.card-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.card-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.card-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
}

.card-trend {
  font-size: 0.625rem;
  color: var(--text-secondary);
}

.card-trend.success {
  color: rgb(134, 239, 172);
}

/* 生产效率 */
.efficiency-section {
  margin-bottom: 1.5rem;
}

.efficiency-card {
  background: var(--bg-secondary);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--van-border-color);
  border-radius: 0.75rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.efficiency-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.efficiency-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.label-text {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.label-value {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
}

.progress-bar {
  height: 0.5rem;
  background: var(--bg-tertiary);
  border-radius: 0.25rem;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-primary) 0%, #764ba2 100%);
  border-radius: 0.25rem;
  transition: width 0.3s ease;
}

.progress-fill.success {
  background: linear-gradient(90deg, #2CCFB0 0%, #1BA392 100%);
}

/* 实时任务 */
.realtime-section {
  margin-bottom: 1.5rem;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.task-card {
  background: var(--bg-secondary);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--van-border-color);
  border-radius: 0.75rem;
  padding: 1rem;
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.task-code {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.task-status {
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.625rem;
  font-weight: 600;
}

.status-pending {
  background: rgba(59, 130, 246, 0.2);
  color: rgb(147, 197, 253);
}

.status-progress {
  background: rgba(234, 179, 8, 0.2);
  color: rgb(253, 224, 71);
}

.status-completed {
  background: rgba(34, 197, 94, 0.2);
  color: rgb(134, 239, 172);
}

.task-name {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.75rem;
}

.task-progress {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.progress-text {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.progress-percent {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-primary);
}

.w-6 { width: 1.5rem; height: 1.5rem; }

.rotate-180 {
  transform: rotate(180deg);
}
</style>
