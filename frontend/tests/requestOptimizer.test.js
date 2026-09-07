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
