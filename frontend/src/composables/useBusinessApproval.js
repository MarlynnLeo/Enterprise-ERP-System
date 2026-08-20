import { reactive } from 'vue'
import { ElMessage } from 'element-plus'
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

  const openApprovalDialog = async (row) => {
    approvalDialog.row = row
    approvalDialog.comment = ''
    approvalDialog.instanceId = null
    approvalDialog.nodeId = null
    approvalDialog.loading = true
    approvalDialog.visible = true
    try {
      const res = await workflowApi.getByBusiness(businessType, row.id)
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
      console.error('获取审批信息失败:', error)
      ElMessage.error('获取审批信息失败')
      approvalDialog.visible = false
    } finally {
      approvalDialog.loading = false
    }
  }

  const handleApproval = async (action) => {
    if (!approvalDialog.instanceId || !approvalDialog.nodeId) {
      ElMessage.warning('当前没有待审批的节点')
      return
    }
    approvalDialog.loading = true
    try {
      const res = await workflowApi.approveNode(approvalDialog.instanceId, {
        node_id: approvalDialog.nodeId,
        action,
        comment: approvalDialog.comment || undefined
      })
      const result = res.data || res
      if (action === 'approve') {
        if (result.generatedOrders?.length) {
          const orders = result.generatedOrders
          ElMessage.success(`审批通过！已自动生成 ${orders.length} 个采购订单`)
        } else {
          ElMessage.success('审批通过')
        }
      } else {
        ElMessage.success('已拒绝')
      }
      approvalDialog.visible = false
      if (typeof onSuccess === 'function') await onSuccess(action, result)
    } catch (error) {
      console.error('审批操作失败:', error)
      ElMessage.error(`审批操作失败: ${approvalErrorMessage(error)}`)
    } finally {
      approvalDialog.loading = false
    }
  }

  return {
    approvalDialog,
    openApprovalDialog,
    handleApproval
  }
}
