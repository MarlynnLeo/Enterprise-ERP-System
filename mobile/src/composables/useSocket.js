/**
 * useSocket.js
 * @description Socket.IO 连接管理 composable
 * W-26: 添加 auth 参数和认证失败重连策略
 */

import { ref, onBeforeUnmount } from 'vue'
import { io } from 'socket.io-client'

let socket = null
const isConnected = ref(false)
const connectionError = ref(null)

/**
 * 获取当前用户信息用于 Socket 认证
 */
const getAuthPayload = () => {
  try {
    const userStr = localStorage.getItem('user') || sessionStorage.getItem('user')
    const user = userStr ? JSON.parse(userStr) : null
    return {
      userId: user?.id,
      username: user?.username
    }
  } catch {
    return {}
  }
}

/**
 * 初始化 / 获取 Socket 连接（全局单例）
 * W-26: 添加 auth 参数传递用户身份信息，认证由 httpOnly cookie 自动携带
 */
export function getSocket() {
  if (socket && socket.connected) return socket

  // 通过 Vite proxy 或生产环境同域连接
  const baseUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin

  socket = io(baseUrl, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
    // W-26: 携带用户身份信息用于服务端鉴权
    auth: getAuthPayload()
  })

  socket.on('connect', () => {
    isConnected.value = true
    connectionError.value = null
  })

  socket.on('disconnect', () => {
    isConnected.value = false
  })

  socket.on('connect_error', (err) => {
    connectionError.value = err.message
    isConnected.value = false

    // W-26: 认证失败时停止自动重连，避免无意义的重试
    if (err.message === 'authentication_error' || err.message === 'unauthorized') {
      console.warn('[socket] 认证失败，停止重连。请重新登录后再尝试连接。')
      socket.disconnect()
    }
  })

  return socket
}

/**
 * 断开 Socket 连接
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
    isConnected.value = false
  }
}

/**
 * Vue Composable — 在组件中使用 Socket
 */
export function useSocket() {
  const sock = getSocket()

  onBeforeUnmount(() => {
    // 组件卸载时不断开全局连接，只清理该组件的监听
  })

  return {
    socket: sock,
    isConnected,
    connectionError,
    getSocket,
    disconnectSocket,
  }
}
