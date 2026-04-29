<!--
/**
 * Notifications.vue
 * @description 通知列表页面
 * @date 2025-11-03
 */
-->
<template>
  <div class="notifications-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>通知中心</h2>
          <p class="subtitle">查看系统通知与消息</p>
        </div>
        <el-button type="primary" :icon="Check" @click="handleMarkAllRead" v-if="unreadCount > 0">全部标记为已读</el-button>
      </div>
    </el-card>

    <!-- 统计卡片 -->
    <el-row :gutter="16" class="stats-row">
      <el-col :xs="12" :sm="8" :md="4" :lg="4">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
              <el-icon :size="32"><Bell /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ total }}</div>
              <div class="stat-label">全部通知</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="8" :md="4" :lg="4">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
              <el-icon :size="32"><Message /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ unreadCount }}</div>
              <div class="stat-label">未读通知</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="8" :md="4" :lg="4">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);">
              <el-icon :size="32"><InfoFilled /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ systemCount }}</div>
              <div class="stat-label">系统通知</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="8" :md="4" :lg="4">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);">
              <el-icon :size="32"><Document /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ businessCount }}</div>
              <div class="stat-label">业务通知</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="8" :md="4" :lg="4">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon" style="background: linear-gradient(135deg, #f56c6c 0%, #e74c3c 100%);">
              <el-icon :size="32"><Warning /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ warningCount }}</div>
              <div class="stat-label">预警通知</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 筛选栏 -->
    <el-card class="filter-card">
      <el-tabs v-model="activeTab" @tab-change="handleTabChange">
        <el-tab-pane label="全部" name="all"></el-tab-pane>
        <el-tab-pane label="未读" name="unread"></el-tab-pane>
        <el-tab-pane label="系统通知" name="system"></el-tab-pane>
        <el-tab-pane label="业务通知" name="business"></el-tab-pane>
        <el-tab-pane label="预警通知" name="warning"></el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 通知列表 -->
    <el-card class="list-card">
      <div class="notification-list" v-loading="loading">
        <div 
          v-for="notification in notifications" 
          :key="notification.id"
          class="notification-item"
          :class="{ 'unread': !notification.is_read }"
        >
          <div class="notification-icon">
            <el-icon :size="32" :color="getNotificationColor(notification.type)">
              <component :is="getNotificationIcon(notification.type)" />
            </el-icon>
          </div>
          <div class="notification-content">
            <div class="notification-header">
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
              <div class="notification-time">{{ formatTime(notification.created_at) }}</div>
            </div>
            <div class="notification-text">{{ notification.content }}</div>
            <div class="notification-footer">
              <el-tag :type="getTypeTag(notification.type)" size="small">
                {{ getTypeText(notification.type) }}
              </el-tag>
              <div class="notification-actions">
                <el-button 
                  v-if="!notification.is_read"
                  link 
                  type="primary" 
                  size="small"
                  @click="handleMarkRead(notification.id)"
                >
                  标记已读
                </el-button>
                <el-button 
                  v-if="notification.link"
                  link 
                  type="success" 
                  size="small"
                  @click="handleGotoLink(notification)"
                >
                  查看详情
                </el-button>
                <el-button v-permission="'system:notifications:delete'"
                  link 
                  type="danger" 
                  size="small"
                  @click="handleDelete(notification.id)"
                >
                  删除
                </el-button>
              </div>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <el-empty 
          v-if="!loading && notifications.length === 0" 
          description="暂无通知"
        />
      </div>

      <!-- 分页 -->
      <el-pagination
        v-if="total > 0"
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handleSizeChange"
        @current-change="handlePageChange"
      />
    </el-card>

    <!-- 通知详情对话框 -->
    <el-dialog
      v-model="detailDialogVisible"
      :title="currentNotification?.title || '通知详情'"
      width="600px"
      destroy-on-close
    >
      <div class="notification-detail" v-if="currentNotification">
        <div class="detail-header">
          <el-tag :type="getTypeTag(currentNotification.type)" size="large">
            {{ getTypeText(currentNotification.type) }}
          </el-tag>
          <el-tag 
            v-if="currentNotification.priority === 2" 
            type="danger" 
            size="large"
            effect="dark"
            style="margin-left: 8px;"
          >
            紧急
          </el-tag>
          <el-tag 
            v-else-if="currentNotification.priority === 1" 
            type="warning" 
            size="large"
            style="margin-left: 8px;"
          >
            重要
          </el-tag>
          <span class="detail-time">{{ formatTime(currentNotification.created_at) }}</span>
        </div>
        <el-divider />
        <div class="detail-content">
          <p>{{ currentNotification.content }}</p>
        </div>
        <div class="detail-meta" v-if="currentNotification.link">
          <el-divider />
          <p class="meta-label">关联链接：</p>
          <el-button type="primary" @click="gotoNotificationLink">
            <el-icon><Link /></el-icon>
            前往查看
          </el-button>
        </div>
      </div>
      <template #footer>
        <el-button @click="detailDialogVisible = false">关闭</el-button>
        <el-button 
          v-if="currentNotification && !currentNotification.is_read" 
          type="primary" 
          @click="handleMarkReadAndClose"
        >
          标记已读并关闭
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Bell, Message, InfoFilled, Document, Check, Warning, Link } from '@element-plus/icons-vue'
import notificationApi from '@/services/notificationApi'
import {
  getNotificationIcon,
  getNotificationColor,
  getTypeTag,
  getTypeText,
  formatNotificationTime as formatTime,
  WARNING_TYPES,
} from '@/utils/notificationHelper'

const router = useRouter()

// 数据
const loading = ref(false)
const notifications = ref([])
const total = ref(0)
const unreadCount = ref(0)
const systemCount = ref(0)
const businessCount = ref(0)
const warningCount = ref(0)
const activeTab = ref('all')
const pagination = reactive({
  page: 1,
  pageSize: 20
})

// 详情对话框
const detailDialogVisible = ref(false)
const currentNotification = ref(null)

// axios拦截器已自动解包ResponseHandler格式
const parseResponseData = (res) => res.data

// 方法
const loadNotifications = async () => {
  try {
    loading.value = true
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize
    }

    if (activeTab.value === 'unread') {
      params.isRead = false
    } else if (activeTab.value === 'warning') {
      params.type = WARNING_TYPES
    } else if (activeTab.value !== 'all') {
      params.type = activeTab.value
    }

    const res = await notificationApi.getNotifications(params)
    const responseData = parseResponseData(res)
    notifications.value = responseData.list || []
    total.value = Number(responseData.total) || 0
  } catch (error) {
    ElMessage.error('加载通知失败')
  } finally {
    loading.value = false
  }
}

const loadStats = async () => {
  try {
    // 获取未读数量
    const unreadRes = await notificationApi.getUnreadCount()
    const unreadData = parseResponseData(unreadRes)
    unreadCount.value = Number(unreadData.count) || 0

    // 获取系统通知数量
    const systemRes = await notificationApi.getNotifications({ type: 'system', pageSize: 1 })
    const systemData = parseResponseData(systemRes)
    systemCount.value = Number(systemData.total) || 0

    // 获取业务通知数量
    const businessRes = await notificationApi.getNotifications({ type: 'business', pageSize: 1 })
    const businessData = parseResponseData(businessRes)
    businessCount.value = Number(businessData.total) || 0

    // 获取预警通知数量
    const warningRes = await notificationApi.getNotifications({ type: WARNING_TYPES, pageSize: 1 })
    const warningData = parseResponseData(warningRes)
    warningCount.value = Number(warningData.total) || 0
  } catch (error) {
    // 静默失败
  }
}

const handleTabChange = () => {
  pagination.page = 1
  loadNotifications()
}

const handleSizeChange = () => {
  loadNotifications()
}

const handlePageChange = () => {
  loadNotifications()
}

const handleMarkRead = async (id) => {
  try {
    await notificationApi.markAsRead(id)
    await loadNotifications()
    await loadStats()
    ElMessage.success('标记成功')
  } catch (error) {
    ElMessage.error('标记失败')
  }
}

const handleMarkAllRead = async () => {
  try {
    await notificationApi.markAllAsRead()
    await loadNotifications()
    await loadStats()
    ElMessage.success('全部已标记为已读')
  } catch (error) {
    ElMessage.error('操作失败')
  }
}

const handleDelete = async (id) => {
  try {
    await ElMessageBox.confirm('确定要删除这条通知吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await notificationApi.deleteNotification(id)
    await loadNotifications()
    await loadStats()
    ElMessage.success('删除成功')
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

// 显示通知详情对话框
const handleGotoLink = (notification) => {
  currentNotification.value = notification
  detailDialogVisible.value = true
}

// 跳转到通知关联链接
const gotoNotificationLink = () => {
  if (currentNotification.value?.link) {
    detailDialogVisible.value = false
    router.push(currentNotification.value.link)
  }
}

// 标记已读并关闭对话框
const handleMarkReadAndClose = async () => {
  if (currentNotification.value) {
    await handleMarkRead(currentNotification.value.id)
    detailDialogVisible.value = false
  }
}

// 类型映射函数已统一到 @/utils/notificationHelper.js
// getNotificationIcon, getNotificationColor, getTypeTag, getTypeText, formatTime 均从那里导入

// 生命周期
onMounted(() => {
  loadNotifications()
  loadStats()
})
</script>

<style scoped>
.header-card {
  margin-bottom: 20px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title-section h2 {
  margin: 0 0 5px 0;
  font-size: 20px;
  color: var(--color-text-primary);
}

.subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.notifications-container {
  padding: 20px;
}

.page-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.stats-row {
  margin-bottom: 20px;
}

.stat-card {
  cursor: pointer;
  transition: all 0.3s;
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  width: 64px;
  height: 64px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-on-primary, #fff);
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 28px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
}

.stat-label {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.filter-card {
  margin-bottom: 20px;
}

.list-card {
  min-height: 400px;
}

.notification-list {
  min-height: 300px;
}

.notification-item {
  display: flex;
  padding: 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  transition: all 0.3s;
}

.notification-item:hover {
  background-color: var(--el-fill-color-light);
}

.notification-item.unread {
  background-color: rgba(64, 158, 255, 0.05);
  border-left: 4px solid var(--el-color-primary);
}

.notification-icon {
  margin-right: 16px;
  flex-shrink: 0;
}

.notification-content {
  flex: 1;
  min-width: 0;
}

.notification-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.notification-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.notification-time {
  font-size: 13px;
  color: var(--el-text-color-placeholder);
  white-space: nowrap;
  margin-left: 16px;
}

.notification-text {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  margin-bottom: 12px;
  line-height: 1.6;
}

.notification-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.notification-actions {
  display: flex;
  gap: 8px;
}

/* 详情对话框样式 */
.notification-detail {
  padding: 10px 0;
}

.detail-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.detail-time {
  margin-left: auto;
  font-size: 14px;
  color: var(--el-text-color-placeholder);
}

.detail-content {
  font-size: 15px;
  line-height: 1.8;
  color: var(--el-text-color-primary);
}

.detail-content p {
  margin: 0;
  white-space: pre-wrap;
}

.detail-meta {
  margin-top: 10px;
}

.meta-label {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  margin-bottom: 10px;
}
</style>

