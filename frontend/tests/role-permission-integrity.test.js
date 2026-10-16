import fs from 'node:fs'
import vm from 'node:vm'
import { describe, expect, test, vi } from 'vitest'

const source = fs.readFileSync('src/views/system/Permissions.vue', 'utf8')
const closure = name => source.match(new RegExp(`const ${name} = (?:async )?\\([^\\n]*\\) => \\{[\\s\\S]*?\\n\\};`))[0]
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const prepare = () => {
  const selectedMenuIds = { value: [] }
  const context = {
    currentRole: { value: { id: 7, name: '财务审核' } }, rolePermissionRequestId: 0,
    permissionSaveLoading: { value: false }, permissionDialogVisible: { value: false },
    selectedMenuIds, halfCheckedMenuIds: { value: [] },
    permissionTreeRef: { value: { setCheckedKeys: vi.fn(), getCheckedKeys: () => selectedMenuIds.value,
      getHalfCheckedKeys: () => [], getNode: id => ({ data: { name: `菜单 ${id}` } }) } },
    menuList: { value: [{ id: 11 }] }, menuTree: { value: [{ id: 11 }] },
    treeRenderFlag: { value: false }, treeKey: { value: 0 },
    systemApi: { getRolePermissions: vi.fn(), updateRolePermissions: vi.fn().mockResolvedValue({}) },
    ElLoading: { service: () => ({ close() {} }) },
    ElMessage: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn() }),
    ElMessageBox: { confirm: vi.fn().mockResolvedValue(true) },
    h: (_tag, props, children) => ({ children: children || props }),
    getApiErrorMessage: error => error.message, console: { error() {} },
    ensureNumericIds: ids => ids.map(Number), filterLeafNodes: ids => ids,
    getRolePermissionBaseline: () => [], setRolePermissionBaseline: vi.fn(),
    calculateTreeState: ids => ({ checkedIds: ids, halfCheckedIds: [] }),
    useAuthStore: () => ({ fetchUserProfile: vi.fn(), fetchUserPermissions: vi.fn() }),
    loadRoles: vi.fn(), loadMenus: vi.fn(), nextTick: () => Promise.resolve(),
    expandAll: vi.fn(), forceApplyCheckedState: vi.fn()
  }
  vm.runInNewContext(['handleRolePermission', 'saveRolePermission', 'submitRolePermissions', 'onPermissionDialogOpened']
    .map(name => `${closure(name)}\nthis.${name} = ${name};`).join('\n'), context)
  return context
}

describe('role permission assignment integrity', () => {
  test('a slower prior role cannot replace the selected role permissions', async () => {
    const ctx = prepare(), old = deferred()
    ctx.systemApi.getRolePermissions.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ data: [22] })
    const first = ctx.handleRolePermission({ id: 1, name: 'Old' })
    await ctx.handleRolePermission({ id: 2, name: 'New' })
    old.resolve({ data: [11] })
    await first
    expect(ctx.currentRole.value.id).toBe(2)
    expect(ctx.selectedMenuIds.value).toEqual([22])
  })

  test('opening the dialog preserves checkedKeys responses and does not fetch over edits', async () => {
    const ctx = prepare()
    ctx.systemApi.getRolePermissions.mockResolvedValue({ data: { checkedKeys: [11], halfCheckedKeys: [2] } })
    await ctx.handleRolePermission({ id: 7, name: '财务审核' })
    await ctx.onPermissionDialogOpened()
    expect(ctx.selectedMenuIds.value).toEqual([11])
    expect(ctx.halfCheckedMenuIds.value).toEqual([2])
    expect(ctx.systemApi.getRolePermissions).toHaveBeenCalledTimes(1)
  })

  test('clearing permissions sends an empty list instead of granting hard-coded menu 1', async () => {
    const ctx = prepare()
    await ctx.saveRolePermission()
    await vi.waitFor(() => expect(ctx.systemApi.updateRolePermissions).toHaveBeenCalledOnce())
    expect(ctx.systemApi.updateRolePermissions).toHaveBeenCalledWith(7, expect.objectContaining({ menuIds: [] }))
  })

  test('confirmation keeps its original role and duplicate clicks cannot launch a second write', async () => {
    const ctx = prepare(), confirmation = deferred()
    ctx.selectedMenuIds.value = [11]
    ctx.ElMessageBox.confirm.mockReturnValueOnce(confirmation.promise)
    await ctx.saveRolePermission()
    await ctx.saveRolePermission()
    expect(ctx.ElMessageBox.confirm).toHaveBeenCalledOnce()
    ctx.currentRole.value = { id: 99, name: 'Changed' }
    confirmation.resolve(true)
    await vi.waitFor(() => expect(ctx.systemApi.updateRolePermissions).toHaveBeenCalledOnce())
    expect(ctx.systemApi.updateRolePermissions.mock.calls[0][0]).toBe(7)
  })
})
