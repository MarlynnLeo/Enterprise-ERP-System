<!--
/**
 * Chat.vue
 * @description 即时通讯页面 - 会话列表与聊天窗口
 * @date 2026-04-20
 * @version 1.0.0
 */
-->
<template>
  <div class="chat-page">
    <!-- ==================== 会话列表视图 ==================== -->
    <div v-if="!activeConversation" class="conversation-list-view">
      <NavBar title="即时通讯">
        <template #left>
          <Icon name="arrow-left" size="18" @click="$router.go(-1)" />
        </template>
        <template #right>
          <Icon name="friends-o" size="20" @click="showContacts = true" />
        </template>
      </NavBar>

      <!-- 连接状态 -->
      <div v-if="!isConnected" class="connection-bar">
        <Icon name="warning-o" size="14" />
        <span>连接中...</span>
      </div>

      <!-- 搜索 -->
      <div class="search-box">
        <Search v-model="searchKeyword" placeholder="搜索会话" shape="round" />
      </div>

      <!-- 会话列表 -->
      <div class="conversation-list">
        <div v-if="filteredConversations.length === 0" class="empty-state">
          <Icon name="chat-o" size="48" color="var(--text-disabled)" />
          <p>暂无聊天记录</p>
          <Button size="small" type="primary" plain @click="showContacts = true">发起聊天</Button>
        </div>
        <div
          v-for="conv in filteredConversations"
          :key="conv.id"
          class="conversation-item"
          @click="openConversation(conv)"
        >
          <div class="conv-avatar">
            <img v-if="conv.display_avatar" :src="conv.display_avatar" class="avatar-img" />
            <div v-else class="avatar-fallback">
              <Icon :name="conv.type === 'group' ? 'friends-o' : 'user-o'" size="20" />
            </div>
            <span v-if="conv.other_online" class="online-dot"></span>
          </div>
          <div class="conv-info">
            <div class="conv-top">
              <span class="conv-name">{{ conv.display_name || conv.name || '未命名会话' }}</span>
              <span class="conv-time">{{ formatTime(conv.last_message_at) }}</span>
            </div>
            <div class="conv-bottom">
              <span class="conv-preview">{{ conv.last_message_preview || '暂无消息' }}</span>
              <Badge v-if="conv.unread_count > 0" :content="conv.unread_count" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ==================== 聊天窗口视图 ==================== -->
    <div v-else class="chat-room-view">
      <NavBar :title="activeConversation.display_name || activeConversation.name || '聊天'">
        <template #left>
          <Icon name="arrow-left" size="18" @click="closeConversation" />
        </template>
      </NavBar>

      <!-- 消息列表 -->
      <div class="message-area" ref="messageAreaRef">
        <div v-if="loadingMessages" class="loading-more">
          <Loading size="20" />
          <span>加载中...</span>
        </div>
        <div
          v-for="msg in messages"
          :key="msg.id"
          class="message-row"
          :class="{ 'is-self': msg.sender_id === currentUserId, 'is-system': msg.type === 'system' }"
        >
          <!-- 系统消息 -->
          <div v-if="msg.type === 'system'" class="system-msg">{{ msg.content }}</div>
          <!-- 普通消息 -->
          <template v-else>
            <div class="msg-avatar" v-if="msg.sender_id !== currentUserId">
              <img v-if="msg.sender_avatar" :src="msg.sender_avatar" class="avatar-img" />
              <div v-else class="avatar-fallback-sm">{{ (msg.sender_real_name || msg.sender_name || '?')[0] }}</div>
            </div>
            <div class="msg-body">
              <div class="msg-sender" v-if="msg.sender_id !== currentUserId && activeConversation.type === 'group'">
                {{ msg.sender_real_name || msg.sender_name }}
              </div>
              <div class="msg-bubble">
                <span>{{ msg.content }}</span>
              </div>
              <div class="msg-time">{{ formatMsgTime(msg.created_at) }}</div>
            </div>
          </template>
        </div>

        <!-- 对方正在输入 -->
        <div v-if="typingUser" class="typing-indicator">
          <span>{{ typingUser }} 正在输入...</span>
        </div>
      </div>

      <!-- 输入区域 -->
      <div class="input-area">
        <div class="input-row">
          <Field
            v-model="inputText"
            type="text"
            placeholder="输入消息..."
            @keydown.enter.exact.prevent="sendMessage"
            @input="handleTyping"
          />
          <Button
            class="send-btn"
            type="primary"
            size="small"
            :disabled="!inputText.trim()"
            @click="sendMessage"
          >
            发送
          </Button>
        </div>
      </div>
    </div>

    <!-- ==================== 联系人选择弹窗 ==================== -->
    <Popup v-model:show="showContacts" position="bottom" round :style="{ height: '70%' }">
      <div class="contacts-panel">
        <div class="contacts-header">
          <span class="contacts-title">选择联系人</span>
          <Icon name="cross" size="18" @click="showContacts = false" />
        </div>
        <Search v-model="contactSearch" placeholder="搜索用户" shape="round" />
        <div class="contacts-list">
          <div
            v-for="user in contacts"
            :key="user.id"
            class="contact-item"
            @click="startChatWith(user)"
          >
            <div class="contact-avatar">
              <img v-if="user.avatar" :src="user.avatar" class="avatar-img" />
              <div v-else class="avatar-fallback-sm">{{ (user.real_name || user.username || '?')[0] }}</div>
              <span v-if="user.online" class="online-dot"></span>
            </div>
            <div class="contact-info">
              <div class="contact-name">{{ user.real_name || user.username }}</div>
              <div class="contact-dept">{{ user.department_name || '' }}</div>
            </div>
          </div>
          <div v-if="contacts.length === 0" class="empty-contacts">
            <p>暂无联系人</p>
          </div>
        </div>
      </div>
    </Popup>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { NavBar, Icon, Search, Badge, Button, Field, Popup, Loading, showToast } from 'vant'
import { useAuthStore } from '@/stores/auth'
import { chatApi } from '@/services/api'
import { useSocket } from '@/composables/useSocket'
import dayjs from 'dayjs'

defineOptions({ name: 'Chat' })

const authStore = useAuthStore()
const { socket, isConnected } = useSocket()
const currentUserId = computed(() => authStore.user?.id)

// ==================== 会话列表 ====================
const conversations = ref([])
const searchKeyword = ref('')
const filteredConversations = computed(() => {
  if (!searchKeyword.value) return conversations.value
  const kw = searchKeyword.value.toLowerCase()
  return conversations.value.filter(c =>
    (c.display_name || c.name || '').toLowerCase().includes(kw)
  )
})

const loadConversations = async () => {
  try {
    const res = await chatApi.getConversations()
    conversations.value = res.data?.list || []
  } catch (e) {
    console.warn('加载会话列表失败:', e)
  }
}

// ==================== 聊天窗口 ====================
const activeConversation = ref(null)
const messages = ref([])
const inputText = ref('')
const loadingMessages = ref(false)
const messageAreaRef = ref(null)
const typingUser = ref(null)
let typingTimeout = null

const openConversation = async (conv) => {
  activeConversation.value = conv
  messages.value = []
  loadingMessages.value = true

  try {
    const res = await chatApi.getMessages(conv.id, { page: 1, pageSize: 50 })
    messages.value = res.data?.list || []
    // 清零前端未读计数
    conv.unread_count = 0
  } catch (e) {
    showToast('加载消息失败')
  } finally {
    loadingMessages.value = false
  }

  // 加入 Socket 房间
  socket?.emit('chat:join', conv.id)
  await nextTick()
  scrollToBottom()
}

const closeConversation = () => {
  if (activeConversation.value) {
    socket?.emit('chat:leave', activeConversation.value.id)
  }
  activeConversation.value = null
  loadConversations() // 刷新会话列表
}

const sendMessage = () => {
  const text = inputText.value.trim()
  if (!text || !activeConversation.value) return

  socket?.emit('chat:send', {
    conversationId: activeConversation.value.id,
    content: text,
    type: 'text',
  }, (response) => {
    if (response?.error) {
      showToast(response.error)
    }
  })

  inputText.value = ''
}

const handleTyping = () => {
  if (activeConversation.value) {
    socket?.emit('chat:typing', activeConversation.value.id)
  }
}

const scrollToBottom = () => {
  nextTick(() => {
    const area = messageAreaRef.value
    if (area) area.scrollTop = area.scrollHeight
  })
}

// ==================== 联系人 ====================
const showContacts = ref(false)
const contactSearch = ref('')
const contacts = ref([])

const loadContacts = async () => {
  try {
    const res = await chatApi.getContacts({ search: contactSearch.value })
    contacts.value = res.data?.list || []
  } catch (e) {
    console.warn('加载联系人失败:', e)
  }
}

const startChatWith = async (user) => {
  showContacts.value = false
  try {
    const res = await chatApi.createPrivateConversation(user.id)
    const convId = res.data?.conversationId
    if (convId) {
      await loadConversations()
      const conv = conversations.value.find(c => c.id === convId)
      if (conv) {
        openConversation(conv)
      } else {
        // 新会话，手动构建
        openConversation({
          id: convId,
          type: 'private',
          display_name: user.real_name || user.username,
          display_avatar: user.avatar,
          other_online: user.online,
          unread_count: 0,
        })
      }
    }
  } catch (e) {
    showToast('创建会话失败')
  }
}

watch(contactSearch, () => loadContacts())

// ==================== Socket 事件监听 ====================
onMounted(() => {
  loadConversations()
  loadContacts()

  // 接收新消息
  socket?.on('chat:message', (msg) => {
    if (activeConversation.value && msg.conversation_id === activeConversation.value.id) {
      // 去重
      if (!messages.value.some(m => m.id === msg.id)) {
        messages.value.push(msg)
        scrollToBottom()
      }
    }
  })

  // 会话列表有新消息通知
  socket?.on('chat:new-message', (data) => {
    const conv = conversations.value.find(c => c.id === data.conversationId)
    if (conv) {
      conv.last_message_preview = data.preview
      conv.last_message_at = new Date().toISOString()
      if (!activeConversation.value || activeConversation.value.id !== data.conversationId) {
        conv.unread_count = (conv.unread_count || 0) + 1
      }
    } else {
      // 新会话，刷新列表
      loadConversations()
    }
  })

  // 对方正在输入
  socket?.on('chat:typing', (data) => {
    if (activeConversation.value && data.userId !== currentUserId.value) {
      typingUser.value = data.userName
      clearTimeout(typingTimeout)
      typingTimeout = setTimeout(() => { typingUser.value = null }, 3000)
    }
  })

  // 用户在线状态
  socket?.on('user:online', (data) => {
    conversations.value.forEach(c => {
      if (c.type === 'private') {
        const other = c.members?.find(m => m.id === data.userId)
        if (other) c.other_online = data.online
      }
    })
  })
})

onBeforeUnmount(() => {
  if (activeConversation.value) {
    socket?.emit('chat:leave', activeConversation.value.id)
  }
  socket?.off('chat:message')
  socket?.off('chat:new-message')
  socket?.off('chat:typing')
  socket?.off('user:online')
  clearTimeout(typingTimeout)
})

// ==================== 工具函数 ====================
const formatTime = (ts) => {
  if (!ts) return ''
  const d = dayjs(ts)
  const now = dayjs()
  if (d.isSame(now, 'day')) return d.format('HH:mm')
  if (d.isSame(now.subtract(1, 'day'), 'day')) return '昨天'
  return d.format('MM/DD')
}

const formatMsgTime = (ts) => {
  if (!ts) return ''
  return dayjs(ts).format('HH:mm')
}
</script>

<style lang="scss" scoped>
.chat-page {
  min-height: 100vh;
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
}

// ==================== 连接状态栏 ====================
.connection-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 4px;
  background: var(--color-warning);
  color: #fff;
  font-size: 0.75rem;
}

// ==================== 会话列表 ====================
.search-box { padding: 8px 12px; }

.conversation-list {
  flex: 1;
  overflow-y: auto;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 60px 20px;
  color: var(--text-secondary);
}

.conversation-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light, rgba(255,255,255,0.06));
  cursor: pointer;
  transition: background 0.15s;
  &:active { background: var(--bg-secondary); }
}

.conv-avatar {
  position: relative;
  flex-shrink: 0;
  width: 44px;
  height: 44px;

  .avatar-img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }
  .avatar-fallback {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: var(--bg-tertiary, rgba(255,255,255,0.08));
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
  }
  .online-dot {
    position: absolute;
    bottom: 1px;
    right: 1px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #2CCFB0;
    border: 2px solid var(--bg-primary);
  }
}

.conv-info {
  flex: 1;
  min-width: 0;
}

.conv-top, .conv-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.conv-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conv-time {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.conv-preview {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 4px;
  flex: 1;
  min-width: 0;
}

// ==================== 聊天窗口 ====================
.chat-room-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.message-area {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  padding-bottom: 80px;
}

.loading-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}

.message-row {
  display: flex;
  margin-bottom: 16px;
  gap: 8px;

  &.is-self {
    flex-direction: row-reverse;
    .msg-bubble {
      background: var(--color-primary, #5E7BF6);
      color: #fff;
      border-radius: 16px 4px 16px 16px;
    }
    .msg-time {
      text-align: right;
    }
  }
  &.is-system {
    justify-content: center;
  }
}

.system-msg {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  background: var(--bg-secondary);
  padding: 4px 12px;
  border-radius: 99px;
}

.msg-avatar {
  flex-shrink: 0;
  width: 32px;
  height: 32px;

  .avatar-img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }
}

.avatar-fallback-sm {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--bg-tertiary, rgba(255,255,255,0.1));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.msg-body {
  max-width: 75%;
}

.msg-sender {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  margin-bottom: 2px;
}

.msg-bubble {
  background: var(--bg-secondary, rgba(255,255,255,0.08));
  color: var(--text-primary);
  padding: 8px 14px;
  border-radius: 4px 16px 16px 16px;
  font-size: 0.875rem;
  line-height: 1.5;
  word-break: break-word;
}

.msg-time {
  font-size: 0.6875rem;
  color: var(--text-tertiary);
  margin-top: 4px;
}

.typing-indicator {
  font-size: 0.75rem;
  color: var(--text-secondary);
  padding: 8px 0;
  font-style: italic;
}

// ==================== 输入区域 ====================
.input-area {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--bg-secondary, rgba(30,30,40,0.95));
  border-top: 1px solid var(--border-light, rgba(255,255,255,0.06));
  padding: 4px 10px;
  padding-bottom: max(4px, env(safe-area-inset-bottom));
}

.input-row {
  display: flex;
  align-items: center;
  gap: 8px;

  :deep(.van-field) {
    flex: 1;
    background: var(--bg-primary);
    border-radius: 16px;
    padding: 0 12px !important;
    min-height: auto;
    height: 32px;
    line-height: 32px;
  }
  :deep(.van-field__body) {
    height: 32px;
  }
  :deep(.van-field__control) {
    color: var(--text-primary);
    height: 32px;
    min-height: auto;
    line-height: 32px;
    font-size: 0.8125rem;
    padding: 0;
  }
  :deep(.van-cell) {
    padding: 0 12px !important;
  }
}

.send-btn {
  flex-shrink: 0;
  border-radius: 16px;
  height: 32px;
  min-width: 50px;
  font-size: 0.8125rem;
  padding: 0 14px;
}

// ==================== 联系人弹窗 ====================
.contacts-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
}

.contacts-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.contacts-list {
  flex: 1;
  overflow-y: auto;
}

.contact-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  cursor: pointer;
  &:active { background: var(--bg-secondary); }
}

.contact-avatar {
  position: relative;
  width: 40px;
  height: 40px;

  .avatar-img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }
  .online-dot {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #2CCFB0;
    border: 2px solid var(--bg-primary);
  }
}

.contact-info {
  flex: 1;
}

.contact-name {
  font-size: 0.9375rem;
  color: var(--text-primary);
  font-weight: 500;
}

.contact-dept {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  margin-top: 2px;
}

.empty-contacts {
  text-align: center;
  color: var(--text-secondary);
  padding: 40px;
}
</style>
