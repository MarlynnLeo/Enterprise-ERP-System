import { effectScope, ref } from 'vue'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { usePaginatedFetching, useFormSubmit } from '@/composables/useDataFetching'
import { ElMessage } from 'element-plus/es/components/message/index'

vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }))
const scopes = []
const scoped = factory => { const scope = effectScope(); scopes.push(scope); return scope.run(factory) }
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const result = id => ({ data: { items: [{ id }], total: 1 } })
afterEach(() => scopes.splice(0).forEach(scope => scope.stop()))

describe('paginated read lifecycle', () => {
  test('evaluates current filters even while the same page is loading', async () => {
    const filter = ref('old'), oldRead = deferred(), newRead = deferred()
    const loader = vi.fn(() => filter.value === 'old' ? oldRead.promise : newRead.promise)
    const state = scoped(() => usePaginatedFetching(loader))
    const oldRequest = state.fetchData()
    filter.value = 'new'
    const newRequest = state.fetchData()
    expect(loader).toHaveBeenCalledTimes(2)
    newRead.resolve(result('new'))
    await newRequest
    oldRead.resolve(result('old'))
    await oldRequest
    expect(state.data.value).toEqual([{ id: 'new' }])
  })

  test('ignores errors and loading cleanup from an obsolete request', async () => {
    const oldRead = deferred(), newRead = deferred()
    const loader = vi.fn().mockReturnValueOnce(oldRead.promise).mockReturnValueOnce(newRead.promise)
    const state = scoped(() => usePaginatedFetching(loader))
    const oldRequest = state.fetchData({ status: 'old' }).catch(() => {})
    const newRequest = state.fetchData({ status: 'new' })
    oldRead.reject(new Error('old failure'))
    await oldRequest
    expect(state.loading.value).toBe(true)
    expect(state.error.value).toBeNull()
    expect(ElMessage.error).not.toHaveBeenCalled()
    newRead.resolve(result('new'))
    await newRequest
  })

  test('does not apply results after the owning page is disposed', async () => {
    const response = deferred()
    const scope = effectScope()
    const state = scope.run(() => usePaginatedFetching(() => response.promise))
    const request = state.fetchData()
    scope.stop()
    response.resolve(result('late'))
    await request
    expect(state.data.value).toEqual([])
  })
})

test('a repeated submit while saving does not create a second business document', async () => {
  const saved = deferred()
  const write = vi.fn(() => saved.promise)
  const onSuccess = vi.fn()
  const form = scoped(() => useFormSubmit(write, { onSuccess }))
  const first = form.submit({ quantity: 1 })
  const second = form.submit({ quantity: 1 })
  expect(write).toHaveBeenCalledTimes(1)
  saved.resolve({ id: 1 })
  await Promise.all([first, second])
  expect(onSuccess).toHaveBeenCalledTimes(1)
})
