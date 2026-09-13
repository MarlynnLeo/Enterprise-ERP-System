import { effectScope } from 'vue'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { usePagination } from '@/composables/usePagination'
import { showToast } from 'vant'

vi.mock('vant', () => ({ showToast: vi.fn() }))
const scopes = []
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const scoped = loader => { const scope = effectScope(); scopes.push(scope); return scope.run(() => usePagination(loader, {immediate:false, initPageSize:2})) }
const result = (ids, total = 5) => ({ data: { items: ids.map(id => ({id})), total } })
afterEach(() => scopes.splice(0).forEach(scope => scope.stop()))

describe('mobile pagination query ownership', () => {
  test('an old page cannot append to a newly refreshed filter', async () => {
    const oldPage = deferred(), newPage = deferred()
    const loader = vi.fn().mockReturnValueOnce(oldPage.promise).mockReturnValueOnce(newPage.promise)
    const state = scoped(loader)
    const oldRequest = state.onLoad({ search:'old' })
    const refreshing = state.onRefresh({ search:'new' })
    newPage.resolve(result(['new-1','new-2']))
    await refreshing
    oldPage.resolve(result(['old-1','old-2']))
    await oldRequest
    expect(state.list.value.map(row=>row.id)).toEqual(['new-1','new-2'])
    expect(state.page.value).toBe(2)
  })

  test('next page keeps the active filter and only requests the page once', async () => {
    const page = deferred()
    const loader = vi.fn().mockResolvedValueOnce(result([1,2])).mockReturnValue(page.promise)
    const state = scoped(loader)
    await state.onRefresh({search:'material',status:'approved'})
    const first = state.onLoad()
    const second = state.onLoad()
    expect(loader).toHaveBeenCalledTimes(2)
    expect(loader.mock.calls[1][0]).toMatchObject({page:2,search:'material',status:'approved'})
    page.resolve(result([3,4]))
    await Promise.all([first,second])
    expect(state.list.value.map(row=>row.id)).toEqual([1,2,3,4])
  })

  test('ignores stale errors and prevents state changes after disposal', async () => {
    const oldPage=deferred(),newPage=deferred()
    const loader=vi.fn().mockReturnValueOnce(oldPage.promise).mockReturnValueOnce(newPage.promise)
    const state=scoped(loader)
    const oldRequest=state.onLoad()
    const newRequest=state.onRefresh({status:'new'})
    oldPage.reject(new Error('old error'))
    await oldRequest
    expect(showToast).not.toHaveBeenCalled()
    expect(state.loading.value).toBe(true)
    scopes.at(-1).stop()
    newPage.resolve(result([1,2]))
    await newRequest
    expect(state.list.value).toEqual([])
  })
})
