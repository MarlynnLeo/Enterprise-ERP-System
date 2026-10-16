import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { io } from 'socket.io-client'
import { ElNotification } from 'element-plus/es/components/notification/index'
import { useSocket } from '@/composables/useSocket'

vi.mock('socket.io-client', () => ({ io: vi.fn() }))
vi.mock('element-plus/es/components/notification/index', () => ({ ElNotification: vi.fn() }))

const wrappers = []
const clients = []
const consumer = (options) => {
  let connection
  const wrapper = mount(defineComponent({
    setup() { connection = useSocket(options); return () => null }
  }))
  wrappers.push(wrapper)
  return { wrapper, connection }
}

beforeEach(() => {
  clients.length = 0
  io.mockImplementation(() => {
    const listeners = new Map()
    const client = {
      connected: false,
      on: vi.fn((event, callback) => { listeners.set(event, callback) }),
      connect: vi.fn(),
      disconnect: vi.fn(),
      removeAllListeners: vi.fn(() => listeners.clear()),
      emit(event, data) {
        if (event === 'connect') client.connected = true
        if (event === 'disconnect') client.connected = false
        listeners.get(event)?.(data)
      }
    }
    clients.push(client)
    return client
  })
})

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
})

describe('shared notification socket lifecycle', () => {
  test('shares an in-flight connection and propagates connection state to every consumer', () => {
    const first = consumer()
    const second = consumer()
    first.connection.connect()
    second.connection.connect()
    expect(io).toHaveBeenCalledTimes(1)
    clients[0].emit('connect')
    expect(first.connection.connected.value).toBe(true)
    expect(second.connection.connected.value).toBe(true)
    clients[0].emit('disconnect', 'transport close')
    const third = consumer()
    third.connection.connect()
    expect(io).toHaveBeenCalledTimes(1)
    clients[0].emit('connect')
    expect(third.connection.connected.value).toBe(true)
  })

  test('connect and disconnect are idempotent without releasing another consumer', () => {
    const first = consumer()
    const second = consumer()
    first.connection.connect()
    first.connection.connect()
    second.connection.connect()
    first.connection.disconnect()
    first.connection.disconnect()
    first.wrapper.unmount()
    expect(clients[0].disconnect).not.toHaveBeenCalled()
    second.connection.disconnect()
    expect(clients[0].disconnect).toHaveBeenCalledTimes(1)
  })

  test('teardown closes an unfinished connection and removes callbacks before remount', () => {
    const oldCallback = vi.fn()
    const first = consumer({ onUnreadCountChange: oldCallback })
    first.connection.connect()
    first.wrapper.unmount()
    expect(clients[0].disconnect).toHaveBeenCalledTimes(1)
    clients[0].emit('notification:new', { title: 'late' })
    expect(ElNotification).not.toHaveBeenCalled()

    const callback = vi.fn()
    const second = consumer({ onUnreadCountChange: callback })
    second.connection.connect()
    expect(io).toHaveBeenCalledTimes(2)
    clients[1].emit('notification:new', { title: 'current' })
    expect(ElNotification).toHaveBeenCalledTimes(1)
    expect(oldCallback).not.toHaveBeenCalled()
    expect(callback).toHaveBeenCalledTimes(1)
  })
})
