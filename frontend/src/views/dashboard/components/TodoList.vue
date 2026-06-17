<!--
/**
 * TodoList.vue
 * @description 仪表盘待办事项列表组件
 */
-->
<template>
  <div class="list-container">
    <div class="list-header">
      <div class="tab-group">
        <div
          :class="['tab', {'active': activeTab === 'pending'}]"
          @click="$emit('switch-tab', 'pending')"
        >{{ $t('page.dashboard.todoItems') }}</div>
        <div
          :class="['tab', {'active': activeTab === 'completed'}]"
          @click="$emit('switch-tab', 'completed')"
        >{{ $t('common.completed') }}</div>
      </div>
    </div>
    <div class="list-content">
      <el-table
        :data="activeTab === 'pending' ? pendingTasks : completedTasks"
        :show-header="true"
        height="300"
        :empty-text="activeTab === 'pending' ? '暂无待办事项' : '暂无已完成事项'"
        class="dashboard-table"
      >
        <el-table-column :label="$t('common.type')" width="80">
          <template #default="{ row }">
            <span class="event-type" :class="getEventTypeClass(row.type)">{{ row.type }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="title" :label="$t('common.title')" min-width="100" show-overflow-tooltip />
        <el-table-column prop="date" :label="activeTab === 'pending' ? $t('common.deadline') : $t('common.updateTime')" width="112" />
        <el-table-column :label="$t('common.status')" width="80">
          <template #default="{ row }">
            <span :class="activeTab === 'completed' ? 'status-completed' : getStatusClass(row.status)">
              {{ row.status }}
            </span>
          </template>
        </el-table-column>
        <el-table-column :label="$t('common.action')" min-width="68" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="{ row }">
            <el-button
              :type="activeTab === 'pending' ? 'primary' : 'info'"
              size="small"
              class="action-btn"
              @click="activeTab === 'pending' ? $emit('go-to-todo') : $emit('view-detail', row.id)"
            >
              {{ activeTab === 'pending' ? $t('common.handle') : $t('common.detail') }}
            </el-button>
          </template>
        </el-table-column>
        <!-- 空状态插槽 -->
        <template #empty>
          <div class="empty-state">
            <el-icon class="empty-icon"><DocumentRemove /></el-icon>
            <p class="empty-text">{{ activeTab === 'pending' ? '暂无待办事项' : '暂无已完成事项' }}</p>
            <p class="empty-desc">{{ activeTab === 'pending' ? '太棒了!你已经完成了所有任务' : '还没有完成任何任务' }}</p>
          </div>
        </template>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { DocumentRemove } from '@element-plus/icons-vue'

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
  '关闭': 'status-closed'
}
const getEventTypeClass = (type) => EVENT_TYPE_MAP[type] || ''
const getStatusClass = (status) => TODO_STATUS_MAP[status] || ''

defineProps({
  pendingTasks: {
    type: Array,
    default: () => []
  },
  completedTasks: {
    type: Array,
    default: () => []
  },
  activeTab: {
    type: String,
    default: 'pending'
  }
})

defineEmits(['switch-tab', 'go-to-todo', 'view-detail'])
</script>
