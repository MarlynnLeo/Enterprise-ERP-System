<!--
/**
 * NotificationDetail.vue - 消息详情
 * @description 消息通知详情查看页面
 * @date 2026-04-18
 * @version 1.0.0
 */
-->
<template>
  <div class="notification-detail-page">
    <NavBar title="消息详情" left-arrow @click-left="$router.go(-1)" />

    <div v-if="loading" class="loading-container">
      <Loading size="24" />
      <span>加载中...</span>
    </div>

    <div v-else-if="notification" class="content-container">
      <!-- 消息头部 -->
      <div class="detail-header">
        <div class="type-badge" :class="notification.type">
          <Icon :name="getTypeIcon(notification.type)" size="20" />
        </div>
        <div class="header-info">
          <div class="detail-title">{{ notification.title }}</div>
          <div class="detail-meta">
            <span>{{ notification.sender || '系统通知' }}</span>
            <span class="separator">·</span>
            <span>{{ formatTime(notification.created_at) }}</span>
          </div>
        </div>
      </div>

      <!-- 消息正文 -->
      <div class="detail-body">
        <div class="message-content">{{ notification.content || notification.message || '暂无详细内容' }}</div>
      </div>

      <!-- 关联信息 -->
      <div v-if="notification.related_type" class="related-info">
        <Cell
          :title="getRelatedLabel(notification.related_type)"
          :value="notification.related_id"
          is-link
          @click="navigateToRelated"
        />
      </div>

      <!-- 操作按钮 -->
      <div class="detail-actions">
        <Button v-if="!notification.is_read" type="primary" block round @click="markAsRead">
          标记为已读
        </Button>
        <Button type="default" block round @click="deleteNotification">
          删除消息
        </Button>
      </div>
    </div>

    <div v-else class="empty-container">
      <Empty description="消息不存在或已被删除" />
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { NavBar, Icon, Cell, Button, Loading, Empty, showToast } from 'vant'
  import { systemApi } from '@/services/api'

  const route = useRoute()
  const router = useRouter()

  const loading = ref(true)
  const notification = ref(null)

  const getTypeIcon = (type) => {
    const icons = {
      system: 'setting-o',
      approval: 'todo-list-o',
      alert: 'warning-o',
      task: 'calendar-o',
      message: 'chat-o'
    }
    return icons[type] || 'bell'
  }

  const getRelatedLabel = (type) => {
    const labels = {
      order: '关联订单',
      task: '关联任务',
      inspection: '关联检验',
      approval: '关联审批'
    }
    return labels[type] || '关联内容'
  }

  const formatTime = (dateStr) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const loadNotification = async () => {
    loading.value = true
    try {
      const id = route.params.id
      const response = await systemApi.getNotifications({ id })
      const list = response.data?.list || response.data || []
      notification.value = Array.isArray(list) ? list[0] : list
    } catch (error) {
      console.error('加载消息详情失败:', error)
      notification.value = null
    } finally {
      loading.value = false
    }
  }

  const markAsRead = async () => {
    try {
      await systemApi.markNotificationRead(route.params.id)
      notification.value.is_read = true
      showToast('已标记为已读')
    } catch {
      showToast('操作失败')
    }
  }

  const deleteNotification = async () => {
    try {
      await systemApi.deleteNotification(route.params.id)
      showToast('已删除')
      router.back()
    } catch {
      showToast('删除失败')
    }
  }

  const navigateToRelated = () => {
    const id = notification.value?.related_id
    const routeMap = {
      order: id ? `/sales/orders/${id}` : '/sales/orders',
      task: id ? `/production/tasks/${id}` : '/production/tasks',
      inspection: id ? `/quality/incoming/${id}` : '/quality/incoming',
      approval: '/notifications'
    }
    const target = routeMap[notification.value?.related_type]
    if (target) {
      router.push(target)
    } else {
      showToast('未配置关联页面')
    }
  }

  onMounted(() => {
    loadNotification()
  })
</script>

<style scoped>
  .notification-detail-page {
    min-height: 100vh;
    background-color: var(--bg-primary);
  }

  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 0;
    gap: 12px;
    color: var(--text-secondary);
  }

  .content-container {
    padding: 16px;
  }

  .detail-header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 20px;
  }

  .type-badge {
    padding: 10px;
    border-radius: 12px;
    background: var(--bg-secondary);
  }
  .type-badge.system { color: var(--color-info); }
  .type-badge.approval { color: var(--color-warning); }
  .type-badge.alert { color: var(--color-error); }
  .type-badge.task { color: var(--color-success); }

  .header-info {
    flex: 1;
  }

  .detail-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 6px;
    line-height: 1.4;
  }

  .detail-meta {
    font-size: 0.8rem;
    color: var(--text-secondary);
  }
  .detail-meta .separator {
    margin: 0 6px;
  }

  .detail-body {
    background: var(--bg-secondary);
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 16px;
  }

  .message-content {
    font-size: 0.9375rem;
    color: var(--text-primary);
    line-height: 1.6;
    white-space: pre-wrap;
  }

  .related-info {
    margin-bottom: 16px;
    border-radius: 12px;
    overflow: hidden;
  }

  .detail-actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 24px;
  }

  .empty-container {
    padding: 60px 0;
  }
</style>
