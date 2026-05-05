<!--
/**
 * NotificationCenter.vue
 * @description 通知中心组件 - 显示在顶部导航栏
 * @date 2025-11-03
 */
-->
<template>
  <el-popover
    v-model:visible="popoverVisible"
    placement="bottom-end"
    :width="400"
    trigger="click"
    :hide-after="0"
    :popper-options="{
      modifiers: [
        {
          name: 'offset',
          options: {
            offset: [0, 10]
          }
        }
      ]
    }"
    @show="handlePopoverShow"
    @hide="handlePopoverHide"
  >
    <template #reference>
      <div class="notification-bell">
        <el-badge :value="unreadCount" :hidden="unreadCount === 0" :max="99">
          <el-icon :size="20">
            <Bell />
          </el-icon>
        </el-badge>
      </div>
    </template>

    <!-- 通知列表 -->
    <div class="notification-panel" @click.stop>
      <!-- 头部 -->
      <div class="notification-header">
        <span class="title">通知中心</span>
        <div class="header-actions">
          <el-button
            v-if="unreadCount > 0"
            link
            type="primary"
            size="small"
            @click="handleMarkAllRead"
          >
            全部已读
          </el-button>
          <el-button
            link
            size="small"
            class="close-btn"
            @click="popoverVisible = false"
          >
            <el-icon :size="16">
              <Close />
            </el-icon>
          </el-button>
        </div>
      </div>

      <!-- 标签页 -->
      <el-tabs v-model="activeTab" @tab-change="handleTabChange">
        <el-tab-pane label="全部" name="all"></el-tab-pane>
        <el-tab-pane label="未读" name="unread"></el-tab-pane>
        <el-tab-pane label="系统" name="system"></el-tab-pane>
        <el-tab-pane label="业务" name="business"></el-tab-pane>
        <el-tab-pane label="预警" name="warning"></el-tab-pane>
      </el-tabs>

      <!-- 通知列表 -->
      <div class="notification-list" v-loading="loading">
        <div 
          v-for="notification in notifications" 
          :key="notification.id"
          class="notification-item"
          :class="{ 'unread': !notification.is_read }"
          @click="handleNotificationClick(notification)"
        >
          <div class="notification-icon">
            <el-icon :size="24" :color="getNotificationColor(notification.type)">
              <component :is="getNotificationIcon(notification.type)" />
            </el-icon>
          </div>
          <div class="notification-content">
            <div class="notification-title">
              {{ notification.title }}
              <el-tag 
                v-if="notification.priority === 2" 
                type="danger" 
                size="small"
                effect="dark"
              >
                紧急
              </el-tag>
              <el-tag 
                v-else-if="notification.priority === 1" 
                type="warning" 
                size="small"
              >
                重要
              </el-tag>
            </div>
            <div class="notification-text">{{ notification.content }}</div>
            <div class="notification-time">{{ formatTime(notification.created_at) }}</div>
          </div>
          <div class="notification-actions">
            <el-button 
              v-if="!notification.is_read"
              link 
              type="primary" 
              size="small"
              @click.stop="handleMarkRead(notification.id)"
            >
              标记已读
            </el-button>
            <el-button 
              link 
              type="danger" 
              size="small"
              @click.stop="handleDelete(notification.id)"
            >
              删除
            </el-button>
          </div>
        </div>

        <!-- 空状态 -->
        <el-empty 
          v-if="!loading && notifications.length === 0" 
          description="暂无通知"
          :image-size="80"
        />
      </div>

      <!-- 底部 -->
      <div class="notification-footer">
        <el-button link type="primary" @click="handleViewAll">
          查看全部通知
        </el-button>
      </div>
    </div>
  </el-popover>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Bell,
  Close
} from '@element-plus/icons-vue'
import notificationApi from '@/services/notificationApi'
import {
  getNotificationIcon,
  getNotificationColor,
  formatNotificationTime as formatTime,
  WARNING_TYPES,
} from '@/utils/notificationHelper'

const router = useRouter()

// 数据
const popoverVisible = ref(false)
const activeTab = ref('all')
const notifications = ref([])
const unreadCount = ref(0)
const loading = ref(false)
let pollingTimer = null

// axios拦截器已自动解包ResponseHandler格式，无需手动解析
const parseResponseData = (res) => res.data

// 方法
const handlePopoverShow = () => {
  loadNotifications()
}

const handlePopoverHide = () => {
  // 可以在这里做一些清理工作
}

const handleTabChange = () => {
  loadNotifications()
}

const loadNotifications = async () => {
  try {
    loading.value = true
    const params = {
      page: 1,
      pageSize: 10
    }

    if (activeTab.value === 'unread') {
      params.isRead = false
    } else if (activeTab.value === 'system') {
      params.type = 'system'
    } else if (activeTab.value === 'business') {
      params.type = 'business'
    } else if (activeTab.value === 'warning') {
      params.type = WARNING_TYPES
    }

    const res = await notificationApi.getNotifications(params)
    const responseData = parseResponseData(res)
    notifications.value = responseData.list || []
  } catch {
    // 静默失败，避免干扰用户
  } finally {
    loading.value = false
  }
}

const loadUnreadCount = async () => {
  try {
    const res = await notificationApi.getUnreadCount()
    const responseData = parseResponseData(res)
    unreadCount.value = responseData.count || 0
  } catch {
    // 静默失败，避免干扰用户
  }
}

const handleNotificationClick = async (notification) => {
  // 标记为已读
  if (!notification.is_read) {
    await handleMarkRead(notification.id)
  }

  // 如果有链接，跳转
  if (notification.link) {
    popoverVisible.value = false

    // 解析link_params
    let params = {}
    if (notification.link_params) {
      try {
        params = typeof notification.link_params === 'string'
          ? JSON.parse(notification.link_params)
          : notification.link_params
      } catch {
        // 解析失败时使用空对象
      }
    }

    // 跳转并传递参数
    router.push({
      path: notification.link,
      query: params
    })
  }
}

const handleMarkRead = async (id) => {
  try {
    await notificationApi.markAsRead(id)
    await loadNotifications()
    await loadUnreadCount()
  } catch {
    ElMessage.error('标记失败')
  }
}

const handleMarkAllRead = async () => {
  try {
    await notificationApi.markAllAsRead()
    await loadNotifications()
    await loadUnreadCount()
    ElMessage.success('全部已标记为已读')
  } catch {
    ElMessage.error('操作失败')
  }
}

const handleDelete = async (id) => {
  try {
    await notificationApi.deleteNotification(id)
    await loadNotifications()
    await loadUnreadCount()
    ElMessage.success('删除成功')
  } catch {
    ElMessage.error('删除失败')
  }
}

const handleViewAll = () => {
  popoverVisible.value = false
  router.push('/system/notifications')
}

// 轮询获取未读数量（带页面可见性判断，页面不可见时暂停轮询）
const startPolling = () => {
  loadUnreadCount()
  pollingTimer = setInterval(() => {
    // 仅在页面可见时请求，避免后台标签浪费带宽
    if (!document.hidden) {
      loadUnreadCount()
    }
  }, 60000)
}

const stopPolling = () => {
  if (pollingTimer) {
    clearInterval(pollingTimer)
    pollingTimer = null
  }
}

// 页面重新可见时立即刷新一次未读数
const handleVisibilityChange = () => {
  if (!document.hidden) {
    loadUnreadCount()
  }
}

// 生命周期
onMounted(() => {
  startPolling()
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onUnmounted(() => {
  stopPolling()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<style scoped>
.notification-bell {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  position: relative;
}

.notification-bell :deep(.el-badge) {
  display: flex;
  align-items: center;
  justify-content: center;
}

.notification-bell :deep(.el-badge__content) {
  border-radius: 10px;
  font-size: 11px;
  height: 18px;
  line-height: 18px;
  padding: 0 6px;
  border: 2px solid var(--el-bg-color);
  box-shadow: 0 2px 8px rgba(245, 108, 108, 0.4);
  background-color: var(--el-color-danger);
  animation: pulseBadge 2s infinite;
}

@keyframes pulseBadge {
  0% { box-shadow: 0 0 0 0 rgba(245, 108, 108, 0.4); }
  70% { box-shadow: 0 0 0 6px rgba(245, 108, 108, 0); }
  100% { box-shadow: 0 0 0 0 rgba(245, 108, 108, 0); }
}

.notification-bell:hover :deep(.el-icon) {
  animation: bellRing 0.5s ease;
}

@keyframes bellRing {
  0%, 100% { transform: rotate(0deg); }
  10%, 30% { transform: rotate(-10deg); }
  20%, 40% { transform: rotate(10deg); }
  50% { transform: rotate(0deg); }
}

.notification-panel {
  max-height: 600px;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  overflow: hidden;
}

.notification-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: linear-gradient(135deg, rgba(0, 195, 255, 0.05), rgba(0, 195, 255, 0.02));
}

.notification-header .title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.notification-header .header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.notification-header .close-btn {
  padding: 4px;
  color: var(--el-text-color-secondary);
  transition: all 0.3s ease;
}

.notification-header .close-btn:hover {
  color: var(--el-text-color-primary);
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
}

.notification-list {
  flex: 1;
  overflow-y: auto;
  max-height: 400px;
}

.notification-item {
  display: flex;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
}

.notification-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: transparent;
  transition: all 0.3s ease;
}

.notification-item:hover {
  background: linear-gradient(90deg, rgba(0, 195, 255, 0.08), transparent);
  transform: translateX(4px);
}

.notification-item:hover::before {
  background: var(--tech-primary);
}

.notification-item.unread {
  background: linear-gradient(90deg, rgba(64, 158, 255, 0.1), rgba(64, 158, 255, 0.02));
}

.notification-item.unread::before {
  background: var(--el-color-primary);
}

.notification-icon {
  margin-right: 12px;
  flex-shrink: 0;
}

.notification-content {
  flex: 1;
  min-width: 0;
}

.notification-title {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.notification-text {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notification-time {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.notification-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-left: 8px;
}

.notification-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--el-border-color-lighter);
  text-align: center;
}
</style>

