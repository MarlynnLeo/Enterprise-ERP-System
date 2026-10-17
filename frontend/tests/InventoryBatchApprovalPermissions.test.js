import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { userApi } from '@/api/user'
import { useAuthStore } from '@/stores/auth'
import { permissionManager, tokenManager } from '@/utils/unifiedStorage'
import InventoryBatchApproval from '@/components/inventory/InventoryBatchApproval.vue'

const postings = vi.hoisted(() => ({ getBySource: vi.fn(), get: vi.fn(), batchApprove: vi.fn() }))
vi.mock('@/api/user', () => ({
  userApi: { login: vi.fn(), logout: vi.fn(), getProfileFast: vi.fn(), getPermissions: vi.fn(), updateProfile: vi.fn() },
}))
vi.mock('@/services/axiosInstance', () => ({ resetCsrfToken: vi.fn() }))
vi.mock('@/api/finance', () => ({ financeApi: { inventoryPostings: postings } }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { warning: vi.fn() } }))

const button = {
  props: ['loading', 'disabled'], emits: ['click'],
  template: '<button :disabled="loading || disabled" @click="$emit(\'click\')"><slot /></button>',
}
const dialog = {
  props: ['modelValue'], emits: ['update:modelValue'],
  template: '<section v-if="modelValue" role="dialog"><slot /><footer><slot name="footer" /></footer></section>',
}
const posting = {
  id: 101, postingNo: 'PST-101', sourceType: 'inbound', sourceId: 11, sourceNo: 'IN-11',
  postingKind: 'movement', financeStatus: 'pending', businessApprovedById: 2, businessApprovedBy: '业务甲',
  totalValue: 20, lines: [{ signedQuantity: 2, unitCost: 10, totalValue: 20 }],
}
const selectedRows = [{ id: 11, inboundNo: 'IN-11' }]
let auth
let wrapper

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  tokenManager.setUser({ id: 9, username: 'reviewer', realName: '审核乙', departmentName: '仓库部' })
  setActivePinia(createPinia())
  auth = useAuthStore()
  postings.getBySource.mockResolvedValue({ data: { movement: posting } })
  postings.get.mockResolvedValue({ data: posting })
  postings.batchApprove.mockResolvedValue({ data: { results: [{ id: 101, success: true }] } })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

const loadPermissions = async permissions => {
  userApi.getPermissions.mockResolvedValueOnce({ data: permissions })
  await auth.fetchUserPermissions()
}
const mountBatch = (rows = selectedRows) => {
  wrapper = mount(InventoryBatchApproval, {
    props: { selectedRows: rows, sourceType: 'inbound', sourceNoKey: 'inboundNo' },
    global: { stubs: {
      AppDialog: dialog, ElButton: button, ElTable: true, ElTableColumn: true, ElTag: true, ElAlert: true,
    } },
  })
}
const action = () => wrapper.findAll('button').find(item => item.text() === '批量财务审批')
const confirm = () => wrapper.findAll('button').find(item => item.text() === '确认通过 1 笔')

describe('batch approval with real server-loaded permission state', () => {
  test.each([
    ['business-only approval grants', ['inventory:inbound:view', 'inventory:inbound:approve', 'inventory:outbound:approve', 'purchase:receipts:approve', 'sales:outbound:approve']],
    ['generic finance view', ['finance:view']],
    ['inventory finance view only', ['finance:inventory:view']],
    ['inventory finance approval only', ['finance:inventory:approve']],
    ['system management wildcard', ['system:*']],
  ])('hides batch approval for %s even with selected rows', async (_label, permissions) => {
    await loadPermissions(permissions)
    mountBatch()
    expect(auth.permissionsLoaded).toBe(true)
    expect(action()).toBeUndefined()
    expect(postings.getBySource).not.toHaveBeenCalled()
    expect(postings.batchApprove).not.toHaveBeenCalled()
  })

  test('does not use cached super-administrator permissions before a fresh server response', async () => {
    permissionManager.setUserPermissions(['*'])
    setActivePinia(createPinia())
    auth = useAuthStore()
    mountBatch()
    expect(auth.permissions).toEqual(['*'])
    expect(auth.permissionsLoaded).toBe(false)
    expect(auth.isAdmin).toBe(false)
    expect(action()).toBeUndefined()

    let finish
    userApi.getPermissions.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    const loading = auth.fetchUserPermissions()
    await flushPromises()
    expect(action()).toBeUndefined()
    finish({ data: ['inventory:outbound:approve'] })
    await loading
    await flushPromises()
    expect(action()).toBeUndefined()
  })

  test('shows explicit finance view and approval grants only while rows are selected', async () => {
    await loadPermissions(['finance:inventory:view', 'finance:inventory:approve'])
    mountBatch([])
    expect(action()).toBeUndefined()
    await wrapper.setProps({ selectedRows })
    expect(action()).toBeDefined()
    expect(auth.isFinanceDepartment).toBe(false)
    await wrapper.setProps({ selectedRows: [] })
    expect(action()).toBeUndefined()
    expect(postings.getBySource).not.toHaveBeenCalled()
  })

  test.each([
    ['finance:inventory:*', false], ['finance:*', false], ['*', true],
  ])('honors the established %s permission without granting administrator status unnecessarily', async (permission, isAdmin) => {
    await loadPermissions([permission])
    mountBatch()
    expect(auth.canViewInventoryApproval).toBe(true)
    expect(auth.canApproveInventoryApproval).toBe(true)
    expect(auth.isAdmin).toBe(isAdmin)
    expect(action()).toBeDefined()
  })

  test('does not infer financial authority from the department or administrator display name', async () => {
    auth.user = { id: 9, username: 'admin', roleCode: 'system_admin', roleName: '管理员', departmentName: '财务部' }
    await loadPermissions(['system:users:view'])
    mountBatch()
    expect(auth.isFinanceDepartment).toBe(true)
    expect(auth.isAdmin).toBe(false)
    expect(action()).toBeUndefined()
  })

  test('revokes the ready preview as soon as a permissions refresh starts and cannot submit its old confirmation', async () => {
    await loadPermissions(['finance:inventory:view', 'finance:inventory:approve'])
    mountBatch()
    await action().trigger('click')
    await flushPromises()
    const oldConfirmation = confirm()
    expect(oldConfirmation).toBeDefined()

    let finish
    userApi.getPermissions.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    const refresh = auth.fetchUserPermissions(true)
    expect(auth.canViewInventoryApproval).toBe(false)
    expect(auth.canApproveInventoryApproval).toBe(false)
    await oldConfirmation.trigger('click')
    await flushPromises()
    expect(action()).toBeUndefined()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(postings.batchApprove).not.toHaveBeenCalled()

    finish({ data: ['finance:inventory:view'] })
    await refresh
    await flushPromises()
    expect(action()).toBeUndefined()
    await oldConfirmation.trigger('click')
    expect(postings.batchApprove).not.toHaveBeenCalled()
  })
})
