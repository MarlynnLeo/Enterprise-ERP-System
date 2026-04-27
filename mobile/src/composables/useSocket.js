/**
 * useSocket.js
 * @description Socket.IO 连接管理 composable
 */

import { ref, onBeforeUnmount } from 'vue'
import { io } from 'socket.io-client'

let socket = null
const isConnected = ref(false)
const connectionError = ref(null)

/**
 * 初始化 / 获取 Socket 连接（全局单例）
 */
export function getSocket() {
  if (socket && socket.connected) return socket

  const token = sessionStorage.getItem('token')
  if (!token) return null

  // 通过 Vite proxy 或生产环境同域连接
  const baseUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin

  socket = io(baseUrl, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
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
