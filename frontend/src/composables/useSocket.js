/**
 * useSocket.js
 * @description Socket.IO 客户端 composable，用于接收实时通知推送。
 *              复用后端 cookie-based 认证（accessToken HttpOnly Cookie）。
 *              监听 notification:new 事件，弹出 ElNotification 并刷新未读数。
 * @date 2026-06-22
 */

import { ref, onUnmounted } from 'vue'
import { io } from 'socket.io-client'
import { ElNotification } from 'element-plus'

// 全局单例（多个组件共享同一个连接）
let socketInstance = null
let connectionRefCount = 0

/**
 * 获取 Socket.IO 服务器地址
 * 开发环境通过 Vite proxy 转发 /socket.io → 后端
 * 生产环境使用同源
 */
function getSocketUrl() {
  return window.location.origin
}

/**
 * 创建或复用 Socket.IO 连接
 */
function getOrCreateSocket() {
  if (socketInstance?.connected || socketInstance?.connecting) {
    return socketInstance
  }

  const url = getSocketUrl()
  socketInstance = io(url, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    withCredentials: true, // 发送 HttpOnly cookie（accessToken）
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 3000,
    timeout: 10000,
    autoConnect: false,
  })

  return socketInstance
}

/**
 * Socket.IO composable
 * @param {Object} options
 * @param {Function} [options.onUnreadCountChange] - 未读数变化回调
 */
export function useSocket(options = {}) {
  const connected = ref(false)
  const { onUnreadCountChange } = options

  let socket = null

  /**
   * 连接 Socket.IO 服务器
   */
  function connect() {
    socket = getOrCreateSocket()
    connectionRefCount++

    if (socket.connected) {
      connected.value = true
      return
    }

    // 仅首次连接时注册全局事件（避免重复绑定）
    if (connectionRefCount === 1) {
      socket.on('connect', () => {
        connected.value = true
        console.log('[Socket] 已连接')
      })

      socket.on('disconnect', (reason) => {
        connected.value = false
        console.log('[Socket] 已断开:', reason)
      })

      socket.on('connect_error', (error) => {
        connected.value = false
        console.warn('[Socket] 连接失败:', error.message)
      })
    }

    // 注册通知事件监听
    socket.on('notification:new', handleNotification)

    socket.connect()
  }

  /**
   * 处理收到的实时通知
   */
  function handleNotification(data) {
    // 弹出 Element Plus 通知
    const typeMap = { 0: 'info', 1: 'warning', 2: 'error' }
    ElNotification({
      title: data.title || '新通知',
      message: data.content || '',
      type: typeMap[data.priority] || 'info',
      duration: 5000,
      position: 'top-right',
      onClick: () => {
        if (data.link) {
          // 使用 window.location 跳转（composable 外部无法直接用 router）
          const baseUrl = window.location.origin
          window.location.href = `${baseUrl}${data.link}`
        }
      },
    })

    // 通知未读数变化（触发 NotificationCenter 刷新）
    if (typeof onUnreadCountChange === 'function') {
      onUnreadCountChange()
    }
  }

  /**
   * 断开连接
   */
  function disconnect() {
    if (socket) {
      socket.off('notification:new', handleNotification)
      connectionRefCount = Math.max(0, connectionRefCount - 1)

      // 所有引用都释放后才真正断开
      if (connectionRefCount === 0 && socket.connected) {
        socket.disconnect()
        console.log('[Socket] 所有引用已释放，断开连接')
      }
    }
  }

  // 组件卸载时自动断开
  onUnmounted(() => {
    disconnect()
  })

  return {
    connected,
    connect,
    disconnect,
  }
}

export default useSocket
