/**
 * useOrderActions.js
 * @description 销售订单操作逻辑的组合式函数（从 SalesOrders.vue 抽取）
 * 包含：确认、取消、发货、锁定、解锁、查看详情
 */
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { salesApi } from '@/api'
import { checkInventory } from '@/composables/useInventoryCheck'

export function useOrderActions(fetchDataCallback, tableData) {
  // 详情对话框控制
  const detailsVisible = ref(false)
  const detailsLoading = ref(false)
  const currentOrder = ref(null)

  // checkInventory 使用 @/composables/useInventoryCheck 公共实现

  // ========== 订单状态操作 ==========

  const handleConfirm = async (row) => {
    try {
      const orderResponse = await salesApi.getOrder(row.id)
      const orderDetail = orderResponse.data
      const orderItems = orderDetail.items || []
      if (orderItems.length === 0) {
        ElMessage.warning('订单没有物料明细，无法确认'); return
      }
      const insufficientItems = await checkInventory(orderItems)
      if (insufficientItems.length > 0) {
        const itemMessages = insufficientItems.map(item =>
          `${item.materialName || item.material_name || '未知物料'}: 需要${item.quantity}，库存${item.currentStock || 0}`)
        await ElMessageBox.confirm(
          `以下物料库存不足:\n${itemMessages.join('\n')}\n\n系统将自动生成生产计划和采购申请，是否继续确认订单?`,
          '库存不足警告', { confirmButtonText: '继续确认', cancelButtonText: '取消', type: 'warning' })
      }
      await salesApi.updateOrderStatus(row.id, { newStatus: 'confirmed' })
      ElMessage.success('订单已确认')
      if (fetchDataCallback) await fetchDataCallback()
    } catch (error) {
      if (error === 'cancel' || error.toString().includes('cancel')) return
      console.error('确认订单时出错:', error)
      let errorMessage = '确认订单失败'
      if (error.response?.data) {
        const errorData = error.response.data
        if (errorData.message) errorMessage = errorData.message
        else if (errorData.error) errorMessage = errorData.error
      } else if (error.message) {
        errorMessage = `确认订单失败: ${error.message}`
      }
      if (errorMessage.includes('\n')) {
        ElMessageBox.alert(errorMessage, '确认订单失败', { confirmButtonText: '知道了', type: 'error', dangerouslyUseHTMLString: false })
      } else {
        ElMessage.error(errorMessage)
      }
    }
  }

  const handleCancel = (row) => {
    let message = '确定要取消该订单吗？'
    if (row.status === 'in_production') message = '该订单正在生产中，确定要取消吗？'
    else if (row.status === 'confirmed') message = '该订单已确认，确定要取消吗？'
    ElMessageBox.confirm(message, '警告', {
      confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning'
    }).then(async () => {
      try {
        await salesApi.updateOrderStatus(row.id, { newStatus: 'cancelled' })
        ElMessage.success('订单已取消')
        if (fetchDataCallback) await fetchDataCallback()
      } catch (error) {
        console.error('取消订单时出错:', error)
        ElMessage.error('取消订单失败: ' + (error.message || '未知错误'))
      }
    }).catch(() => {})
  }

  const handleShip = async (row) => {
    try {
      await ElMessageBox.confirm(
        `确定要为订单 ${row.order_no} 创建出库单吗？将按订单数量全额发货。`,
        '确认发货', { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' })
      const orderDetail = await salesApi.getOrder(row.id)
      const orderData = orderDetail.data || orderDetail
      const items = orderData.items || []
      if (items.length === 0) { ElMessage.warning('订单没有物料明细，无法发货'); return }
      const outboundData = {
        order_id: row.id,
        delivery_date: new Date().toISOString().split('T')[0],
        status: 'draft',
        remarks: `从销售订单 ${row.order_no} 创建`,
        items: items.map(item => ({ product_id: item.material_id, quantity: item.quantity }))
      }
      await salesApi.createOutbound(outboundData)
      ElMessage.success('出库单创建成功')
      if (fetchDataCallback) fetchDataCallback()
    } catch (error) {
      if (error === 'cancel') return
      console.error('创建出库单失败:', error)
      let errorMsg = '网络错误或服务器异常'
      if (error.response?.data) {
        errorMsg = error.response.data.error || error.response.data.message || error.response.data.msg || errorMsg
      } else if (error.message) { errorMsg = error.message }
      if (error.response?.status === 409) {
        ElMessageBox.alert(errorMsg, '发货限制', { confirmButtonText: '我知道了', type: 'warning' })
      } else {
        ElMessage.error('创建出库单失败: ' + errorMsg)
      }
    }
  }

  // ========== 锁定/解锁 ==========

  const handleLock = async (row) => {
    try {
      await ElMessageBox.prompt('请输入锁定原因（可选）', '锁定订单', {
        confirmButtonText: '确定', cancelButtonText: '取消',
        inputPlaceholder: '锁定原因', inputValidator: () => true
      }).then(async ({ value }) => {
        const response = await salesApi.lockOrder(row.id, { lock_reason: value || '手动锁定' })
        if (response.data.partialSuccess) {
          const reservationDetails = response.data.reservations.map(item =>
            `${item.materialName}: 已预留${item.reservedQuantity}/${item.requiredQuantity}个`).join('\n')
          const insufficientDetails = response.data.insufficientItems.map(item =>
            `${item.materialName}: 缺少${item.shortage}个`).join('\n')
          ElMessageBox.alert(
            `订单已部分锁定：\n\n已预留库存：\n${reservationDetails}\n\n库存不足：\n${insufficientDetails}`,
            '部分锁定成功', { confirmButtonText: '确定', type: 'warning' })
        } else {
          ElMessage.success('订单锁定成功')
        }
        const orderIndex = tableData.value.findIndex(order => order.id === row.id)
        if (orderIndex !== -1) {
          tableData.value[orderIndex].is_locked = true
          tableData.value[orderIndex].locked_at = new Date().toISOString()
          tableData.value[orderIndex].locked_by = 1
        }
      })
    } catch (error) {
      if (error !== 'cancel') {
        console.error('锁定订单失败:', error)
        const errorData = error.response?.data
        const errorMessage = '锁定订单失败: ' + (errorData?.message || error.message || '未知错误')
        if (errorData?.insufficientItems && errorData.insufficientItems.length > 0) {
          const insufficientDetails = errorData.insufficientItems.map(item =>
            `${item.materialName}(${item.materialCode}): 需要${item.required}个，可用${item.available}个，缺少${item.shortage}个`).join('\n')
          ElMessageBox.alert(`库存不足，无法锁定订单：\n\n${insufficientDetails}`, '库存不足', { confirmButtonText: '确定', type: 'warning' })
        } else {
          ElMessage.error(errorMessage)
        }
      }
    }
  }

  const handleUnlock = async (row) => {
    try {
      await ElMessageBox.confirm('确定要解锁此订单吗？解锁后将释放预留的库存。', '解锁订单', {
        confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning'
      })
      await salesApi.unlockOrder(row.id)
      ElMessage.success('订单解锁成功')
      const orderIndex = tableData.value.findIndex(order => order.id === row.id)
      if (orderIndex !== -1) {
        tableData.value[orderIndex].is_locked = false
        tableData.value[orderIndex].locked_at = null
        tableData.value[orderIndex].locked_by = null
      }
    } catch (error) {
      if (error !== 'cancel') {
        console.error('解锁订单失败:', error)
        ElMessage.error('解锁订单失败: ' + (error.response?.data?.message || error.message || '未知错误'))
      }
    }
  }

  // ========== 查看详情 ==========

  const handleView = async (row) => {
    detailsVisible.value = true
    detailsLoading.value = true
    try {
      const response = await salesApi.getOrder(row.id)
      const orderData = response.data
      orderData.customer = orderData.customer || row.customer
      orderData.customer_name = orderData.customer_name || row.customer_name || row.customer
      orderData.deliveryDate = orderData.deliveryDate || row.deliveryDate || orderData.delivery_date
      orderData.address = orderData.address || row.address || orderData.delivery_address
      orderData.contact = orderData.contact || row.contact || orderData.contact_person
      orderData.phone = orderData.phone || row.phone || orderData.contact_phone
      if (orderData.items && Array.isArray(orderData.items)) {
        orderData.items = orderData.items.map(item => ({
          ...item,
          quantity: parseFloat(item.quantity) || 0,
          unit_price: parseFloat(item.unit_price) || 0,
          amount: parseFloat(item.amount) || 0,
          material_code: item.material_code || item.code || '',
          material_name: item.material_name || item.name || ''
        }))
      }
      currentOrder.value = orderData
    } catch (error) {
      console.error('获取订单详情失败:', error)
      ElMessage.error('获取订单详情失败: ' + (error.message || '未知错误'))
    } finally {
      detailsLoading.value = false
    }
  }

  // 状态判断函数
  const canConfirm = (row) => ['draft', 'pending'].includes(row.status)
  const canShip = (row) => ['ready_to_ship', 'partial_shipped'].includes(row.status) && !row.has_draft_outbound
  const canCancel = (row) => ['draft', 'pending', 'confirmed', 'in_production', 'ready_to_ship'].includes(row.status)
  const canLock = (row) => {
    const allowedStatuses = ['in_production', 'in_procurement']
    return !row.is_locked && allowedStatuses.includes(row.status)
  }
  const canUnlock = (row) => !!row.is_locked

  return {
    detailsVisible, detailsLoading, currentOrder,
    handleConfirm, handleCancel, handleShip,
    handleLock, handleUnlock, handleView,
    canConfirm, canShip, canCancel, canLock, canUnlock
  }
}
