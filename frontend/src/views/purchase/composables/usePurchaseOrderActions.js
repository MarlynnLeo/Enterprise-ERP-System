/**
 * usePurchaseOrderActions.js
 * @description 采购订单操作逻辑的组合式函数（从 PurchaseOrders.vue 抽取）
 * 包含：状态更新、到货、收货、详情查看、打印、删除、批量操作
 */
import { ref, reactive, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { purchaseApi } from '@/api'
import printService from '@/services/printService'
import {
  PURCHASE_STATUS_ACTION_TEXT,
  getPurchaseStatusColor,
  getPurchaseStatusLabel,
  getPurchaseStatusText,
  isValidStatusTransition
} from '@/constants/systemConstants'
import { formatDate } from '@/utils/helpers/dateUtils'
import { formatCurrency } from '@/utils/format'
import { parseResponseData } from '@/utils/responseParser'

export function usePurchaseOrderActions(loadOrdersCallback, orderList) {
  const isBlankAmount = (value) => value === null || value === undefined || value === ''
  const toNumberOrNull = (value) => {
    if (isBlankAmount(value)) return null
    const number = Number(value)
    return Number.isNaN(number) ? null : number
  }
  const formatPlainAmount = (value) => {
    if (isBlankAmount(value)) return '-'
    const number = Number(value)
    return Number.isNaN(number) ? '-' : number.toFixed(2)
  }

  // 详情对话框
  const detailLoading = ref(false)
  const viewDialogVisible = ref(false)
  const viewData = reactive({
    id: null, order_number: '', order_date: '', expected_delivery_date: '',
    supplier_id: '', supplier_name: '', contact_person: '', contact_phone: '',
    remarks: '', status: '', total_amount: null, requisition_id: null, requisition_number: '', items: []
  })

  // 到货对话框
  const receiveDialogVisible = ref(false)
  const receiveDialogLoading = ref(false)
  const receiveForm = reactive({ order_id: null, order_no: '', items: [] })
  const receiveTableRef = ref(null)
  const totalReceiveQuantity = computed(() => receiveForm.items.reduce((sum, item) => sum + parseFloat(item.receive_quantity || 0), 0))

  const unwrapBusinessData = (response) => parseResponseData(response, {})

  const getRequestErrorMessage = (error, fallback = '操作失败') => {
    const data = error?.response?.data
    return data?.message || data?.error?.message || data?.error || error?.message || fallback
  }

  // 申请单详情
  const requisitionViewDialog = reactive({ visible: false, loading: false })
  const requisitionViewData = reactive({
    id: null, requisition_number: '', request_date: '', requester: '', real_name: '',
    status: '', remarks: '', created_at: '', updated_at: '', materials: []
  })

  // 批量操作
  const orderTableRef = ref(null)
  const selectedOrders = ref([])
  const batchLoading = ref(false)
  const canBatchSubmit = computed(() => { if (selectedOrders.value.length === 0) return false; return selectedOrders.value.every(order => order.status === 'draft') })

  // 统计数据
  const orderStats = ref({ total: 0, totalAmount: 0, pendingCount: 0, approvedCount: 0, completedCount: 0 })

  // 格式化（formatDate/formatCurrency 已统一使用公共实现）
  const getStatusText = (status) => getPurchaseStatusText(status)
  const getStatusType = (status) => getPurchaseStatusColor(status)

  const getCountdownText = (deliveryDate, status) => {
    if (status === 'completed') return '已完成'
    if (status === 'cancelled') return '已取消'
    if (!deliveryDate) return '未设置'
    const today = new Date(); const delivery = new Date(deliveryDate)
    today.setHours(0, 0, 0, 0); delivery.setHours(0, 0, 0, 0)
    const diffDays = Math.ceil((delivery - today) / (1000 * 60 * 60 * 24))
    if (diffDays < 0) return `已逾期${Math.abs(diffDays)}天`
    if (diffDays === 0) return '今天到货'
    if (diffDays === 1) return '明天到货'
    return `还有${diffDays}天`
  }

  const getCountdownType = (deliveryDate, status) => {
    if (status === 'completed') return 'success'
    if (status === 'cancelled') return 'info'
    if (!deliveryDate) return 'info'
    const today = new Date(); const delivery = new Date(deliveryDate)
    today.setHours(0, 0, 0, 0); delivery.setHours(0, 0, 0, 0)
    const diffDays = Math.ceil((delivery - today) / (1000 * 60 * 60 * 24))
    if (diffDays < 0) return 'danger'
    if (diffDays <= 3) return 'warning'
    return 'success'
  }

  // ========== 查看详情 ==========
  const fixItemsStructure = (items) => {
    if (!Array.isArray(items) || items.length === 0) return []
    return items.map(item => {
      const quantity = toNumberOrNull(item.quantity) ?? 0
      const price = toNumberOrNull(item.price ?? item.unit_price)
      const explicitTotal = toNumberOrNull(item.total_price ?? item.totalPrice ?? item.amount)
      const totalPrice = explicitTotal ?? (price === null ? null : quantity * price)
      return {
        material_id: item.material_id || item.materialId || item.id || '',
        material_code: item.material_code || item.materialCode || item.code || '',
        material_name: item.material_name || item.materialName || item.name || '',
        specification: item.specification || '', unit: item.unit || item.unitName || item.unit_name || '',
        quantity, price,
        total_price: totalPrice,
        tax_rate: toNumberOrNull(item.tax_rate) ?? 0,
        tax_amount: toNumberOrNull(item.tax_amount),
        received_quantity: toNumberOrNull(item.received_quantity) ?? 0,
        warehoused_quantity: toNumberOrNull(item.warehoused_quantity) ?? 0,
        received_percentage: toNumberOrNull(item.received_percentage) ?? 0,
        warehoused_percentage: toNumberOrNull(item.warehoused_percentage) ?? 0,
        pending_quantity: toNumberOrNull(item.pending_quantity) ?? 0
      }
    })
  }

  const viewOrder = async (id) => {
    detailLoading.value = true; viewDialogVisible.value = true
    try {
      const response = await purchaseApi.getOrder(id)
      Object.keys(viewData).forEach(key => { if (key !== 'items') viewData[key] = ''; else viewData[key] = [] })
      if (response) {
        const data = parseResponseData(response)
        let items = data.items || data.orderItems || data.materialItems || []
        items = fixItemsStructure(items)
        Object.assign(viewData, {
          id: data.id, order_number: data.order_no || data.orderNo || '',
          order_date: formatDate(data.order_date || data.orderDate || ''),
          expected_delivery_date: formatDate(data.expected_delivery_date || data.expectedDeliveryDate || ''),
          supplier_id: data.supplier_id || data.supplierId || '', supplier_name: data.supplier_name || data.supplierName || '',
          contact_person: data.contact_person || data.contactPerson || '', contact_phone: data.contact_phone || data.contactPhone || '',
          notes: data.notes || data.remarks || '', status: data.status || '',
          total_amount: data.total_amount ?? data.totalAmount ?? null,
          requisition_id: data.requisition_id || data.requisitionId || null,
          requisition_number: data.requisition_number || data.requisitionNumber || '', items
        })
      } else { ElMessage.warning('获取不到订单详情') }
    } catch (error) { console.error('获取采购订单详情失败:', error); ElMessage.error('获取采购订单详情失败: ' + (error.message || '未知错误')) }
    finally { detailLoading.value = false }
  }

  const viewRequisition = async (requisitionId) => {
    try {
      requisitionViewDialog.loading = true; requisitionViewDialog.visible = true
      const response = await purchaseApi.getOrderRequisition(requisitionId)
      Object.assign(requisitionViewData, response.data)
    } catch (error) { console.error('获取采购申请详情失败:', error); ElMessage.error('获取采购申请详情失败') }
    finally { requisitionViewDialog.loading = false }
  }

  // ========== 状态操作 ==========
  const updateStatus = async (id, status) => {
    try {
      const orderRes = await purchaseApi.getOrder(id)
      if (!orderRes || !orderRes.data) { ElMessage.error('获取订单信息失败，无法更新状态'); return }
      const currentStatus = orderRes.data.status
      if (currentStatus === status) { ElMessage.info(`订单当前已经是"${getPurchaseStatusLabel(status)}"状态`); return }
      if (!isValidStatusTransition(currentStatus, status)) { ElMessage.error(`无法将订单从"${getPurchaseStatusLabel(currentStatus)}"状态转换为"${getPurchaseStatusLabel(status)}"状态`); return }
      await ElMessageBox.confirm(`确定要${PURCHASE_STATUS_ACTION_TEXT[status] || '更新'}此采购订单吗？`, '提示', { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' })
      await purchaseApi.updateOrderStatus(id, status)
      ElMessage.success(`订单已${PURCHASE_STATUS_ACTION_TEXT[status] || '更新'}`)
      if (loadOrdersCallback) await loadOrdersCallback()
    } catch (error) {
      if (error === 'cancel') return
      console.error('更新订单状态失败:', error)
      if (error.response && error.response.data) {
        const errorData = error.response.data
        if (errorData.error === '当前已经是该状态') ElMessage.info(`订单当前已经是"${getPurchaseStatusLabel(status)}"状态`)
        else if (errorData.message) ElMessage.error(`更新失败: ${errorData.message}`)
        else if (errorData.error?.message) ElMessage.error(`更新失败: ${errorData.error.message}`)
        else if (errorData.error) ElMessage.error(`更新失败: ${errorData.error}`)
        else ElMessage.error('更新失败: 服务器返回未知错误')
      } else { ElMessage.error(error.message || '操作失败') }
    } finally { if (loadOrdersCallback) loadOrdersCallback() }
  }

  const deleteOrder = async (id) => {
    try { await purchaseApi.deleteOrder(id); ElMessage.success('删除成功'); if (loadOrdersCallback) loadOrdersCallback() }
    catch (error) { console.error('删除订单失败:', error); ElMessage.error('删除订单失败: ' + (error.message || '未知错误')) }
  }

  // ========== 到货操作 ==========
  const openReceiveDialog = async (order) => {
    try {
      receiveDialogLoading.value = true; receiveDialogVisible.value = true
      const orderRes = await purchaseApi.getOrder(order.id)
      if (!orderRes || !orderRes.data) { ElMessage.error('获取订单信息失败'); receiveDialogVisible.value = false; return }
      const orderData = parseResponseData(orderRes)
      receiveForm.order_id = orderData.id; receiveForm.order_no = orderData.order_number || orderData.order_no
      receiveForm.supplier_id = orderData.supplier_id; receiveForm.supplier_code = orderData.supplier_code
      receiveForm.supplier_name = orderData.supplier_name
      const items = orderData.items || []
      receiveForm.items = items.map(item => {
        const pendingQty = parseFloat(item.quantity || 0) - parseFloat(item.received_quantity || 0)
        return { ...item, receive_quantity: pendingQty > 0 ? pendingQty : 0, pending_quantity: pendingQty }
      })
      const hasPendingItems = receiveForm.items.some(item => parseFloat(item.pending_quantity || 0) > 0)
      if (!hasPendingItems) { ElMessage.info('该订单所有物料已全部收货完成'); receiveDialogVisible.value = false }
    } catch (error) { console.error('打开到货对话框失败:', error); ElMessage.error('打开到货对话框失败: ' + (error.message || '未知错误')); receiveDialogVisible.value = false }
    finally { receiveDialogLoading.value = false }
  }

  const handleReceiveQuantityChange = (row) => {
    let qty = parseFloat(row.receive_quantity); if (isNaN(qty) || qty < 0) qty = 0
    const maxQty = parseFloat(row.quantity || 0) - parseFloat(row.received_quantity || 0)
    if (qty > maxQty) { qty = maxQty; ElMessage.warning(`到货数量不能超过待收货数量 ${maxQty.toFixed(2)}`) }
    row.receive_quantity = qty.toFixed(2)
  }

  const confirmReceive = async () => {
    try {
      const receivingItems = receiveForm.items.filter(item => parseFloat(item.receive_quantity || 0) > 0)
      if (receivingItems.length === 0) { ElMessage.warning('请至少选择一个物料并填写到货数量'); return }
      receiveDialogLoading.value = true
      const result = unwrapBusinessData(await purchaseApi.receiveOrderWithInspection(receiveForm.order_id, receivingItems))
      const allReceived = receiveForm.items.every(item => { const totalReceived = parseFloat(item.received_quantity || 0) + parseFloat(item.receive_quantity || 0); return totalReceived >= parseFloat(item.quantity || 0) })
      const statusText = allReceived ? '已收货' : '部分收货'
      ElMessage.success(`到货成功！已为 ${result.successCount || 0} 个物料生成检验单，订单状态已更新为${statusText}`)
      receiveDialogVisible.value = false
      if (loadOrdersCallback) await loadOrdersCallback()
    } catch (error) { console.error('确认到货失败:', error); ElMessage.error('到货失败: ' + getRequestErrorMessage(error, '未知错误')) }
    finally { receiveDialogLoading.value = false }
  }

  const updateReceiving = async (order) => {
    try {
      const orderRes = await purchaseApi.getOrder(order.id)
      if (!orderRes || !orderRes.data) { ElMessage.error('获取订单信息失败'); return }
      const orderData = parseResponseData(orderRes); const items = orderData.items || []
      const pendingItems = items.filter(item => { const pendingQty = parseFloat(item.quantity) - parseFloat(item.received_quantity || 0); return pendingQty > 0 })
      if (pendingItems.length === 0) { ElMessage.info('该订单所有物料已全部收货完成'); return }
      const totalPendingQty = pendingItems.reduce((sum, item) => sum + (parseFloat(item.quantity) - parseFloat(item.received_quantity || 0)), 0)
      await ElMessageBox.confirm(`确定要收货剩余的 ${totalPendingQty.toFixed(2)} 个物料吗？收货后将自动生成检验单并更新收货状态。`, '确认收货', { confirmButtonText: '确定收货', cancelButtonText: '取消', type: 'info' })
      const receivingItems = pendingItems.map(item => { const pendingQty = parseFloat(item.quantity) - parseFloat(item.received_quantity || 0); return { ...item, receive_quantity: pendingQty, quantity: pendingQty, received_quantity: pendingQty, warehoused_quantity: pendingQty } })
      const result = unwrapBusinessData(await purchaseApi.receiveOrderWithInspection(order.id, receivingItems))
      ElMessage.success(`收货成功！已为 ${result.successCount || 0} 个物料生成检验单，订单状态已更新为已收货`)
      if (loadOrdersCallback) await loadOrdersCallback()
    } catch (error) { if (error === 'cancel') return; console.error('更新收货失败:', error); ElMessage.error('收货失败: ' + getRequestErrorMessage(error, '未知错误')) }
  }

  // ========== 打印 ==========
  const printOrder = async () => {
    if (!viewData.id) { ElMessage.warning('无法打印，订单详情不完整'); return }
    try {
      let companyInfo = { company_name: '', company_phone: '', company_fax: '', company_address: '' }
      try {
        companyInfo = await printService.getCompanyInfo()
      } catch {
        ElMessage.warning('系统设置读取失败，已使用默认公司信息')
      }
      const printData = {
        ...companyInfo, order_number: viewData.order_number || viewData.order_no || '', order_no: viewData.order_number || viewData.order_no || '',
        order_date: formatDate(viewData.order_date), expected_delivery_date: formatDate(viewData.expected_delivery_date), delivery_date: formatDate(viewData.expected_delivery_date),
        supplier_name: viewData.supplier_name || '', contact_person: viewData.contact_person || '-', contact_phone: viewData.contact_phone || '-',
        status: getStatusText(viewData.status), notes: viewData.notes || '', remark: viewData.notes || '', contract_code: viewData.contract_code || '-',
        subtotal: formatPlainAmount(viewData.total_amount), tax_amount: formatPlainAmount(viewData.tax_amount), total_amount: formatPlainAmount(viewData.total_amount),
        total_quantity: (viewData.items || []).reduce((sum, item) => sum + parseFloat(item.quantity || 0), 0).toFixed(2),
        print_time: new Date().toLocaleString('zh-CN'),
        items: (viewData.items || []).map((item, index) => {
          const quantity = parseFloat(item.quantity || 0)
          const priceSource = item.price ?? item.unit_price
          const price = isBlankAmount(priceSource) ? null : Number(priceSource)
          const totalPriceSource = item.total_price ?? item.amount
          const totalPrice = isBlankAmount(totalPriceSource)
            ? (price === null ? null : quantity * price)
            : Number(totalPriceSource)
          return {
            ...item,
            index: index + 1,
            material_code: item.material_code || item.code || item.product_code || '-',
            product_code: item.material_code || item.code || item.product_code || '-',
            material_name: item.material_name || item.name || item.product_name || '-',
            product_name: item.material_name || item.name || item.product_name || '-',
            specification: item.specification || item.specs || item.model || '-',
            unit: item.unit || item.unit_name || item.Unit || '-',
            unit_name: item.unit || item.unit_name || item.Unit || '-',
            quantity: quantity.toFixed(2),
            price: formatPlainAmount(price),
            unit_price: formatPlainAmount(price),
            total_price: formatPlainAmount(totalPrice),
            amount: formatPlainAmount(totalPrice),
            delivery_date: formatDate(item.delivery_date || viewData.expected_delivery_date || '')
          }
        })
      }
      await printService.previewByDefaultTemplate('purchase', 'purchase_order', printData)
    } catch (error) { console.error('打印失败:', error); ElMessage.error('打印失败: ' + (error.message || '未知错误')) }
  }

  // ========== 统计与批量 ==========
  const getOrderStats = async () => {
    try {
      const total = orderList.value.length
      const pendingCount = orderList.value.filter(item => item.status === 'pending').length
      const approvedCount = orderList.value.filter(item => item.status === 'approved').length
      const completedCount = orderList.value.filter(item => item.status === 'completed').length
      const totalAmount = orderList.value.some(item => isBlankAmount(item.total_amount))
        ? null
        : orderList.value.reduce((sum, item) => { const amount = parseFloat(item.total_amount); return sum + (isNaN(amount) ? 0 : amount) }, 0)
      orderStats.value = { total, totalAmount, pendingCount, approvedCount, completedCount }
    } catch (error) { console.error('计算订单统计数据失败:', error) }
  }

  const handleSelectionChange = (selection) => { selectedOrders.value = selection }
  const clearSelection = () => { if (orderTableRef.value) orderTableRef.value.clearSelection(); selectedOrders.value = [] }

  const handleBatchSubmit = async () => {
    try {
      await ElMessageBox.confirm(`确定要批量提交选中的 ${selectedOrders.value.length} 个订单吗？`, '批量提交', { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' })
      batchLoading.value = true
      const response = await purchaseApi.batchUpdateOrderStatus(selectedOrders.value.map(order => order.id), 'pending')
      const data = parseResponseData(response, {})
      const successCount = Number(data.successCount) || 0
      const failCount = Number(data.failCount) || 0
      if (successCount > 0) { ElMessage.success(`成功提交 ${successCount} 个订单${failCount > 0 ? `，${failCount} 个失败` : ''}`); clearSelection(); if (loadOrdersCallback) await loadOrdersCallback() }
      else ElMessage.error('批量提交失败')
    } catch (error) { if (error !== 'cancel') console.error('批量提交失败:', error) }
    finally { batchLoading.value = false }
  }

  return {
    detailLoading, viewDialogVisible, viewData,
    receiveDialogVisible, receiveDialogLoading, receiveForm, receiveTableRef, totalReceiveQuantity,
    requisitionViewDialog, requisitionViewData,
    orderTableRef, selectedOrders, batchLoading, canBatchSubmit,
    orderStats, formatDate, formatCurrency, getStatusText, getStatusType,
    getCountdownText, getCountdownType,
    viewOrder, viewRequisition, updateStatus, deleteOrder,
    openReceiveDialog, handleReceiveQuantityChange, confirmReceive, updateReceiving,
    printOrder, getOrderStats,
    handleSelectionChange, clearSelection, handleBatchSubmit
  }
}
