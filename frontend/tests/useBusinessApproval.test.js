import { effectScope } from 'vue'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { useBusinessApproval } from '@/composables/useBusinessApproval'
import { workflowApi } from '@/api/workflow'
import { ElMessage } from 'element-plus/es/components/message/index'

vi.mock('@/api/workflow', () => ({ workflowApi: { getByBusiness: vi.fn(), approveNode: vi.fn() } }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }))
const scopes = []
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const instance = (id) => ({ data: { id, nodes: [{ id: id + 1, status: 'in_progress', nodeType: 'approval' }] } })
const createApproval = (onSuccess = vi.fn()) => {
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(() => useBusinessApproval({ businessType: 'purchase_order', onSuccess }))
}
afterEach(() => scopes.splice(0).forEach(scope => scope.stop()))

describe('approval dialog document identity', () => {
  test('keeps the workflow bound to the last document selected', async () => {
    const first = deferred(), second = deferred()
    workflowApi.getByBusiness.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const approval = createApproval()
    const openingFirst = approval.openApprovalDialog({ id: 1 })
    const openingSecond = approval.openApprovalDialog({ id: 2 })
    second.resolve(instance(200))
    await openingSecond
    first.resolve(instance(100))
    await openingFirst
    expect(approval.approvalDialog).toMatchObject({ visible: true, row: { id: 2 }, instanceId: 200, nodeId: 201 })
    workflowApi.approveNode.mockResolvedValue({ data: {} })
    await approval.handleApproval('approve')
    expect(workflowApi.approveNode).toHaveBeenCalledWith(200, expect.objectContaining({ node_id: 201 }))
  })

  test('a failed old lookup cannot dismiss a newer approval', async () => {
    const first = deferred()
    workflowApi.getByBusiness.mockReturnValueOnce(first.promise).mockResolvedValueOnce(instance(200))
    const approval = createApproval()
    const openingFirst = approval.openApprovalDialog({ id: 1 })
    await approval.openApprovalDialog({ id: 2 })
    first.reject(new Error('old request failed'))
    await openingFirst
    expect(approval.approvalDialog.visible).toBe(true)
    expect(ElMessage.error).not.toHaveBeenCalled()
  })

  test('does not populate a closed or disposed dialog', async () => {
    const lookup = deferred()
    workflowApi.getByBusiness.mockReturnValueOnce(lookup.promise)
    const approval = createApproval()
    const opening = approval.openApprovalDialog({ id: 1 })
    approval.approvalDialog.visible = false
    await flushPromises()
    lookup.resolve(instance(100))
    await opening
    expect(approval.approvalDialog.instanceId).toBeNull()
  })

  test('submits each node once and does not close a different document on completion', async () => {
    workflowApi.getByBusiness.mockResolvedValueOnce(instance(100)).mockResolvedValueOnce(instance(200))
    const saving = deferred()
    workflowApi.approveNode.mockReturnValue(saving.promise)
    const onSuccess = vi.fn()
    const approval = createApproval(onSuccess)
    await approval.openApprovalDialog({ id: 1 })
    const firstSave = approval.handleApproval('approve')
    const duplicate = approval.handleApproval('approve')
    await approval.openApprovalDialog({ id: 2 })
    saving.resolve({ data: {} })
    await Promise.all([firstSave, duplicate])
    expect(workflowApi.approveNode).toHaveBeenCalledTimes(1)
    expect(approval.approvalDialog).toMatchObject({ visible: true, instanceId: 200, loading: false })
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })
})
