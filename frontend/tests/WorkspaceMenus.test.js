import { afterEach, describe, expect, test, vi } from 'vitest'
import { effectScope, reactive } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { useWorkspaceMenus } from '../src/composables/useWorkspaceMenus'

const scopes = []
afterEach(() => scopes.splice(0).forEach((scope) => scope.stop()))

const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail })
  return { promise, resolve, reject }
}
const createHarness = ({ loaded = true } = {}) => {
  const auth = reactive({ user: { id: 1 }, isAuthenticated: true, permissionsLoaded: loaded, permissions: ['purchase:orders'] })
  const requests = []
  const loadMenus = vi.fn(() => {
    const request = deferred()
    requests.push(request)
    return request.promise
  })
  const permissionStore = reactive({
    menuTree: [{ path: '/previous-account' }],
    setMenuTree(menus) { this.menuTree = menus }
  })
  const onError = vi.fn()
  const scope = effectScope()
  scopes.push(scope)
  scope.run(() => useWorkspaceMenus({ auth, permissionStore, loadMenus, onError }))
  return { auth, permissionStore, requests, loadMenus, onError, scope }
}

describe('workspace menu lifecycle', () => {
  test('waits for authenticated permissions and clears menus while permissions reload', async () => {
    const state = createHarness({ loaded: false })
    expect(state.permissionStore.menuTree).toEqual([])
    expect(state.loadMenus).not.toHaveBeenCalled()
    state.auth.permissionsLoaded = true
    await flushPromises()
    state.requests[0].resolve([{ path: '/purchase/orders' }])
    await flushPromises()
    expect(state.permissionStore.menuTree).toEqual([{ path: '/purchase/orders' }])
    state.auth.permissionsLoaded = false
    await flushPromises()
    expect(state.permissionStore.menuTree).toEqual([])
    state.auth.permissions = ['inventory:stock']
    state.auth.permissionsLoaded = true
    await flushPromises()
    expect(state.loadMenus).toHaveBeenCalledTimes(2)
  })

  test('ignores an older account response arriving after the current account menus', async () => {
    const state = createHarness()
    state.auth.user = { id: 2 }
    await flushPromises()
    state.requests[1].resolve([{ path: '/inventory/stock' }])
    await flushPromises()
    state.requests[0].resolve([{ path: '/purchase/orders' }])
    await flushPromises()
    expect(state.permissionStore.menuTree).toEqual([{ path: '/inventory/stock' }])
  })

  test('reloads replaced permissions and ignores the previous request failure', async () => {
    const state = createHarness()
    state.auth.permissions = ['inventory:stock']
    await flushPromises()
    expect(state.loadMenus).toHaveBeenCalledTimes(2)
    state.requests[0].reject(new Error('Previous request failed'))
    state.requests[1].resolve([{ path: '/inventory/stock' }])
    await flushPromises()
    expect(state.onError).not.toHaveBeenCalled()
    expect(state.permissionStore.menuTree).toEqual([{ path: '/inventory/stock' }])
  })

  test('prevents logout and disposed layouts from accepting pending responses', async () => {
    const state = createHarness()
    state.auth.isAuthenticated = false
    state.auth.user = null
    await flushPromises()
    state.requests[0].resolve([{ path: '/purchase/orders' }])
    await flushPromises()
    expect(state.permissionStore.menuTree).toEqual([])

    state.auth.user = { id: 2 }
    state.auth.isAuthenticated = true
    await flushPromises()
    state.scope.stop()
    state.requests[1].resolve([{ path: '/inventory/stock' }])
    await flushPromises()
    expect(state.permissionStore.menuTree).toEqual([])
  })

  test('reports malformed current responses instead of silently showing an empty menu', async () => {
    const state = createHarness()
    state.requests[0].resolve({ unexpected: [] })
    await flushPromises()
    expect(state.onError).toHaveBeenCalledTimes(1)
    expect(state.permissionStore.menuTree).toEqual([])
  })
})
