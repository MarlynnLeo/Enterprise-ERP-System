// @vitest-environment node
import { createServer } from 'node:http'
import axios from 'axios'
import { expect, test } from 'vitest'
import { applyRequestOptimizer } from '../src/utils/requestOptimizer'
import { requestWithRetry } from '../src/utils/requestRetry'

test('a burst of readers shares recovery across real HTTP 502 responses', async () => {
  let requests = 0
  const server = createServer((_req, res) => {
    requests++
    res.writeHead(requests < 3 ? 502 : 200, { 'Content-Type': 'application/json' })
    res.end(requests < 3 ? '{}' : JSON.stringify({ warehouses: [{ id: 1 }] }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const client = axios.create({
      baseURL: `http://127.0.0.1:${server.address().port}`,
      adapter: 'http', proxy: false, timeout: 2000, retry: 2, retryDelay: 10
    })
    applyRequestOptimizer(client, axios, {
      executeAdapter: (adapter, config) => requestWithRetry(adapter, config, axios)
    })
    const responses = await Promise.all(Array.from({ length: 24 }, () => client.get('/inventory/locations')))
    expect(responses.every(response => response.status === 200)).toBe(true)
    expect(responses.every(response => response.data.warehouses[0].id === 1)).toBe(true)
    expect(requests).toBe(3)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})
