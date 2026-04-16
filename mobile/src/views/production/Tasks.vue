<!--
/**
 * Tasks.vue - 生产任务
 * @description 生产任务管理页面 — 与会计科目同风格卡片设计
 * @date 2026-04-15
 * @version 3.0.0
 */
-->
<template>
  <div class="tasks-page">
    <NavBar title="生产任务" left-arrow @click-left="$router.go(-1)">
      <template #right>
        <Icon name="plus" size="18" @click="createTask" />
      </template>
    </NavBar>

    <div class="content-wrapper">
      <!-- 统计概览 -->
      <div class="stats-banner">
        <div class="stat-item">
          <span class="stat-num">{{ taskList.length }}</span>
          <span class="stat-label">全部任务</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-num accent">{{ inProgressCount }}</span>
          <span class="stat-label">进行中</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-num success">{{ completedCount }}</span>
          <span class="stat-label">已完成</span>
        </div>
      </div>

      <!-- 搜索栏 -->
      <div class="search-section">
        <Search
          v-model="searchValue"
          placeholder="搜索任务编号或产品名称"
          @search="handleSearch"
          @clear="handleClear"
        />
      </div>

      <!-- 横向滑动筛选标签 -->
      <div class="filter-scroll-wrapper">
        <div class="filter-scroll">
          <div
            v-for="tab in statusTabs"
            :key="tab.value"
            class="filter-chip"
            :class="{ active: activeStatus === tab.value }"
            @click="activeStatus = tab.value"
          >
            <SvgIcon :name="tab.icon" size="0.875rem" />
            <span class="chip-text">{{ tab.label }}</span>
            <span v-if="getStatusCount(tab.value)" class="chip-badge">{{
              getStatusCount(tab.value)
            }}</span>
          </div>
        </div>
      </div>

      <!-- 任务列表 -->
      <div class="tasks-list">
        <PullRefresh v-model="refreshing" @refresh="onRefresh">
          <Empty v-if="filteredTasks.length === 0 && !loading" description="暂无任务数据" />

          <List
            v-model:loading="loading"
            :finished="finished"
            finished-text="没有更多了"
            @load="onLoad"
          >
            <div
              v-for="(task, index) in filteredTasks"
              :key="task.id"
              class="task-card"
              :style="{ animationDelay: `${index * 0.03}s` }"
              @click="viewTaskDetail(task.id)"
            >
              <!-- 左侧色条 -->
              <div class="card-accent" :class="getStatusAccent(task.status)"></div>

              <!-- 卡片主体 -->
              <div class="card-body">
                <!-- 第一行: 任务编号 + 状态 -->
                <div class="card-top">
                  <div class="code-area">
                    <span class="task-code">{{ task.code }}</span>
                    <span class="status-tag" :class="getStatusAccent(task.status)">
                      {{ getStatusText(task.status) }}
                    </span>
                  </div>
                  <div class="task-qty">
                    {{ task.completedQuantity }}/{{ task.quantity }}
                    <span class="qty-unit">{{ task.unit }}</span>
                  </div>
                </div>

                <!-- 第二行: 产品名称 -->
                <div class="task-name">{{ task.productName }}</div>

                <!-- 第三行: 进度条 -->
                <div class="progress-section">
                  <div class="progress-bar">
                    <div
                      class="progress-fill"
                      :class="getProgressClass(task.progressPercent)"
                      :style="{ width: task.progressPercent + '%' }"
                    ></div>
                  </div>
                  <span class="progress-text">{{ task.progressPercent }}%</span>
                </div>

                <!-- 第四行: 信息 + 操作 -->
                <div class="card-bottom">
                  <div class="meta-area">
                    <span class="meta-item" v-if="task.planName">{{ task.planName }}</span>
                    <span class="meta-item">{{ formatDate(task.created_at) }}</span>
                  </div>
                  <div class="card-actions" @click.stop>
                    <div
                      v-if="task.status === 'pending' || task.status === 'allocated'"
                      class="action-btn start"
                      @click="startTask(task)"
                    >
                      开始
                    </div>
                    <div
                      v-if="task.status === 'in_progress'"
                      class="action-btn report"
                      @click="reportProgress(task)"
                    >
                      报工
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </List>
        </PullRefresh>
      </div>
    </div>

    <!-- 报工弹窗 -->
    <Popup v-model:show="showReportDialog" position="bottom" :style="{ height: '50%' }" round>
      <div class="report-dialog">
        <div class="dialog-header">
          <div class="dialog-title">生产报工</div>
          <VanIcon name="cross" size="18" @click="showReportDialog = false" />
        </div>
        <div class="dialog-content">
          <div class="task-info-card" v-if="currentTask">
            <div class="info-row">
              <span class="info-label">任务编号</span>
              <span class="info-value mono">{{ currentTask.code }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">产品名称</span>
              <span class="info-value">{{ currentTask.productName }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">计划数量</span>
              <span class="info-value">{{ currentTask.quantity }} {{ currentTask.unit }}</span>
            </div>
          </div>
          <Field
            v-model="reportForm.completed_quantity"
            type="number"
            label="完成数量"
            placeholder="请输入完成数量"
            :rules="[{ required: true, message: '请输入完成数量' }]"
          />
          <Field
            v-model="reportForm.remarks"
            type="textarea"
            label="备注"
            placeholder="请输入备注信息"
            rows="3"
          />
          <div class="form-actions">
            <VanButton type="default" @click="showReportDialog = false">取消</VanButton>
            <VanButton type="primary" @click="submitReport" :loading="submitting"
              >提交报工</VanButton
            >
          </div>
        </div>
      </div>
    </Popup>
  </div>
</template>

<script setup>
  import { ref, computed, reactive, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import {
    NavBar,
    Icon,
    Search,
    PullRefresh,
    List,
    Empty,
    Popup,
    Field,
    Button as VanButton,
    showToast
  } from 'vant'
  import SvgIcon from '@/components/icons/index.vue'
  import { productionApi } from '@/services/api'
  import dayjs from 'dayjs'

  const router = useRouter()

  // 响应式数据
  const taskList = ref([])
  const loading = ref(false)
  const finished = ref(false)
  const refreshing = ref(false)
  const searchValue = ref('')
  const activeStatus = ref('all')
  const showReportDialog = ref(false)
  const currentTask = ref(null)
  const submitting = ref(false)
  const reportForm = reactive({ completed_quantity: '', remarks: '' })

  // 状态标签（含图标）
  const statusTabs = [
    { label: '全部', value: 'all', icon: 'apps' },
    { label: '待开始', value: 'pending', icon: 'clipboard-check' },
    { label: '已分配', value: 'allocated', icon: 'clipboard-check' },
    { label: '进行中', value: 'in_progress', icon: 'cog' },
    { label: '已完成', value: 'completed', icon: 'badge-check' },
    { label: '已取消', value: 'cancelled', icon: 'shield' }
  ]

  // 统计
  const inProgressCount = computed(
    () => taskList.value.filter((t) => t.status === 'in_progress').length
  )
  const completedCount = computed(
    () => taskList.value.filter((t) => t.status === 'completed').length
  )
  const getStatusCount = (status) => {
    if (!status || status === 'all') return taskList.value.length
    return taskList.value.filter((t) => t.status === status).length
  }

  // 前端筛选
  const filteredTasks = computed(() => {
    let result = taskList.value
    if (activeStatus.value && activeStatus.value !== 'all') {
      result = result.filter((t) => t.status === activeStatus.value)
    }
    if (searchValue.value) {
      const kw = searchValue.value.toLowerCase()
      result = result.filter(
        (t) =>
          (t.code || '').toLowerCase().includes(kw) ||
          (t.productName || '').toLowerCase().includes(kw)
      )
    }
    return result
  })

  // 获取状态色条类
  const getStatusAccent = (status) => {
    const map = {
      draft: 'status-pending',
      pending: 'status-pending',
      allocated: 'status-pending',
      preparing: 'status-progress',
      material_issuing: 'status-progress',
      material_issued: 'status-progress',
      material_partial_issued: 'status-progress',
      in_progress: 'status-progress',
      inspection: 'status-inspection',
      warehousing: 'status-inspection',
      completed: 'status-completed',
      paused: 'status-cancelled',
      cancelled: 'status-cancelled'
    }
    return map[status] || 'status-default'
  }

  const getStatusText = (status) => {
    const texts = {
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
    }
    return texts[status] || status
  }

  const getProgressClass = (percent) => {
    if (percent >= 100) return 'fill-completed'
    if (percent >= 50) return 'fill-good'
    if (percent > 0) return 'fill-medium'
    return 'fill-low'
  }

  const calculateProgress = (task) => {
    const planned = task.planned_quantity || task.quantity || 0
    const completed = task.completed_quantity || 0
    if (planned === 0) return 0
    return Math.min(Math.round((completed / planned) * 100), 100)
  }

  const formatDate = (d) => (d ? dayjs(d).format('YYYY-MM-DD') : '')

  // 加载任务
  const loadTasks = async (isRefresh = false) => {
    if (isRefresh) {
      taskList.value = []
      finished.value = false
    }
    try {
      const params = {
        page: Math.floor(taskList.value.length / 100) + 1,
        pageSize: 100,
        search: searchValue.value || undefined
      }
      const response = await productionApi.getProductionTasks(params)

      let tasks = []
      if (response.data?.list) tasks = response.data.list
      else if (response.data?.items) tasks = response.data.items
      else if (response.data && Array.isArray(response.data)) tasks = response.data
      else if (response.items) tasks = response.items
      else if (Array.isArray(response)) tasks = response

      const mapped = tasks.map((task) => ({
        id: task.id,
        code: task.task_code || task.code || `TASK-${task.id}`,
        productName: task.product_name || task.productName || '未知产品',
        quantity: task.planned_quantity || task.quantity || 0,
        unit: task.unit_name || task.unit || '件',
        planName: task.plan_name || task.planName || '',
        status: task.status || 'pending',
        completedQuantity: task.completed_quantity || 0,
        created_at: task.created_at,
        progressPercent: calculateProgress(task)
      }))

      if (isRefresh) {
        taskList.value = mapped
      } else {
        const existingIds = new Set(taskList.value.map((t) => t.id))
        taskList.value.push(...mapped.filter((t) => !existingIds.has(t.id)))
      }
      finished.value = tasks.length < 100
    } catch (error) {
      console.error('加载任务列表失败:', error)
      showToast('加载失败，请重试')
    } finally {
      loading.value = false
      refreshing.value = false
    }
  }

  const onLoad = () => {
    loading.value = true
    loadTasks()
  }
  const onRefresh = () => {
    refreshing.value = true
    loadTasks(true)
  }
  const handleSearch = () => {}
  const handleClear = () => {
    searchValue.value = ''
  }

  const createTask = () => router.push('/production/tasks/create')
  const viewTaskDetail = (id) => router.push(`/production/tasks/${id}`)

  const startTask = async (task) => {
    try {
      await productionApi.startProductionTask(task.id)
      showToast('任务已开始')
      loadTasks(true)
    } catch (error) {
      console.error('开始任务失败:', error)
      showToast('操作失败')
    }
  }

  const reportProgress = (task) => {
    currentTask.value = task
    reportForm.completed_quantity = ''
    reportForm.remarks = ''
    showReportDialog.value = true
  }

  const submitReport = async () => {
    if (!reportForm.completed_quantity) {
      showToast('请输入完成数量')
      return
    }
    submitting.value = true
    try {
      await productionApi.reportProductionProgress({
        task_id: currentTask.value.id,
        completed_quantity: Number(reportForm.completed_quantity),
        remarks: reportForm.remarks
      })
      showToast('报工成功')
      showReportDialog.value = false
      loadTasks(true)
    } catch (error) {
      console.error('报工失败:', error)
      showToast('报工失败')
    } finally {
      submitting.value = false
    }
  }

  onMounted(() => loadTasks(true))
</script>

<style lang="scss" scoped>
  .tasks-page {
    min-height: 100vh;
    background-color: var(--bg-primary);
    padding-bottom: 80px;
  }

  .content-wrapper {
    padding: 0 12px 12px;
  }

  // 统计概览 — 与 Accounts.vue 相同
  .stats-banner {
    display: flex;
    align-items: center;
    justify-content: space-around;
    background: var(--bg-secondary);
    border-radius: 12px;
    padding: 14px 8px;
    margin: 8px 0;
    border: 1px solid var(--glass-border);
    box-shadow: none;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;

    .stat-num {
      font-size: 1.25rem;
      font-weight: 800;
      color: var(--text-primary);
      &.accent {
        color: #fbbf24;
      }
      &.success {
        color: #34d399;
      }
    }
    .stat-label {
      font-size: 0.6875rem;
      color: var(--text-tertiary);
    }
  }

  .stat-divider {
    width: 1px;
    height: 28px;
    background: var(--glass-border);
  }

  // 搜索
  .search-section {
    padding: 4px 0;
  }

  // 横向滑动筛选
  .filter-scroll-wrapper {
    padding: 4px 0 8px;
    overflow: hidden;
  }

  .filter-scroll {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 2px 0 6px;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    &::-webkit-scrollbar {
      display: none;
    }
  }

  .filter-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 14px;
    border-radius: 20px;
    background: var(--bg-secondary);
    border: 1.5px solid var(--glass-border);
    white-space: nowrap;
    flex-shrink: 0;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    transition: all 0.25s ease;
    cursor: pointer;

    .chip-text {
      font-weight: 500;
    }
    .chip-badge {
      min-width: 18px;
      height: 18px;
      line-height: 18px;
      text-align: center;
      font-size: 0.625rem;
      font-weight: 700;
      border-radius: 9px;
      background: var(--glass-border);
      color: var(--text-secondary);
      padding: 0 4px;
    }

    &.active {
      background: var(--color-accent-bg, rgba(59, 130, 246, 0.1));
      border-color: var(--color-accent, #3b82f6);
      color: var(--color-accent, #3b82f6);
      .chip-badge {
        background: var(--color-accent, #3b82f6);
        color: #fff;
      }
    }
  }

  // 任务卡片列表
  .tasks-list {
    padding-top: 4px;
  }

  .task-card {
    display: flex;
    background: var(--bg-secondary);
    border-radius: 12px;
    margin-bottom: 10px;
    overflow: hidden;
    border: 1px solid var(--glass-border);
    box-shadow: none;
    transition: all 0.2s ease;
    animation: fadeInUp 0.35s ease-out both;

    &:active {
      transform: scale(0.98);
      box-shadow: none;
    }
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

  // 左侧色条
  .card-accent {
    width: 4px;
    flex-shrink: 0;
    &.status-pending {
      background: linear-gradient(180deg, #94a3b8, #cbd5e1);
    }
    &.status-progress {
      background: linear-gradient(180deg, #f59e0b, #fbbf24);
    }
    &.status-inspection {
      background: linear-gradient(180deg, #a855f7, #c084fc);
    }
    &.status-completed {
      background: linear-gradient(180deg, #10b981, #34d399);
    }
    &.status-cancelled {
      background: linear-gradient(180deg, #ef4444, #f87171);
    }
    &.status-default {
      background: linear-gradient(180deg, #6b7280, #9ca3af);
    }
  }

  // 卡片主体
  .card-body {
    flex: 1;
    padding: 12px 14px;
    min-width: 0;
  }

  .card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .code-area {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .task-code {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--text-primary);
    font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  }

  .status-tag {
    display: inline-flex;
    align-items: center;
    padding: 1px 8px;
    border-radius: 10px;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.5px;

    &.status-pending {
      background: rgba(148, 163, 184, 0.12);
      color: #94a3b8;
    }
    &.status-progress {
      background: rgba(245, 158, 11, 0.12);
      color: #f59e0b;
    }
    &.status-inspection {
      background: rgba(168, 85, 247, 0.12);
      color: #a855f7;
    }
    &.status-completed {
      background: rgba(16, 185, 129, 0.12);
      color: #10b981;
    }
    &.status-cancelled {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
    }
    &.status-default {
      background: rgba(107, 114, 128, 0.1);
      color: #6b7280;
    }
  }

  .task-qty {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
    font-family: 'SF Mono', monospace;
    flex-shrink: 0;
    .qty-unit {
      font-size: 0.625rem;
      opacity: 0.7;
    }
  }

  .task-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  // 进度条
  .progress-section {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .progress-bar {
    flex: 1;
    height: 6px;
    background: var(--glass-border);
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.3s ease;
    &.fill-low {
      background: linear-gradient(90deg, #ef4444, #f87171);
    }
    &.fill-medium {
      background: linear-gradient(90deg, #f59e0b, #fbbf24);
    }
    &.fill-good {
      background: linear-gradient(90deg, #3b82f6, #60a5fa);
    }
    &.fill-completed {
      background: linear-gradient(90deg, #10b981, #34d399);
    }
  }

  .progress-text {
    font-size: 0.6875rem;
    font-weight: 700;
    color: var(--text-secondary);
    font-family: 'SF Mono', monospace;
    min-width: 30px;
    text-align: right;
  }

  // 底部
  .card-bottom {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .meta-area {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .meta-item {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
  }

  .card-actions {
    display: flex;
    gap: 6px;

    .action-btn {
      padding: 3px 12px;
      border-radius: 8px;
      font-size: 0.6875rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;

      &.start {
        background: rgba(16, 185, 129, 0.1);
        color: #10b981;
        &:active {
          background: rgba(16, 185, 129, 0.2);
        }
      }
      &.report {
        background: rgba(245, 158, 11, 0.1);
        color: #f59e0b;
        &:active {
          background: rgba(245, 158, 11, 0.2);
        }
      }
    }
  }

  // 报工弹窗
  .report-dialog {
    height: 100%;
    display: flex;
    flex-direction: column;

    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px;
      border-bottom: 1px solid var(--glass-border);
      .dialog-title {
        font-size: 1rem;
        font-weight: 600;
        color: var(--text-primary);
      }
    }

    .dialog-content {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
    }
  }

  .task-info-card {
    background: var(--bg-primary);
    border-radius: 10px;
    padding: 12px;
    margin-bottom: 14px;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
    &:not(:last-child) {
      border-bottom: 1px solid var(--glass-border);
    }
  }

  .info-label {
    font-size: 0.75rem;
    color: var(--text-tertiary);
  }
  .info-value {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-primary);
    &.mono {
      font-family: 'SF Mono', monospace;
    }
  }

  .form-actions {
    display: flex;
    gap: 12px;
    margin-top: 20px;
    .van-button {
      flex: 1;
    }
  }
</style>
