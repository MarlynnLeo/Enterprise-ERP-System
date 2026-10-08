<!--
  DashboardTodoList — 经典主题仪表盘待办列表
  采用现代企业级表格排版，保留原生表格极速响应特性
-->
<template>
  <section class="dashboard-todo-list" aria-label="待办事项">
    <header class="todo-list-header">
      <div class="todo-segmented-control" role="tablist" aria-label="待办状态">
        <button
          type="button"
          class="segmented-btn"
          :class="{ active: isPending }"
          role="tab"
          :aria-selected="isPending"
          @click="emit('switch-tab', 'pending')"
        >
          <span class="btn-text">{{ labels.pending }}</span>
          <span v-if="isPending && count > 0" class="segmented-count">{{ count }}</span>
        </button>
        <button
          type="button"
          class="segmented-btn"
          :class="{ active: !isPending }"
          role="tab"
          :aria-selected="!isPending"
          @click="emit('switch-tab', 'completed')"
        >
          <span class="btn-text">{{ labels.completed }}</span>
          <span v-if="!isPending && count > 0" class="segmented-count">{{ count }}</span>
        </button>
      </div>

      <button type="button" class="todo-all-action" @click="emit('go-to-all')">
        <span>{{ labels.viewAll }}</span>
        <el-icon class="all-arrow"><ArrowRight /></el-icon>
      </button>
    </header>

    <div class="todo-list-content">
      <div v-if="tasks.length === 0" class="todo-empty-state">
        <div class="empty-icon-wrap">
          <DocumentRemove class="todo-empty-icon" aria-hidden="true" />
        </div>
        <p class="todo-empty-title">{{ emptyTitle }}</p>
        <p class="todo-empty-desc">{{ emptyDescription }}</p>
      </div>

      <div v-else class="todo-table-content">
        <table class="dashboard-native-table todo-table">
          <colgroup>
            <col class="todo-column-type">
            <col class="todo-column-title">
            <col class="todo-column-date">
            <col class="todo-column-status">
            <col class="todo-column-action">
          </colgroup>
          <thead>
            <tr>
              <th scope="col">{{ labels.type }}</th>
              <th scope="col">{{ labels.title }}</th>
              <th scope="col" class="todo-column-date">{{ dateLabel }}</th>
              <th scope="col" class="todo-column-status">{{ labels.status }}</th>
              <th scope="col" class="todo-column-action">{{ labels.action }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(task, index) in tasks" :key="task.id ?? index" class="todo-row">
              <td>
                <span class="event-badge" :class="getEventTypeClass(task.type)">
                  {{ task.type }}
                </span>
              </td>
              <td class="todo-task-title" :title="task.title">{{ task.title }}</td>
              <td class="todo-column-date">{{ task.date }}</td>
              <td class="todo-column-status">
                <span class="status-pill" :class="isPending ? getStatusClass(task.status) : 'status-completed'">
                  <span class="status-dot"></span>
                  <span class="status-text">{{ task.status }}</span>
                </span>
              </td>
              <td class="todo-column-action">
                <button
                  type="button"
                  class="todo-action-button"
                  :class="{ completed: !isPending }"
                  @click="handleAction(task)"
                >
                  {{ actionLabel }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { DocumentRemove, ArrowRight } from '@element-plus/icons-vue'

const props = defineProps({
  tasks: {
    type: Array,
    default: () => []
  },
  tab: {
    type: String,
    default: 'pending'
  },
  count: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['switch-tab', 'go-to-all', 'view'])
const { t, te } = useI18n()

const translate = (key, fallback) => (te(key) ? t(key) : fallback)
const isPending = computed(() => props.tab === 'pending')
const labels = computed(() => ({
  pending: translate('page.dashboard.todoItems', '待办事项'),
  completed: translate('common.completed', '已完成'),
  viewAll: '查看全部',
  type: translate('common.type', '类型'),
  title: translate('common.title', '任务标题'),
  status: translate('common.status', '状态'),
  action: translate('common.action', '操作')
}))
const dateLabel = computed(() =>
  isPending.value
    ? translate('common.deadline', '截止时间')
    : translate('common.updateTime', '更新时间')
)
const actionLabel = computed(() =>
  isPending.value
    ? translate('common.handle', '办理')
    : translate('common.detail', '详情')
)
const emptyTitle = computed(() =>
  isPending.value ? '暂无待办事项' : '暂无已完成事项'
)
const emptyDescription = computed(() =>
  isPending.value ? '太棒了！所有任务已处理完毕' : '还没有完成任何任务'
)

const EVENT_TYPE_MAP = {
  '高优先级': 'badge-danger',
  '中优先级': 'badge-warning',
  '低优先级': 'badge-info',
  '英语变更': 'badge-danger',
  '新生指导': 'badge-primary',
  '报到注册': 'badge-success',
  '护照变更': 'badge-warning',
  '活动报名': 'badge-danger',
  '活动': 'badge-danger'
}

const TODO_STATUS_MAP = {
  '待确认': 'is-warning',
  '未读': 'is-danger',
  '已读': 'is-info',
  '进行中': 'is-primary',
  '关闭': 'is-info',
  '待处理': 'is-warning',
  '即将到期': 'is-warning',
  '已逾期': 'is-danger'
}

const getEventTypeClass = (type) => EVENT_TYPE_MAP[type] || 'badge-default'
const getStatusClass = (status) => TODO_STATUS_MAP[status] || 'is-info'

const handleAction = (task) => {
  if (isPending.value) {
    emit('go-to-all')
  } else {
    emit('view', task.id)
  }
}
</script>

<style scoped>
.dashboard-todo-list {
  --todo-row-height: 38px;
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  background: var(--color-bg-base);
  border: 1px solid var(--color-border-base);
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.03);
  transition: all var(--transition-base) ease;
}

.dashboard-todo-list:hover {
  border-color: color-mix(in srgb, var(--color-primary) 25%, var(--color-border-base));
}

/* 顶部操作区与分段切换器 */
.todo-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 0 0 46px;
  min-width: 0;
  padding: 0 14px;
  box-sizing: border-box;
  border-bottom: 1px solid var(--color-border-lighter);
}

.todo-segmented-control {
  display: inline-flex;
  padding: 3px;
  border-radius: 6px;
  background: var(--color-bg-hover);
  border: 1px solid var(--color-border-lighter);
}

.segmented-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast) ease;
}

.segmented-btn:hover {
  color: var(--color-text-primary);
}

.segmented-btn.active {
  background: var(--color-bg-base);
  color: var(--color-primary);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
}

.segmented-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  color: var(--color-primary);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.todo-all-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all var(--transition-fast) ease;
}

.todo-all-action:hover {
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 6%, transparent);
}

.all-arrow {
  font-size: 12px;
  transition: transform var(--transition-fast) ease;
}

.todo-all-action:hover .all-arrow {
  transform: translateX(2px);
}

/* 内容区域与表格 */
.todo-list-content {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  padding: 6px 10px 10px;
}

.todo-table-content {
  flex: 1 1 auto;
  min-width: 0;
  overflow-y: auto;
}

.dashboard-native-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  color: var(--color-text-regular);
  font-size: 13px;
}

.dashboard-native-table th,
.dashboard-native-table td {
  height: var(--todo-row-height);
  padding: 6px 10px;
  border-bottom: 1px solid var(--color-border-lighter);
  text-align: left;
  vertical-align: middle;
  box-sizing: border-box;
}

.dashboard-native-table th {
  height: 32px;
  color: var(--color-text-secondary);
  background: color-mix(in srgb, var(--color-bg-page) 60%, var(--color-bg-base));
  font-size: 12px;
  font-weight: 600;
  border-radius: 4px;
}

.todo-row {
  transition: background-color var(--transition-fast) ease;
}

.todo-row:hover {
  background: color-mix(in srgb, var(--color-primary) 4%, transparent);
}

.todo-column-type { width: 88px; }
.todo-column-title { width: auto; }
.todo-column-date { width: 110px; font-variant-numeric: tabular-nums; font-size: 12px; color: var(--color-text-secondary); }
.todo-column-status { width: 92px; }
.todo-column-action { width: 70px; text-align: center !important; }

.todo-task-title {
  color: var(--color-text-primary);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 类型徽章 */
.event-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.badge-primary { background: #EEF2FF; color: #4338CA; border: 1px solid #C7D2FE; }
.badge-success { background: #ECFDF5; color: #047857; border: 1px solid #A7F3D0; }
.badge-warning { background: #FFFBEB; color: #B45309; border: 1px solid #FDE68A; }
.badge-danger { background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA; }
.badge-info { background: #F1F5F9; color: #475569; border: 1px solid #E2E8F0; }
.badge-default { background: #F8FAFC; color: #64748B; border: 1px solid #E2E8F0; }

/* 状态药丸 */
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 500;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.status-pill.is-primary { color: var(--color-primary); }
.status-pill.is-warning { color: #D97706; }
.status-pill.is-danger { color: var(--color-danger); }
.status-pill.is-info { color: var(--color-text-secondary); }
.status-pill.status-completed { color: var(--color-success); }

/* 操作按钮 */
.todo-action-button {
  min-width: 48px;
  height: 26px;
  padding: 0 8px;
  border-radius: 4px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 25%, transparent);
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-bg-base));
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast) ease;
}

.todo-action-button:hover {
  background: var(--color-primary);
  color: #FFFFFF;
  border-color: var(--color-primary);
}

.todo-action-button.completed {
  border-color: var(--color-border-base);
  color: var(--color-text-secondary);
  background: var(--color-bg-hover);
}

.todo-action-button.completed:hover {
  border-color: var(--color-text-regular);
  color: var(--color-text-primary);
}

/* 空状态 */
.todo-empty-state {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px 16px;
  text-align: center;
}

.empty-icon-wrap {
  width: 52px;
  height: 52px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-bg-base));
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}

.todo-empty-icon {
  width: 28px;
  height: 28px;
  color: var(--color-primary);
}

.todo-empty-title {
  margin: 0;
  color: var(--color-text-primary);
  font-size: 15px;
  font-weight: 600;
}

.todo-empty-desc {
  margin: 4px 0 0;
  color: var(--color-text-secondary);
  font-size: 13px;
}
</style>
