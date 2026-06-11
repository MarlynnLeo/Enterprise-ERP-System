/**
 * 即时通讯 API 模块
 */
import api from '../client'

export const chatApi = {
  // 获取会话列表
  getConversations() {
    return api.get('/chat/conversations')
  },
  // 创建/获取私聊会话
  createPrivateConversation(targetUserId) {
    return api.post('/chat/conversations/private', { targetUserId })
  },
  // 创建群聊
  createGroupConversation(name, memberIds) {
    return api.post('/chat/conversations/group', { name, memberIds })
  },
  // 获取会话消息历史
  getMessages(conversationId, params) {
    return api.get(`/chat/conversations/${conversationId}/messages`, { params })
  },
  // 获取联系人列表
  getContacts(params) {
    return api.get('/chat/contacts', { params })
  }
}
