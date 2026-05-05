<!--
/**
 * Notifications.vue
 * @description 移动端应用文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="notifications-page">
    <NavBar title="消息通知" left-arrow @click-left="$router.go(-1)">
      <template #right>
        <div class="nav-right-btns">
          <Icon name="chat-o" size="20" @click="$router.push('/chat')" />
          <Icon name="setting-o" size="18" @click="showSettings" />
        </div>
      </template>
    </NavBar>
    
    <div class="content-container">
      <!-- 消息统计 -->
      <div class="message-stats">
        <div class="stats-item" @click="filterByType('')">
          <div class="stats-number">{{ totalCount }}</div>
          <div class="stats-label">全部消息</div>
        </div>
        <div class="stats-item" @click="filterByType('unread')">
          <div class="stats-number unread">{{ unreadCount }}</div>
          <div class="stats-label">未读消息</div>
        </div>
        <div class="stats-item" @click="filterByType('urgent')">
          <div class="stats-number urgent">{{ urgentCount }}</div>
          <div class="stats-label">紧急消息</div>
        </div>
      </div>

      <!-- 消息类型筛选 -->
      <div class="filter-scroll-wrapper">
        <div class="filter-scroll">
          <div 
            v-for="filter in messageFilters" 
            :key="filter.key"
            class="filter-chip"
            :class="{ active: activeFilter === filter.key }"
            @click="selectFilter(filter.key)"
          >
            <Icon :name="filter.icon" size="14" />
            <span class="chip-text">{{ filter.label }}</span>
            <Badge v-if="filter.count > 0" :content="filter.count" />
          </div>
        </div>
      </div>

      <!-- 操作栏 -->
      <div class="action-bar" v-if="filteredMessages.length > 0">
        <div class="action-left">
          <Checkbox v-model="selectAll" @change="handleSelectAll">全选</Checkbox>
        </div>
        <div class="action-right">
          <Button size="small" type="default" @click="markAsRead" :disabled="selectedMessages.length === 0">
            标记已读
          </Button>
          <Button size="small" type="danger" @click="deleteMessages" :disabled="selectedMessages.length === 0">
            删除
          </Button>
        </div>
      </div>

      <!-- 消息列表 -->
      <div class="message-list">
        <PullRefresh v-model="refreshing" @refresh="onRefresh">
          <List
            v-model:loading="loading"
            :finished="finished"
            finished-text="没有更多了"
            @load="onLoad"
          >
            <div 
              v-for="message in filteredMessages" 
              :key="message.id"
              class="message-item"
              :class="{ unread: !message.read, selected: selectedMessages.includes(message.id) }"
              @click="viewMessage(message)"
            >
              <div class="message-checkbox" @click.stop>
                <Checkbox v-model="selectedMessages" :name="message.id" />
              </div>
              
              <div class="message-icon">
                <Icon :name="getMessageIcon(message.type)" size="20" :color="getMessageColor(message.type)" />
                <div class="priority-badge" v-if="message.priority === 'urgent'"></div>
              </div>
              
              <div class="message-content">
                <div class="message-header">
                  <div class="message-title">{{ message.title }}</div>
                  <div class="message-time">{{ formatTime(message.created_at) }}</div>
                </div>
                
                <div class="message-body">
                  <div class="message-text">{{ message.content }}</div>
                  <div class="message-meta" v-if="message.meta">
                    <div class="meta-item" v-for="(value, key) in message.meta" :key="key">
                      <span class="meta-label">{{ key }}:</span>
                      <span class="meta-value">{{ value }}</span>
                    </div>
                  </div>
                </div>
                
                <div class="message-actions" v-if="message.actions">
                  <Button 
                    v-for="action in message.actions" 
                    :key="action.key"
                    size="mini" 
                    :type="action.type || 'default'"
                    @click.stop="handleAction(message, action)"
                  >
                    {{ action.label }}
                  </Button>
                </div>
              </div>
              
              <div class="message-status">
                <div class="read-indicator" v-if="!message.read"></div>
                <Icon name="arrow" size="12" color="var(--text-disabled)" />
              </div>
            </div>
          </List>
        </PullRefresh>
      </div>

      <!-- 空状态 -->
      <div class="empty-messages" v-if="filteredMessages.length === 0 && !loading">
        <Empty description="暂无消息">
          <Button type="primary" size="small" @click="onRefresh">
            刷新
          </Button>
        </Empty>
      </div>
    </div>

    <!-- 消息设置弹窗 -->
    <Popup v-model:show="showSettingsDialog" position="bottom" :style="{ height: '60%' }">
      <div class="settings-dialog">
        <div class="dialog-header">
          <span>消息设置</span>
          <Icon name="cross" @click="showSettingsDialog = false" />
        </div>
        <div class="dialog-content">
          <div class="setting-section">
            <div class="section-title">推送设置</div>
            <Cell title="任务提醒" is-link>
              <template #right-icon>
                <Switch v-model="settings.taskReminder" />
              </template>
            </Cell>
            <Cell title="审批通知" is-link>
              <template #right-icon>
                <Switch v-model="settings.approvalNotification" />
              </template>
            </Cell>
            <Cell title="异常报警" is-link>
              <template #right-icon>
                <Switch v-model="settings.exceptionAlert" />
              </template>
            </Cell>
            <Cell title="系统通知" is-link>
              <template #right-icon>
                <Switch v-model="settings.systemNotification" />
              </template>
            </Cell>
          </div>
          
          <div class="setting-section">
            <div class="section-title">免打扰设置</div>
            <Field v-model="settings.quietHours.start" label="开始时间" placeholder="HH:mm" />
            <Field v-model="settings.quietHours.end" label="结束时间" placeholder="HH:mm" />
            <Cell title="周末免打扰" is-link>
              <template #right-icon>
                <Switch v-model="settings.weekendQuiet" />
              </template>
            </Cell>
          </div>
        </div>
        <div class="dialog-actions">
          <Button block type="primary" @click="saveSettings">
            保存设置
          </Button>
        </div>
      </div>
    </Popup>
  </div>
</template>

<script setup>
// KeepAlive 需要组件名称
defineOptions({ name: 'Notifications' })

import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { 
  NavBar, Icon, Badge, Checkbox, Button, PullRefresh, List, Empty,
  Popup, Cell, Field, Switch, showToast, showConfirmDialog 
} from 'vant';
import { productionApi, systemApi } from '@/services/api';

const router = useRouter();

// 响应式数据
const messages = ref([]);
const selectedMessages = ref([]);
const selectAll = ref(false);
const activeFilter = ref('all');
const loading = ref(false);
const finished = ref(false);
const refreshing = ref(false);
const showSettingsDialog = ref(false);

// 消息设置
const settings = reactive({
  taskReminder: true,
  approvalNotification: true,
  exceptionAlert: true,
  systemNotification: true,
  quietHours: {
    start: '22:00',
    end: '08:00'
  },
  weekendQuiet: false
});

// 消息筛选器
const messageFilters = ref([
  { key: 'all', label: '全部', icon: 'records', count: 0 },
  { key: 'task', label: '任务', icon: 'todo-list-o', count: 0 },
  { key: 'approval', label: '审批', icon: 'passed', count: 0 },
  { key: 'exception', label: '异常', icon: 'warning-o', count: 0 },
  { key: 'system', label: '系统', icon: 'setting-o', count: 0 }
]);

// 计算属性
const totalCount = computed(() => messages.value.length);
const unreadCount = computed(() => messages.value.filter(m => !m.read).length);
const urgentCount = computed(() => messages.value.filter(m => m.priority === 'urgent').length);

const filteredMessages = computed(() => {
  let filtered = messages.value;
  
  if (activeFilter.value !== 'all') {
    if (activeFilter.value === 'unread') {
      filtered = filtered.filter(m => !m.read);
    } else if (activeFilter.value === 'urgent') {
      filtered = filtered.filter(m => m.priority === 'urgent');
    } else {
      filtered = filtered.filter(m => m.type === activeFilter.value);
    }
  }
  
  return filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
});

// 获取消息图标
const getMessageIcon = (type) => {
  const iconMap = {
    'task': 'todo-list-o',
    'approval': 'passed',
    'exception': 'warning-o',
    'system': 'setting-o'
  };
  return iconMap[type] || 'bell';
};

// 获取消息颜色
const getMessageColor = (type) => {
  const colorMap = {
    'task': '#5E7BF6',
    'approval': '#2CCFB0',
    'exception': '#FF6B6B',
    'system': 'var(--color-warning)'
  };
  return colorMap[type] || 'var(--text-disabled)';
};

// 格式化时间
const formatTime = (timestamp) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
  return date.toLocaleDateString('zh-CN');
};

// 分页状态
const currentPage = ref(1);
const pageSize = 20;

// 加载消息
const loadMessages = async (isRefresh = false) => {
  if (isRefresh) {
    messages.value = [];
    currentPage.value = 1;
    finished.value = false;
  }

  try {
    const params = {
      page: currentPage.value,
      pageSize,
    };
    // 按类型筛选
    if (activeFilter.value && activeFilter.value !== 'all' && activeFilter.value !== 'unread' && activeFilter.value !== 'urgent') {
      params.type = activeFilter.value;
    }
    if (activeFilter.value === 'unread') {
      params.is_read = false;
    }

    const response = await systemApi.getNotifications(params);
    const data = response.data;
    const list = data?.list || data?.rows || (Array.isArray(data) ? data : []);

    // 规范化字段名（后端 is_read → 前端 read）
    const normalized = list.map(item => ({
      ...item,
      read: item.read ?? item.is_read ?? false,
      priority: item.priority || 'normal'
    }));

    if (isRefresh) {
      messages.value = normalized;
    } else {
      // 按 id 去重，防止分页边界导致重复 key
      const existingIds = new Set(messages.value.map(m => m.id));
      const newItems = normalized.filter(m => !existingIds.has(m.id));
      messages.value.push(...newItems);
    }

    finished.value = normalized.length < pageSize;
    currentPage.value++;

    // 更新筛选器计数
    updateFilterCounts();

  } catch (error) {
    console.error('加载消息失败:', error);
    showToast('加载失败，请重试');
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
};

// 更新筛选器计数
const updateFilterCounts = () => {
  messageFilters.value.forEach(filter => {
    if (filter.key === 'all') {
      filter.count = messages.value.length;
    } else {
      filter.count = messages.value.filter(m => m.type === filter.key).length;
    }
  });
};

// 事件处理
const onLoad = () => {
  loading.value = true;
  loadMessages();
};

const onRefresh = () => {
  refreshing.value = true;
  loadMessages(true);
};

const filterByType = (type) => {
  activeFilter.value = type;
  selectedMessages.value = [];
  selectAll.value = false;
};

const selectFilter = (filterKey) => {
  activeFilter.value = filterKey;
  selectedMessages.value = [];
  selectAll.value = false;
};

const handleSelectAll = (checked) => {
  if (checked) {
    selectedMessages.value = filteredMessages.value.map(m => m.id);
  } else {
    selectedMessages.value = [];
  }
};

const viewMessage = (message) => {
  // 标记为已读
  if (!message.read) {
    message.read = true;
    updateFilterCounts();
  }
  
  // 跳转到详情页或相关页面
  router.push(`/notifications/${message.id}`);
};

const handleAction = async (message, action) => {
  try {
    switch (action.key) {
      case 'view':
        router.push(`/production/tasks/${message.meta?.任务编号}`);
        break;
      case 'complete':
        {
          const taskId = message.related_id || message.meta?.任务ID || message.meta?.taskId;
          if (taskId) {
            await productionApi.updateProductionTaskStatus(taskId, 'completed');
            message.read = true;
            showToast('任务已完成');
          } else {
            router.push('/production/tasks');
          }
        }
        break;
      case 'approve':
        const approveResult = await showConfirmDialog({
          title: '确认审批',
          message: `确定要同意订单 ${message.meta?.订单编号} 吗？`
        });
        if (approveResult === 'confirm') {
          showToast('审批成功');
          message.read = true;
        }
        break;
      case 'reject':
        const rejectResult = await showConfirmDialog({
          title: '确认拒绝',
          message: `确定要拒绝订单 ${message.meta?.订单编号} 吗？`
        });
        if (rejectResult === 'confirm') {
          showToast('已拒绝');
          message.read = true;
        }
        break;
      case 'purchase':
        router.push('/purchase/orders/create');
        break;
    }
  } catch {
    // 用户取消
  }
};

const markAsRead = async () => {
  try {
    // 逐个调用后端标记已读
    await Promise.all(
      selectedMessages.value.map(id => systemApi.markNotificationRead(id))
    );
    selectedMessages.value.forEach(id => {
      const message = messages.value.find(m => m.id === id);
      if (message) message.read = true;
    });
    selectedMessages.value = [];
    selectAll.value = false;
    updateFilterCounts();
    showToast('已标记为已读');
  } catch {
    showToast('标记失败，请重试');
  }
};

const deleteMessages = async () => {
  try {
    await showConfirmDialog({
      title: '确认删除',
      message: `确定要删除选中的 ${selectedMessages.value.length} 条消息吗？`
    });

    // 调用后端逐个删除
    await Promise.all(
      selectedMessages.value.map(id => systemApi.deleteNotification(id))
    );
    messages.value = messages.value.filter(m => !selectedMessages.value.includes(m.id));
    selectedMessages.value = [];
    selectAll.value = false;
    updateFilterCounts();
    showToast('删除成功');
  } catch (error) {
    if (error !== 'cancel') {
      showToast('删除失败，请重试');
    }
  }
};

const showSettings = () => {
  showSettingsDialog.value = true;
};

const saveSettings = () => {
  // 保存设置到本地存储
  localStorage.setItem('notification_settings', JSON.stringify(settings));
  showSettingsDialog.value = false;
  showToast('设置已保存');
};

// 初始化
onMounted(() => {
  loadMessages(true);
  
  // 加载设置
  try {
    const savedSettings = localStorage.getItem('notification_settings');
    if (savedSettings) {
      Object.assign(settings, JSON.parse(savedSettings));
    }
  } catch (error) {
    console.error('加载设置失败:', error);
  }
});
</script>

<style lang="scss" scoped>
.notifications-page {
  min-height: 100vh;
  background-color: var(--bg-primary);
}

.nav-right-btns {
  display: flex;
  align-items: center;
  gap: 14px;
}

.content-container {
  padding: 12px;
}

.message-stats {
  display: flex;
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: none;

  .stats-item {
    flex: 1;
    text-align: center;
    cursor: pointer;

    .stats-number {
      font-size: 24px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 4px;

      &.unread {
        color: var(--module-red);
      }

      &.urgent {
        color: var(--module-orange);
      }
    }

    .stats-label {
      font-size: 12px;
      color: var(--text-secondary);
    }
  }
}

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
  &::-webkit-scrollbar { display: none; }
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
  .chip-text { font-weight: 500; }
  &.active {
    background: var(--color-accent-bg, rgba(59, 130, 246, 0.1));
    border-color: var(--color-accent, var(--color-primary));
    color: var(--color-accent, var(--color-primary));
  }
}

.action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-secondary);
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 12px;

  .action-right {
    display: flex;
    gap: 8px;
  }
}

.message-list {
  .message-item {
    display: flex;
    align-items: flex-start;
    background: var(--bg-secondary);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 8px;
    box-shadow: none;
    transition: all 0.2s;

    &.unread {
      border-left: 3px solid var(--color-primary);
    }

    &.selected {
      background-color: var(--bg-secondary);
    }

    .message-checkbox {
      margin-right: 12px;
      padding-top: 2px;
    }

    .message-icon {
      position: relative;
      margin-right: 12px;
      padding-top: 2px;

      .priority-badge {
        position: absolute;
        top: -2px;
        right: -2px;
        width: 8px;
        height: 8px;
        background-color: var(--module-red);
        border-radius: 50%;
      }
    }

    .message-content {
      flex: 1;

      .message-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;

        .message-title {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
        }

        .message-time {
          font-size: 12px;
          color: var(--text-secondary);
        }
      }

      .message-body {
        margin-bottom: 8px;

        .message-text {
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.4;
          margin-bottom: 8px;
        }

        .message-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;

          .meta-item {
            font-size: 12px;

            .meta-label {
              color: var(--text-secondary);
            }

            .meta-value {
              color: var(--text-primary);
              margin-left: 4px;
            }
          }
        }
      }

      .message-actions {
        display: flex;
        gap: 8px;
      }
    }

    .message-status {
      display: flex;
      align-items: center;
      margin-left: 8px;
      padding-top: 2px;

      .read-indicator {
        width: 8px;
        height: 8px;
        background-color: var(--color-primary);
        border-radius: 50%;
        margin-right: 8px;
      }
    }
  }
}

.empty-messages {
  padding: 60px 20px;
  text-align: center;
}

.settings-dialog {
  height: 100%;
  display: flex;
  flex-direction: column;

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    border-bottom: 1px solid var(--van-border-color);
    font-size: 16px;
    font-weight: 600;
  }

  .dialog-content {
    flex: 1;
    overflow-y: auto;

    .setting-section {
      margin-bottom: 20px;

      .section-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-primary);
        padding: 16px;
        background-color: var(--bg-primary);
      }
    }
  }

  .dialog-actions {
    padding: 16px;
    border-top: 1px solid var(--van-border-color);
  }
}
</style>
