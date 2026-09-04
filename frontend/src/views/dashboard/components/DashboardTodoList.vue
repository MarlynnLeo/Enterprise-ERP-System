<!--
  DashboardTodoList — 仪表盘待办列表

  仪表盘只展示少量只读数据，不需要 Element Plus Table 的排序、固定列和
  虚拟滚动能力。使用原生表格可以避免列宽测量和 ResizeObserver 链，保证
  首屏及菜单交互保持可响应；完整待办仍由“查看全部”进入个人中心处理。
-->
<template>
  <section class="dashboard-todo-list" aria-label="待办事项">
    <header class="todo-list-header">
      <div class="todo-tabs" role="tablist" aria-label="待办状态">
        <button
          type="button"
          class="todo-tab"
          :class="{ active: isPending }"
          role="tab"
          :aria-selected="isPending"
          @click="emit('switch-tab', 'pending')"
        >
          {{ labels.pending }}
        </button>
        <button
          type="button"
          class="todo-tab"
          :class="{ active: !isPending }"
          role="tab"
          :aria-selected="!isPending"
          @click="emit('switch-tab', 'completed')"
        >
          {{ labels.completed }}
        </button>
      </div>
      <button type="button" class="todo-more-button" @click="emit('go-to-all')">
        {{ labels.viewAll }} {{ count }}
      </button>
    </header>

    <div class="todo-list-content">
      <div v-if="tasks.length === 0" class="todo-empty-state">
        <DocumentRemove class="todo-empty-icon" aria-hidden="true" />
        <p class="todo-empty-title">{{ emptyTitle }}</p>
        <p class="todo-empty-desc">{{ emptyDescription }}</p>
      </div>

      <div v-else class="todo-table-scroll">
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
            <tr v-for="(task, index) in tasks" :key="task.id ?? index">
              <td>
                <span class="event-type" :class="getEventTypeClass(task.type)">
                  {{ task.type }}
                </span>
              </td>
              <td class="cell-ellipsis" :title="task.title">{{ task.title }}</td>
              <td class="todo-column-date">{{ task.date }}</td>
              <td class="todo-column-status">
                <span :class="isPending ? getStatusClass(task.status) : 'status-completed'">
                  {{ task.status }}
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
import { DocumentRemove } from '@element-plus/icons-vue'

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
  title: translate('common.title', '标题'),
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
  isPending.value ? '太棒了！所有任务已完成' : '还没有完成任何任务'
)

const EVENT_TYPE_MAP = {
  '英语变更': 'event-english',
  '新生指导': 'event-guide',
  '报到注册': 'event-register',
  '护照变更': 'event-passport',
  '活动报名': 'event-activity',
  '活动': 'event-activity'
}

const TODO_STATUS_MAP = {
  '待确认': 'status-pending',
  '未读': 'status-unread',
  '已读': 'status-read',
  '进行中': 'status-processing',
  '关闭': 'status-closed',
  '待处理': 'status-pending',
  '即将到期': 'status-processing',
  '已逾期': 'status-unread'
}

const getEventTypeClass = (type) => EVENT_TYPE_MAP[type] || ''
const getStatusClass = (status) => TODO_STATUS_MAP[status] || ''

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
  --todo-row-height: 40px;
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 380px;
  min-height: 380px;
  max-height: 380px;
  overflow: hidden;
  box-sizing: border-box;
  background: var(--color-bg-base);
  border: 1px solid var(--color-border-lighter);
  border-radius: 10px;
  box-shadow: 0 2px 12px 0 color-mix(in srgb, var(--ds-black) 5%, transparent);
  transition: background-color var(--transition-base) ease,
    border-color var(--transition-base) ease,
    box-shadow var(--transition-base) ease;
}

.dashboard-todo-list:hover {
  border-color: var(--color-border-light);
  box-shadow: 0 4px 16px 0 color-mix(in srgb, var(--ds-black) 10%, transparent);
}

.todo-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 0 0 45px;
  gap: 8px;
  border-bottom: 1px solid var(--color-border-lighter);
}

.todo-tabs {
  display: flex;
  align-self: stretch;
}

.todo-tab,
.todo-more-button,
.todo-action-button {
  border: 0;
  font: inherit;
  cursor: pointer;
}

.todo-tab {
  position: relative;
  min-width: 78px;
  padding: 0 15px;
  color: var(--color-text-regular);
  background: transparent;
  font-size: 14px;
  user-select: none;
}

.todo-tab:hover,
.todo-tab:focus-visible {
  color: var(--color-primary);
  background: color-mix(in srgb, var(--ds-blue) 5%, transparent);
  outline: none;
}

.todo-tab.active {
  color: var(--color-primary);
  font-weight: 700;
}

.todo-tab.active::after {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--color-primary), var(--color-primary-dark-2));
  content: '';
}

.todo-more-button {
  flex: 0 0 auto;
  margin-right: 10px;
  padding: 4px 6px;
  color: var(--color-text-secondary);
  background: transparent;
  font-size: 12px;
}

.todo-more-button:hover,
.todo-more-button:focus-visible {
  color: var(--color-primary);
  outline: none;
}

.todo-list-content {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.todo-table-scroll {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: auto;
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
  padding: 8px 10px;
  border-bottom: 1px solid var(--color-border-lighter);
  text-align: left;
  vertical-align: middle;
  box-sizing: border-box;
}

.dashboard-native-table th {
  height: 40px;
  color: var(--color-text-regular);
  background: color-mix(in srgb, var(--color-bg-hover) 50%, transparent);
  font-weight: 400;
}

.dashboard-native-table tbody tr {
  transition: background-color var(--transition-fast) ease;
}

.dashboard-native-table tbody tr:hover {
  background: color-mix(in srgb, var(--color-bg-hover) 50%, transparent);
}

.todo-column-type {
  width: 72px;
}

.todo-column-title {
  width: auto;
}

.todo-column-date {
  width: 108px;
}

.todo-column-status {
  width: 76px;
}

.todo-column-action {
  width: 88px;
  text-align: center !important;
}

.cell-ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-action-button {
  min-width: 40px;
  height: 22px;
  padding: 2px 7px;
  border-radius: 4px;
  color: var(--color-on-primary);
  background: var(--color-primary);
  font-size: 12px;
  line-height: 18px;
}

.todo-action-button.completed {
  color: var(--color-text-regular);
  background: var(--color-bg-hover);
}

.todo-action-button:hover,
.todo-action-button:focus-visible {
  filter: brightness(1.06);
  outline: 2px solid color-mix(in srgb, var(--color-primary) 35%, transparent);
  outline-offset: 1px;
}

.todo-empty-state {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--color-text-secondary);
  text-align: center;
}

.todo-empty-icon {
  width: 56px;
  height: 56px;
  margin-bottom: 14px;
  color: var(--color-text-placeholder);
  opacity: 0.6;
}

.todo-empty-title,
.todo-empty-desc {
  margin: 0;
}

.todo-empty-title {
  color: var(--color-text-regular);
  font-size: 16px;
  font-weight: 500;
}

.todo-empty-desc {
  margin-top: 8px;
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.event-type {
  display: inline-block;
}

.event-english { color: var(--color-danger); }
.event-guide { color: var(--color-primary); }
.event-register { color: var(--color-success); }
.event-passport { color: var(--color-warning); }
.event-activity { color: var(--color-danger); }

.status-pending { color: var(--color-warning); }
.status-unread { color: var(--color-danger); }
.status-read { color: var(--color-text-secondary); }
.status-processing { color: var(--color-success); }
.status-closed { color: var(--color-text-secondary); }
.status-completed { color: var(--color-success); }

@container (max-width: 469px) {
  .todo-column-date {
    display: none;
  }
}

@container (max-width: 379px) {
  .todo-column-status {
    display: none;
  }
}

@media (max-width: 768px) {
  .dashboard-todo-list {
    height: 320px;
    min-height: 320px;
    max-height: 320px;
  }
}
</style>
