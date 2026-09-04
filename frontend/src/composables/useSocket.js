/**
 * useSocket.js
 * @description Socket.IO 客户端 composable，用于接收实时通知推送。
 *              复用后端 cookie-based 认证（accessToken HttpOnly Cookie）。
 *              监听 notification:new 事件，弹出 ElNotification 并刷新未读数。
 * @date 2026-06-22
 */

import { ref, onUnmounted } from 'vue'
import { io } from 'socket.io-client'
import { ElNotification } from 'element-plus/es/components/notification/index'

// 全局单例（多个组件共享同一个连接）
let socketInstance = null
let connectionRefCount = 0
let notificationListenerBound = false
/** @type {Set<Function>} 未读数刷新回调（多组件共享，避免重复绑定 notification:new） */
const unreadCountCallbacks = new Set()
const isDev = import.meta.env.DEV

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
 * 全局唯一的通知处理器，避免多次 connect 重复弹窗
 */
function handleNotification(data) {
  const typeMap = { 0: 'info', 1: 'warning', 2: 'error' }
  ElNotification({
    title: data.title || '新通知',
    message: data.content || '',
    type: typeMap[data.priority] || 'info',
    duration: 5000,
    position: 'top-right',
    onClick: () => {
      if (!data.link) return
      // 仅允许站内相对路径，防止开放重定向
      const link = String(data.link)
      if (link.startsWith('/') && !link.startsWith('//') && !link.includes('://')) {
        window.location.href = `${window.location.origin}${link}`
      }
    },
  })

  unreadCountCallbacks.forEach((cb) => {
    try {
      cb()
    } catch {
      // ignore callback errors
    }
  })
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
  let registeredCallback = null

  /**
   * 连接 Socket.IO 服务器
   */
  function connect() {
    socket = getOrCreateSocket()
    connectionRefCount++

    if (typeof onUnreadCountChange === 'function') {
      registeredCallback = onUnreadCountChange
      unreadCountCallbacks.add(onUnreadCountChange)
    }

    // 仅首次引用时绑定全局事件（避免 notification:new 重复绑定导致连弹）
    if (connectionRefCount === 1 || !notificationListenerBound) {
      if (!socket._erpCoreListenersBound) {
        socket.on('connect', () => {
          connected.value = true
          if (isDev) console.log('[Socket] 已连接')
        })

        socket.on('disconnect', (reason) => {
          connected.value = false
          if (isDev) console.log('[Socket] 已断开:', reason)
        })

        socket.on('connect_error', (error) => {
          connected.value = false
          if (isDev) console.warn('[Socket] 连接失败:', error.message)
        })
        socket._erpCoreListenersBound = true
      }

      if (!notificationListenerBound) {
        socket.on('notification:new', handleNotification)
        notificationListenerBound = true
      }
    }

    if (socket.connected) {
      connected.value = true
      return
    }

    socket.connect()
  }

  /**
   * 断开连接
   */
  function disconnect() {
    if (registeredCallback) {
      unreadCountCallbacks.delete(registeredCallback)
      registeredCallback = null
    }

    if (socket) {
      connectionRefCount = Math.max(0, connectionRefCount - 1)

      // 所有引用都释放后才真正断开
      if (connectionRefCount === 0) {
        if (notificationListenerBound) {
          socket.off('notification:new', handleNotification)
          notificationListenerBound = false
        }
        if (socket.connected) {
          socket.disconnect()
          if (isDev) console.log('[Socket] 所有引用已释放，断开连接')
        }
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
