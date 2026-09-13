import { getCurrentScope, onScopeDispose, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index'
import { workflowApi } from '@/api/workflow'

function approvalErrorMessage(error) {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.error?.message ||
    error?.message ||
    '审批操作失败'
  )
}

export function useBusinessApproval({ businessType, onSuccess } = {}) {
  const approvalDialog = reactive({
    visible: false,
    loading: false,
    row: null,
    comment: '',
    instanceId: null,
    nodeId: null
  })
  let selection = 0
  let disposed = false
  const submittingNodes = new Set()
  const invalidateSelection = () => {
    selection += 1
    approvalDialog.instanceId = null
    approvalDialog.nodeId = null
    approvalDialog.loading = false
  }
  watch(() => approvalDialog.visible, (visible) => {
    if (!visible) invalidateSelection()
  }, { flush: 'sync' })
  if (getCurrentScope()) onScopeDispose(() => { disposed = true; invalidateSelection() })

  const openApprovalDialog = async (row) => {
    if (disposed || row?.id === undefined || row?.id === null) return
    const request = ++selection
    const isCurrent = () => !disposed && approvalDialog.visible && request === selection
    approvalDialog.row = row
    approvalDialog.comment = ''
    approvalDialog.instanceId = null
    approvalDialog.nodeId = null
    approvalDialog.loading = true
    approvalDialog.visible = true
    try {
      const res = await workflowApi.getByBusiness(businessType, row.id)
      if (!isCurrent()) return
      const instance = res.data || res
      if (!instance || !instance.id) {
        ElMessage.warning('未找到该单据的审批流程')
        approvalDialog.visible = false
        return
      }
      approvalDialog.instanceId = instance.id
      const currentNode = (instance.nodes || []).find(
        (node) => node.status === 'in_progress' && (node.nodeType === 'approval' || node.node_type === 'approval')
      )
      if (!currentNode) {
        ElMessage.warning('当前没有待审批的节点')
        approvalDialog.visible = false
        return
      }
      approvalDialog.nodeId = currentNode.id
    } catch (error) {
      if (!isCurrent()) return
      console.error('获取审批信息失败:', error)
      ElMessage.error('获取审批信息失败')
      approvalDialog.visible = false
    } finally {
      if (isCurrent()) approvalDialog.loading = false
    }
  }

  const handleApproval = async (action) => {
    if (disposed || !approvalDialog.visible || approvalDialog.loading) return
    if (!['approve', 'reject'].includes(action)) return
    if (!approvalDialog.instanceId || !approvalDialog.nodeId) {
      ElMessage.warning('当前没有待审批的节点')
      return
    }
    const { instanceId, nodeId, comment } = approvalDialog
    const nodeKey = `${instanceId}:${nodeId}`
    if (submittingNodes.has(nodeKey)) return
    submittingNodes.add(nodeKey)
    const request = selection
    const isCurrent = () => !disposed && approvalDialog.visible && request === selection
    approvalDialog.loading = true
    try {
      const res = await workflowApi.approveNode(instanceId, {
        node_id: nodeId,
        action,
        comment: comment || undefined
      })
      const result = res.data || res
      if (isCurrent() && action === 'approve') {
        if (result.generatedOrders?.length) {
          const orders = result.generatedOrders
          ElMessage.success(`审核通过！已自动生成 ${orders.length} 个采购订单`)
        } else {
          ElMessage.success('审核通过')
        }
      } else if (isCurrent()) {
        ElMessage.success('已驳回')
      }
      if (isCurrent()) approvalDialog.visible = false
      if (!disposed && typeof onSuccess === 'function') {
        try { await onSuccess(action, result) } catch {
          ElMessage.warning('审批已完成，列表刷新失败，请刷新页面')
        }
      }
    } catch (error) {
      if (!isCurrent()) return
      console.error('审批操作失败:', error)
      ElMessage.error(`审批操作失败: ${approvalErrorMessage(error)}`)
    } finally {
      submittingNodes.delete(nodeKey)
      if (isCurrent()) approvalDialog.loading = false
    }
  }

  return {
    approvalDialog,
    openApprovalDialog,
    handleApproval
  }
}
