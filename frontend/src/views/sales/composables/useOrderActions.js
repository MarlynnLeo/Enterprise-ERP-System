import { formatLocalDate } from '@/utils/format'
/**
 * useOrderActions.js
 * @description 销售订单操作逻辑的组合式函数（从 SalesOrders.vue 抽取）
 * 包含：确认、取消、发货、锁定、解锁、查看详情
 */
import { computed, ref, unref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { salesApi } from '@/api'
import { checkInventory } from '@/composables/useInventoryCheck'
import { clearAllRequestCaches } from '@/utils/requestOptimizer'
import { useListDetailNavigation } from '@/composables/useListDetailNavigation'

export function useOrderActions(fetchDataCallback, tableData) {
  // 详情对话框控制
  const detailsVisible = ref(false)
  const detailsLoading = ref(false)
  const currentOrder = ref(null)
  /** 当前正在操作的订单 id，用于按钮 loading，防止连点 */
  const actionLoadingId = ref(null)

  const getRows = () => {
    const data = unref(tableData)
    return Array.isArray(data) ? data : []
  }
  const {
    previousItem: previousViewOrder,
    nextItem: nextViewOrder,
    hasPrevious: hasPreviousViewOrder,
    hasNext: hasNextViewOrder,
    setCurrentItem: setCurrentViewOrder
  } = useListDetailNavigation(tableData)

  const patchRow = (id, patch) => {
    const rows = getRows()
    const target = rows.find((order) => Number(order.id) === Number(id))
    if (target) Object.assign(target, patch)
  }

  /** 写操作后强制刷新列表（跳过 GET 缓存 / in-flight 复用） */
  const refreshList = async () => {
    clearAllRequestCaches()
    if (typeof fetchDataCallback !== 'function') return
    try {
      await fetchDataCallback({}, true, { force: true })
    } catch {
      // 列表刷新失败不吞业务成功提示，但提示用户可手动刷新
      ElMessage.warning('操作已成功，列表刷新失败，请手动刷新页面')
    }
  }

  // ========== 订单状态操作 ==========

  const handleConfirm = async (row) => {
    if (actionLoadingId.value) return
    actionLoadingId.value = row.id
    try {
      const orderResponse = await salesApi.getOrder(row.id)
      const orderDetail = orderResponse.data
      const orderItems = orderDetail.items || []
      if (orderItems.length === 0) {
        ElMessage.warning('订单没有物料明细，无法确认')
        return
      }
      const insufficientItems = await checkInventory(orderItems)
      if (insufficientItems.length > 0) {
        const itemMessages = insufficientItems.map(
          (item) =>
            `${item.materialName || '未知物料'}: 需要${item.quantity}，库存${item.currentStock || 0}`
        )
        await ElMessageBox.confirm(
          `以下物料库存不足:\n${itemMessages.join('\n')}\n\n系统将自动生成生产计划和采购申请，是否继续确认订单?`,
          '库存不足警告',
          { confirmButtonText: '继续确认', cancelButtonText: '取消', type: 'warning' }
        )
      }
      await salesApi.updateOrderStatus(row.id, { newStatus: 'confirmed' })
      patchRow(row.id, { status: 'confirmed' })
      ElMessage.success('订单已确认')
      await refreshList()
    } catch (error) {
      if (error === 'cancel' || String(error).includes('cancel')) return
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
        ElMessageBox.alert(errorMessage, '确认订单失败', {
          confirmButtonText: '知道了',
          type: 'error',
          dangerouslyUseHTMLString: false,
        })
      } else {
        ElMessage.error(errorMessage)
      }
    } finally {
      actionLoadingId.value = null
    }
  }

  const handleCancel = (row) => {
    if (actionLoadingId.value) return
    let message = '确定要取消该订单吗？'
    if (row.status === 'in_production') message = '该订单正在生产中，确定要取消吗？'
    else if (row.status === 'confirmed') message = '该订单已确认，确定要取消吗？'
    ElMessageBox.confirm(message, '警告', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
      .then(async () => {
        actionLoadingId.value = row.id
        try {
          await salesApi.updateOrderStatus(row.id, { newStatus: 'cancelled' })
          patchRow(row.id, { status: 'cancelled' })
          ElMessage.success('订单已取消')
          await refreshList()
        } catch (error) {
          console.error('取消订单时出错:', error)
          ElMessage.error(
            '取消订单失败: ' + (error.response?.data?.message || error.message || '未知错误')
          )
        } finally {
          actionLoadingId.value = null
        }
      })
      .catch(() => {})
  }

  const handleShip = async (row) => {
    if (actionLoadingId.value) return
    actionLoadingId.value = row.id
    try {
      const orderDetail = await salesApi.getOrder(row.id)
      const orderData = orderDetail.data || orderDetail
      const items = orderData.items || []
      if (items.length === 0) {
        ElMessage.warning('订单没有物料明细，无法发货')
        return
      }
      const outboundData = {
        orderId: row.id,
        deliveryDate: formatLocalDate(new Date()),
        status: 'draft',
        remarks: `从销售订单 ${row.orderNo} 创建`,
        items: items.map((item) => ({ productId: item.materialId, quantity: item.quantity })),
      }
      await salesApi.createOutbound(outboundData)
      // 立即更新本地，让发货按钮即时消失，避免用户重复点击
      patchRow(row.id, { hasDraftOutbound: true })
      ElMessage.success('出库单创建成功')
      await refreshList()
    } catch (error) {
      if (error === 'cancel') return
      console.error('创建出库单失败:', error)
      let errorMsg = '网络错误或服务器异常'
      if (error.response?.data) {
        errorMsg =
          error.response.data.error ||
          error.response.data.message ||
          error.response.data.msg ||
          errorMsg
      } else if (error.message) {
        errorMsg = error.message
      }
      if (error.response?.status === 409) {
        ElMessageBox.alert(errorMsg, '发货限制', { confirmButtonText: '我知道了', type: 'warning' })
      } else {
        ElMessage.error('创建出库单失败: ' + errorMsg)
      }
    } finally {
      actionLoadingId.value = null
    }
  }

  // ========== 锁定/解锁 ==========

  const handleLock = async (row) => {
    if (actionLoadingId.value) return
    try {
      const { value } = await ElMessageBox.prompt('请输入锁定原因（可选）', '锁定订单', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputPlaceholder: '锁定原因',
        inputValidator: () => true,
      })
      actionLoadingId.value = row.id
      const response = await salesApi.lockOrder(row.id, { lockReason: value || '手动锁定' })
      const lockResult = response.data?.data || response.data || {}
      if (lockResult.partialSuccess) {
        const reservationDetails = (lockResult.reservations || [])
          .map((item) => `${item.materialName}: 已预留${item.reservedQuantity}/${item.requiredQuantity}个`)
          .join('\n')
        const insufficientDetails = (lockResult.insufficientItems || [])
          .map((item) => `${item.materialName}: 缺少${item.shortage}个`)
          .join('\n')
        ElMessageBox.alert(
          `订单已部分锁定：\n\n已预留库存：\n${reservationDetails}\n\n库存不足：\n${insufficientDetails}`,
          '部分锁定成功',
          { confirmButtonText: '确定', type: 'warning' }
        )
      } else {
        ElMessage.success('订单锁定成功')
      }
      patchRow(row.id, {
        isLocked: true,
        lockedAt: new Date().toISOString(),
      })
      await refreshList()
    } catch (error) {
      if (error === 'cancel' || error === 'close') return
      console.error('锁定订单失败:', error)
      const errorData = error.response?.data
      const errorMessage = '锁定订单失败: ' + (errorData?.message || error.message || '未知错误')
      if (errorData?.insufficientItems && errorData.insufficientItems.length > 0) {
        const insufficientDetails = errorData.insufficientItems
          .map(
            (item) =>
              `${item.materialName}(${item.materialCode}): 需要${item.required}个，可用${item.available}个，缺少${item.shortage}个`
          )
          .join('\n')
        ElMessageBox.alert(`库存不足，无法锁定订单：\n\n${insufficientDetails}`, '库存不足', {
          confirmButtonText: '确定',
          type: 'warning',
        })
      } else {
        ElMessage.error(errorMessage)
      }
    } finally {
      actionLoadingId.value = null
    }
  }

  const handleUnlock = async (row) => {
    if (actionLoadingId.value) return
    try {
      await ElMessageBox.confirm('确定要解锁此订单吗？解锁后将释放预留的库存。', '解锁订单', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      })
      actionLoadingId.value = row.id
      await salesApi.unlockOrder(row.id)
      ElMessage.success('订单解锁成功')
      patchRow(row.id, {
        isLocked: false,
        lockedAt: null,
        lockedBy: null,
      })
      await refreshList()
    } catch (error) {
      if (error === 'cancel' || error === 'close') return
      console.error('解锁订单失败:', error)
      ElMessage.error(
        '解锁订单失败: ' + (error.response?.data?.message || error.message || '未知错误')
      )
    } finally {
      actionLoadingId.value = null
    }
  }

  // ========== 查看详情 ==========

  const handleView = async (row) => {
    detailsVisible.value = true
    detailsLoading.value = true
    try {
      clearAllRequestCaches()
      const response = await salesApi.getOrder(row.id)
      const orderData = { ...(response?.data || response) }
      orderData.customer = orderData.customer || row.customer
      orderData.customerName = orderData.customerName || row.customerName || row.customer
      orderData.contractCode = orderData.contractCode || row.contractCode || ''
      orderData.deliveryDate = orderData.deliveryDate || row.deliveryDate
      orderData.address = orderData.address || row.address || ''
      orderData.contact = orderData.contact || orderData.contactPerson || row.contact || ''
      orderData.phone = orderData.phone || orderData.contactPhone || row.phone || ''
      if (orderData.items && Array.isArray(orderData.items)) {
        orderData.items = orderData.items.map((item) => {
          const materialCode = item.materialCode || item.productCode || item.code || ''
          const materialName = item.materialName || item.name || ''
          const unitPrice = parseFloat(item.unitPrice ?? item.price) || 0
          return {
            ...item,
            quantity: parseFloat(item.quantity) || 0,
            unitPrice,
            amount: parseFloat(item.amount) || 0,
            materialCode,
            materialName,
            specification: item.specification || item.productSpecs || item.specs || '',
          }
        })
      }
      currentOrder.value = orderData
      setCurrentViewOrder(row)
    } catch (error) {
      console.error('获取订单详情失败:', error)
      ElMessage.error('获取订单详情失败: ' + (error.message || '未知错误'))
    } finally {
      detailsLoading.value = false
    }
  }

  const handleViewPrevious = () => {
    if (previousViewOrder.value) handleView(previousViewOrder.value)
  }

  const handleViewNext = () => {
    if (nextViewOrder.value) handleView(nextViewOrder.value)
  }

  const orderViewNavigation = computed(() => ({
    hasPrevious: hasPreviousViewOrder.value,
    hasNext: hasNextViewOrder.value,
    loading: detailsLoading.value,
    previous: handleViewPrevious,
    next: handleViewNext
  }))

  // 状态判断函数
  const canConfirm = (row) => ['draft', 'pending'].includes(row.status)
  const canShip = (row) =>
    ['ready_to_ship', 'partial_shipped'].includes(row.status) && !row.hasDraftOutbound
  const canCancel = (row) =>
    [
      'draft',
      'pending',
      'confirmed',
      'in_production',
      'in_procurement',
      'ready_to_ship',
      'shortage',
      'partial_shipped',
    ].includes(row.status)
  const canLock = (row) => {
    const allowedStatuses = ['in_production', 'in_procurement']
    return !row.isLocked && allowedStatuses.includes(row.status)
  }
  const canUnlock = (row) => !!row.isLocked

  return {
    detailsVisible,
    detailsLoading,
    currentOrder,
    actionLoadingId,
    orderViewNavigation,
    handleConfirm,
    handleCancel,
    handleShip,
    handleLock,
    handleUnlock,
    handleView,
    canConfirm,
    canShip,
    canCancel,
    canLock,
    canUnlock,
  }
}
