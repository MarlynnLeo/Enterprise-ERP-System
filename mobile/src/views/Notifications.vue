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
        <Icon name="setting-o" size="18" @click="showSettings" />
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
      <div class="message-filters">
        <div class="filter-tabs">
          <div 
            v-for="filter in messageFilters" 
            :key="filter.key"
            class="filter-tab"
            :class="{ active: activeFilter === filter.key }"
            @click="selectFilter(filter.key)"
          >
            <Icon :name="filter.icon" size="16" />
            <span>{{ filter.label }}</span>
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
                <Icon name="arrow" size="12" color="#c8c9cc" />
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
            <Cell title="免打扰时间" is-link @click="setQuietHours">
              <template #value>
                {{ settings.quietHours.start }} - {{ settings.quietHours.end }}
              </template>
            </Cell>
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
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { 
  NavBar, Icon, Badge, Checkbox, Button, PullRefresh, List, Empty,
  Popup, Cell, Switch, showToast, showConfirmDialog 
} from 'vant';

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
    'system': '#FF9F45'
  };
  return colorMap[type] || '#c8c9cc';
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

// 加载消息
const loadMessages = async (isRefresh = false) => {
  if (isRefresh) {
    messages.value = [];
    finished.value = false;
  }

  try {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 模拟消息数据
    const mockMessages = [
      {
        id: 1,
        type: 'task',
        title: '生产任务提醒',
        content: '生产任务 TASK-20241201-001 即将到期，请及时处理',
        priority: 'urgent',
        read: false,
        created_at: Date.now() - 300000,
        meta: {
          '任务编号': 'TASK-20241201-001',
          '截止时间': '2024-12-01 18:00'
        },
        actions: [
          { key: 'view', label: '查看任务', type: 'primary' },
          { key: 'complete', label: '完成任务', type: 'success' }
        ]
      },
      {
        id: 2,
        type: 'approval',
        title: '采购订单审批',
        content: '采购订单 PO-20241201-001 等待您的审批',
        priority: 'normal',
        read: false,
        created_at: Date.now() - 1800000,
        meta: {
          '订单编号': 'PO-20241201-001',
          '金额': '¥25,500.00'
        },
        actions: [
          { key: 'approve', label: '同意', type: 'success' },
          { key: 'reject', label: '拒绝', type: 'danger' }
        ]
      },
      {
        id: 3,
        type: 'exception',
        title: '库存异常报警',
        content: '物料 304不锈钢板 库存不足，当前库存：50kg，安全库存：100kg',
        priority: 'urgent',
        read: true,
        created_at: Date.now() - 3600000,
        meta: {
          '物料编码': 'MAT-20241201-001',
          '当前库存': '50kg'
        },
        actions: [
          { key: 'purchase', label: '立即采购', type: 'primary' }
        ]
      },
      {
        id: 4,
        type: 'system',
        title: '系统维护通知',
        content: '系统将于今晚22:00-24:00进行维护升级，期间可能影响正常使用',
        priority: 'normal',
        read: true,
        created_at: Date.now() - 7200000
      }
    ];
    
    const newMessages = isRefresh ? mockMessages : [];
    
    if (isRefresh) {
      messages.value = newMessages;
    } else {
      messages.value.push(...newMessages);
    }
    
    finished.value = newMessages.length < 20;
    
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
        showToast('任务完成功能开发中');
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
  } catch (error) {
    // 用户取消
  }
};

const markAsRead = () => {
  selectedMessages.value.forEach(id => {
    const message = messages.value.find(m => m.id === id);
    if (message) {
      message.read = true;
    }
  });
  selectedMessages.value = [];
  selectAll.value = false;
  updateFilterCounts();
  showToast('已标记为已读');
};

const deleteMessages = async () => {
  try {
    const result = await showConfirmDialog({
      title: '确认删除',
      message: `确定要删除选中的 ${selectedMessages.value.length} 条消息吗？`
    });
    
    if (result === 'confirm') {
      messages.value = messages.value.filter(m => !selectedMessages.value.includes(m.id));
      selectedMessages.value = [];
      selectAll.value = false;
      updateFilterCounts();
      showToast('删除成功');
    }
  } catch (error) {
    // 用户取消
  }
};

const showSettings = () => {
  showSettingsDialog.value = true;
};

const setQuietHours = () => {
  showToast('免打扰时间设置功能开发中');
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

.message-filters {
  margin-bottom: 12px;

  .filter-tabs {
    display: flex;
    background: var(--bg-secondary);
    border-radius: 8px;
    padding: 4px;
    overflow-x: auto;

    .filter-tab {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      padding: 8px 12px;
      font-size: 12px;
      color: var(--text-secondary);
      border-radius: 6px;
      transition: all 0.2s;
      white-space: nowrap;
      position: relative;

      &.active {
        background-color: var(--color-primary);
        color: #fff;
      }

      span {
        margin: 0 4px;
      }
    }
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
      background-color: #f0f9ff;
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
