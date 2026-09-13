import axios from 'axios'
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { applyRequestOptimizer, clearAllRequestCaches } from '@/utils/requestOptimizer'

const deferred = () => {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

const responseFor = (config, data) => ({ config, data, status: 200, statusText: 'OK', headers: {} })
const createClient = (adapter) => {
  const client = axios.create({ adapter })
  applyRequestOptimizer(client, axios, { defaultCacheTtl: 60000 })
  return client
}

afterEach(() => clearAllRequestCaches())

describe('request optimizer mutation consistency', () => {
  test('does not collide filter values with serialized parameter separators', async () => {
    const adapter = vi.fn(async config => responseFor(config, config.params))
    const client = createClient(adapter)
    await client.get('/inventory', { params: { search: 'bolt|status:approved' } })
    const filtered = await client.get('/inventory', { params: { search: 'bolt', status: 'approved' } })
    expect(adapter).toHaveBeenCalledTimes(2)
    expect(filtered.data).toEqual({ search: 'bolt', status: 'approved' })
  })

  test('does not reuse a cancelled request for a caller with its own signal', async () => {
    const gate = deferred()
    const adapter = vi.fn(async config => { await gate.promise; return responseFor(config, {ok:true}) })
    const client = createClient(adapter)
    const controller = new AbortController()
    const cancelled = client.get('/inventory', {signal:controller.signal}).catch(error=>error)
    await flushPromises()
    const current = client.get('/inventory', {signal:new AbortController().signal})
    await flushPromises()
    controller.abort()
    gate.resolve()
    await cancelled
    expect((await current).data).toEqual({ok:true})
    expect(adapter).toHaveBeenCalledTimes(2)
  })

  test('invalidates cached reads across API instances after a write', async () => {
    let quantity = 1
    const adapter = vi.fn(async (config) => responseFor(config, { quantity }))
    const reader = createClient(adapter)
    const writer = createClient(adapter)

    expect((await reader.get('/inventory')).data.quantity).toBe(1)
    quantity = 2
    await writer.post('/inventory', { quantity })

    expect((await reader.get('/inventory')).data.quantity).toBe(2)
    expect(adapter).toHaveBeenCalledTimes(3)
  })

  test('does not let a read started before a write overwrite the fresh cache', async () => {
    const oldRead = deferred()
    let readCount = 0
    const adapter = vi.fn(async (config) => {
      if (config.method === 'get' && ++readCount === 1) {
        await oldRead.promise
        return responseFor(config, { quantity: 1 })
      }
      return responseFor(config, { quantity: 2 })
    })
    const reader = createClient(adapter)
    const writer = createClient(adapter)

    const pendingOldRead = reader.get('/inventory')
    await flushPromises()
    await writer.post('/inventory', { quantity: 2 })
    expect((await reader.get('/inventory')).data.quantity).toBe(2)

    oldRead.resolve()
    expect((await pendingOldRead).data.quantity).toBe(1)
    expect((await reader.get('/inventory')).data.quantity).toBe(2)
    expect(readCount).toBe(2)
  })

  test('keeps a newer in-flight read deduplicated when an older read finishes', async () => {
    const oldRead = deferred()
    const freshRead = deferred()
    let readCount = 0
    const adapter = vi.fn(async (config) => {
      if (config.method !== 'get') return responseFor(config, {})
      const currentRead = ++readCount
      await (currentRead === 1 ? oldRead.promise : freshRead.promise)
      return responseFor(config, { quantity: currentRead === 1 ? 1 : 2 })
    })
    const reader = createClient(adapter)
    const writer = createClient(adapter)

    const pendingOldRead = reader.get('/inventory', { skipCache: true })
    await flushPromises()
    await writer.post('/inventory', { quantity: 2 })
    const pendingFreshRead = reader.get('/inventory', { skipCache: true })
    await flushPromises()
    oldRead.resolve()
    await pendingOldRead
    const pendingDuplicate = reader.get('/inventory', { skipCache: true })
    await flushPromises()
    freshRead.resolve()

    const responses = await Promise.all([pendingFreshRead, pendingDuplicate])
    expect(responses.map((response) => response.data.quantity)).toEqual([2, 2])
    expect(readCount).toBe(2)
  })

  test('returns independent cached data to each caller', async () => {
    const adapter = vi.fn(async (config) => responseFor(config, { items: [{ quantity: 1 }] }))
    const client = createClient(adapter)
    const first = await client.get('/inventory')
    first.data.items[0].quantity = 99
    const second = await client.get('/inventory')
    second.data.items[0].quantity = 88

    expect((await client.get('/inventory')).data.items[0].quantity).toBe(1)
    expect(adapter).toHaveBeenCalledTimes(1)
  })
})
