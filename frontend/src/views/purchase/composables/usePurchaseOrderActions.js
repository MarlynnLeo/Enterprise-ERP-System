/**
 * usePurchaseOrderActions.js
 * @description 采购订单操作逻辑的组合式函数（从 PurchaseOrders.vue 抽取）
 * 包含：状态更新、到货、收货、详情查看、打印、删除、批量操作
 */
import { ref, reactive, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { purchaseApi, api } from '@/services/api'
import { PURCHASE_STATUS, PURCHASE_STATUS_ACTION_TEXT, PURCHASE_ORDER_PRINT_TEMPLATE_ID, isValidStatusTransition, getStatusLabel } from '@/constants/purchaseConstants'
import { getPurchaseStatusText, getPurchaseStatusColor } from '@/constants/systemConstants'
import { usePurchaseInspection } from '@/composables/usePurchaseInspection'
import { formatDate } from '@/utils/helpers/dateUtils'

export function usePurchaseOrderActions(loadOrdersCallback, orderList) {
  const { createInspectionForOrder, showInspectionResult } = usePurchaseInspection()

  // 详情对话框
  const detailLoading = ref(false)
  const viewDialogVisible = ref(false)
  const viewData = reactive({
    id: null, order_number: '', order_date: '', expected_delivery_date: '',
    supplier_id: '', supplier_name: '', contact_person: '', contact_phone: '',
    remarks: '', status: '', total_amount: 0, requisition_id: null, requisition_number: '', items: []
  })

  // 到货对话框
  const receiveDialogVisible = ref(false)
  const receiveDialogLoading = ref(false)
  const receiveForm = reactive({ order_id: null, order_no: '', items: [] })
  const receiveTableRef = ref(null)
  const totalReceiveQuantity = computed(() => receiveForm.items.reduce((sum, item) => sum + parseFloat(item.receive_quantity || 0), 0))

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
  const canBatchApprove = computed(() => { if (selectedOrders.value.length === 0) return false; return selectedOrders.value.every(order => order.status === 'pending') })

  // 统计数据
  const orderStats = ref({ total: 0, totalAmount: 0, pendingCount: 0, approvedCount: 0, completedCount: 0 })

  // 格式化（formatDate 使用 @/utils/helpers/dateUtils 公共实现）
  const formatCurrency = (value) => { if (!value) return '¥0.00'; return '¥' + parseFloat(value).toFixed(2) }
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
    return items.map(item => ({
      material_id: item.material_id || item.materialId || item.id || '',
      material_code: item.material_code || item.materialCode || item.code || '',
      material_name: item.material_name || item.materialName || item.name || '',
      specification: item.specification || '', unit: item.unit || item.unitName || item.unit_name || '',
      quantity: parseFloat(item.quantity || 0), price: parseFloat(item.price || 0),
      total_price: parseFloat(item.total_price || item.totalPrice || (item.quantity * item.price) || 0),
      tax_rate: parseFloat(item.tax_rate || 0), tax_amount: parseFloat(item.tax_amount || 0),
      received_quantity: parseFloat(item.received_quantity || 0), warehoused_quantity: parseFloat(item.warehoused_quantity || 0),
      received_percentage: parseFloat(item.received_percentage || 0), warehoused_percentage: parseFloat(item.warehoused_percentage || 0),
      pending_quantity: parseFloat(item.pending_quantity || 0)
    }))
  }

  const viewOrder = async (id) => {
    detailLoading.value = true; viewDialogVisible.value = true
    try {
      const response = await purchaseApi.getOrder(id)
      Object.keys(viewData).forEach(key => { if (key !== 'items') viewData[key] = ''; else viewData[key] = [] })
      if (response) {
        const data = response.data?.data || response.data || response
        let items = data.items || data.orderItems || data.materialItems || []
        items = fixItemsStructure(items)
        Object.assign(viewData, {
          id: data.id, order_number: data.order_no || data.orderNo || '',
          order_date: formatDate(data.order_date || data.orderDate || ''),
          expected_delivery_date: formatDate(data.expected_delivery_date || data.expectedDeliveryDate || ''),
          supplier_id: data.supplier_id || data.supplierId || '', supplier_name: data.supplier_name || data.supplierName || '',
          contact_person: data.contact_person || data.contactPerson || '', contact_phone: data.contact_phone || data.contactPhone || '',
          notes: data.notes || data.remarks || '', status: data.status || '',
          total_amount: data.total_amount || data.totalAmount || 0,
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
      if (currentStatus === status) { ElMessage.info(`订单当前已经是"${getStatusLabel(status)}"状态`); return }
      if (!isValidStatusTransition(currentStatus, status)) { ElMessage.error(`无法将订单从"${getStatusLabel(currentStatus)}"状态转换为"${getStatusLabel(status)}"状态`); return }
      await ElMessageBox.confirm(`确定要${PURCHASE_STATUS_ACTION_TEXT[status] || '更新'}此采购订单吗？`, '提示', { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' })
      await purchaseApi.updateOrderStatus(id, status)
      ElMessage.success(`订单已${PURCHASE_STATUS_ACTION_TEXT[status] || '更新'}`)
      if (loadOrdersCallback) await loadOrdersCallback()
      if (status === PURCHASE_STATUS.COMPLETED) {
        const orderDetailRes = await purchaseApi.getOrder(id)
        if (orderDetailRes && orderDetailRes.data) { const result = await createInspectionForOrder(orderDetailRes.data); showInspectionResult(result) }
      }
    } catch (error) {
      if (error === 'cancel') return
      console.error('更新订单状态失败:', error)
      if (error.response && error.response.data) {
        const errorData = error.response.data
        if (errorData.error === '当前已经是该状态') ElMessage.info(`订单当前已经是"${getStatusLabel(status)}"状态`)
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
      const orderData = orderRes.data?.data || orderRes.data
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
      await purchaseApi.updateOrderItemsReceived(receiveForm.order_id, receivingItems)
      const receiveData = { ...receiveForm, items: receivingItems.map(item => ({ ...item, quantity: item.receive_quantity, received_quantity: item.receive_quantity, warehoused_quantity: item.receive_quantity })) }
      const result = await createInspectionForOrder(receiveData)
      const allReceived = receiveForm.items.every(item => { const totalReceived = parseFloat(item.received_quantity || 0) + parseFloat(item.receive_quantity || 0); return totalReceived >= parseFloat(item.quantity || 0) })
      if (allReceived) { await purchaseApi.updateOrderStatus(receiveForm.order_id, PURCHASE_STATUS.COMPLETED); ElMessage.success(`到货成功！已为 ${result.successCount} 个物料生成检验单，订单已完成`) }
      else { await purchaseApi.updateOrderStatus(receiveForm.order_id, PURCHASE_STATUS.PARTIAL_RECEIVED); ElMessage.success(`到货成功！已为 ${result.successCount} 个物料生成检验单，订单状态更新为部分收货`) }
      if (result.failedCount > 0 || result.skippedCount > 0) showInspectionResult(result)
      receiveDialogVisible.value = false
      if (loadOrdersCallback) await loadOrdersCallback()
    } catch (error) { console.error('确认到货失败:', error); ElMessage.error('到货失败: ' + (error.message || '未知错误')) }
    finally { receiveDialogLoading.value = false }
  }

  const updateReceiving = async (order) => {
    try {
      const orderRes = await purchaseApi.getOrder(order.id)
      if (!orderRes || !orderRes.data) { ElMessage.error('获取订单信息失败'); return }
      const orderData = orderRes.data?.data || orderRes.data; const items = orderData.items || []
      const pendingItems = items.filter(item => { const pendingQty = parseFloat(item.quantity) - parseFloat(item.received_quantity || 0); return pendingQty > 0 })
      if (pendingItems.length === 0) { ElMessage.info('该订单所有物料已全部收货完成'); return }
      const totalPendingQty = pendingItems.reduce((sum, item) => sum + (parseFloat(item.quantity) - parseFloat(item.received_quantity || 0)), 0)
      await ElMessageBox.confirm(`确定要收货剩余的 ${totalPendingQty.toFixed(2)} 个物料吗？收货后将自动生成检验单并完成订单。`, '确认收货', { confirmButtonText: '确定收货', cancelButtonText: '取消', type: 'info' })
      const result = await createInspectionForOrder(orderData, pendingItems.map(item => { const pendingQty = parseFloat(item.quantity) - parseFloat(item.received_quantity || 0); return { ...item, quantity: pendingQty, received_quantity: pendingQty, warehoused_quantity: pendingQty } }), 'quick')
      await purchaseApi.updateOrderStatus(order.id, PURCHASE_STATUS.COMPLETED)
      ElMessage.success(`收货成功！已为 ${result.successCount} 个物料生成检验单，订单已完成`)
      if (result.failedCount > 0 || result.skippedCount > 0) showInspectionResult(result)
      if (loadOrdersCallback) await loadOrdersCallback()
    } catch (error) { if (error === 'cancel') return; console.error('更新收货失败:', error); ElMessage.error('收货失败: ' + (error.message || '未知错误')) }
  }

  // ========== 打印 ==========
  const printOrder = async () => {
    if (!viewData.id) { ElMessage.warning('无法打印，订单详情不完整'); return }
    try {
      let template = null
      const templateResponse = await api.get(`/print/templates/${PURCHASE_ORDER_PRINT_TEMPLATE_ID}`)
      if (templateResponse.data?.data) template = templateResponse.data.data
      else if (templateResponse.data?.content) template = templateResponse.data
      else template = templateResponse.data
      if (!template || !template.content) { console.error('模板数据:', templateResponse.data); throw new Error('打印模板内容为空') }
      let companyInfo = { company_name: '', company_phone: '', company_fax: '', company_address: '' }
      try {
        const settingsRes = await api.get('/system/settings')
        if (settingsRes.data) {
          const settings = Array.isArray(settingsRes.data) ? settingsRes.data : []
          companyInfo.company_name = settings.find(s => s.key === 'company_name' || s.setting_key === 'company_name')?.value || settings.find(s => s.key === 'company_name' || s.setting_key === 'company_name')?.setting_value || ''
          companyInfo.company_phone = settings.find(s => s.key === 'company_phone' || s.setting_key === 'company_phone')?.value || settings.find(s => s.key === 'company_phone' || s.setting_key === 'company_phone')?.setting_value || ''
          companyInfo.company_fax = settings.find(s => s.key === 'company_fax' || s.setting_key === 'company_fax')?.value || settings.find(s => s.key === 'company_fax' || s.setting_key === 'company_fax')?.setting_value || ''
          companyInfo.company_address = settings.find(s => s.key === 'company_address' || s.setting_key === 'company_address')?.value || settings.find(s => s.key === 'company_address' || s.setting_key === 'company_address')?.setting_value || ''
        }
      } catch (error) { console.error('获取系统设置失败:', error) }
      const printData = {
        ...companyInfo, order_number: viewData.order_number || viewData.order_no || '', order_no: viewData.order_number || viewData.order_no || '',
        order_date: formatDate(viewData.order_date), expected_delivery_date: formatDate(viewData.expected_delivery_date), delivery_date: formatDate(viewData.expected_delivery_date),
        supplier_name: viewData.supplier_name || '', contact_person: viewData.contact_person || '-', contact_phone: viewData.contact_phone || '-',
        status: getStatusText(viewData.status), notes: viewData.notes || '', remark: viewData.notes || '', contract_code: viewData.contract_code || '-',
        subtotal: parseFloat(viewData.total_amount || 0).toFixed(2), tax_amount: '0.00', total_amount: parseFloat(viewData.total_amount || 0).toFixed(2),
        total_quantity: (viewData.items || []).reduce((sum, item) => sum + parseFloat(item.quantity || 0), 0).toFixed(2),
        print_time: new Date().toLocaleString('zh-CN'), items: viewData.items || []
      }
      let printContent = template.content
      if (printContent.includes('&lt;') || printContent.includes('&gt;')) { const textarea = document.createElement('textarea'); textarea.innerHTML = printContent; printContent = textarea.value }
      Object.keys(printData).forEach(key => { if (key !== 'items') { const regex = new RegExp(`{{${key}}}`, 'g'); printContent = printContent.replace(regex, printData[key] || '') } })
      let itemsLoopMatch = printContent.match(/{{#items}}([\s\S]*?){{\/items}}/)
      if (!itemsLoopMatch) itemsLoopMatch = printContent.match(/{{#each\s+items}}([\s\S]*?){{\/each}}/)
      if (!itemsLoopMatch) itemsLoopMatch = printContent.match(/{{#each}}([\s\S]*?){{\/each}}/)
      if (itemsLoopMatch && printData.items && printData.items.length > 0) {
        const itemTemplate = itemsLoopMatch[1]
        const itemsHtml = printData.items.map((item, index) => {
          let itemHtml = itemTemplate
          itemHtml = itemHtml.replace(/{{index}}/g, index + 1).replace(/{{@index}}/g, index + 1).replace(/{{#index}}/g, index + 1)
          const materialCode = item.material_code || item.code || item.product_code || '-'
          const materialName = item.material_name || item.name || item.product_name || '-'
          const specification = item.specification || item.specs || item.model || '-'
          const unit = item.unit || item.unit_name || item.Unit || '-'
          const quantity = parseFloat(item.quantity || 0).toFixed(2); const price = parseFloat(item.price || item.unit_price || 0).toFixed(2)
          const totalPrice = parseFloat(item.total_price || item.amount || (quantity * price) || 0).toFixed(2)
          const deliveryDate = formatDate(item.delivery_date || viewData.expected_delivery_date || '')
          itemHtml = itemHtml.replace(/{{material_code}}/g, materialCode).replace(/{{code}}/g, materialCode).replace(/{{product_code}}/g, materialCode)
          itemHtml = itemHtml.replace(/{{material_name}}/g, materialName).replace(/{{name}}/g, materialName).replace(/{{product_name}}/g, materialName)
          itemHtml = itemHtml.replace(/{{specification}}/g, specification).replace(/{{specs}}/g, specification).replace(/{{model}}/g, specification)
          itemHtml = itemHtml.replace(/{{Unit}}/g, unit).replace(/{{unit}}/g, unit).replace(/{{unit_name}}/g, unit)
          itemHtml = itemHtml.replace(/{{quantity}}/g, quantity).replace(/{{price}}/g, price).replace(/{{unit_price}}/g, price)
          itemHtml = itemHtml.replace(/{{total_price}}/g, totalPrice).replace(/{{amount}}/g, totalPrice).replace(/{{delivery_date}}/g, deliveryDate)
          return itemHtml
        }).join('')
        printContent = printContent.replace(/{{#items}}[\s\S]*?{{\/items}}/g, itemsHtml)
        printContent = printContent.replace(/{{#each\s+items}}[\s\S]*?{{\/each}}/g, itemsHtml)
        printContent = printContent.replace(/{{#each}}[\s\S]*?{{\/each}}/g, itemsHtml)
      }
      const printWindow = window.open('', '_blank')
      if (!printWindow) { ElMessage.error('打印窗口被阻止，请允许弹出窗口'); return }
      printWindow.document.open(); printWindow.document.write(printContent); printWindow.document.close()
      printWindow.onload = function () { setTimeout(() => { printWindow.focus() }, 500) }
    } catch (error) { console.error('打印失败:', error); ElMessage.error('打印失败: ' + (error.message || '未知错误')) }
  }

  // ========== 统计与批量 ==========
  const getOrderStats = async () => {
    try {
      const total = orderList.value.length
      const pendingCount = orderList.value.filter(item => item.status === 'pending').length
      const approvedCount = orderList.value.filter(item => item.status === 'approved').length
      const completedCount = orderList.value.filter(item => item.status === 'completed').length
      const totalAmount = orderList.value.reduce((sum, item) => { const amount = parseFloat(item.total_amount || 0); return sum + (isNaN(amount) ? 0 : amount) }, 0)
      orderStats.value = { total, totalAmount, pendingCount, approvedCount, completedCount }
    } catch (error) { console.error('计算订单统计数据失败:', error) }
  }

  const handleSelectionChange = (selection) => { selectedOrders.value = selection }
  const clearSelection = () => { if (orderTableRef.value) orderTableRef.value.clearSelection(); selectedOrders.value = [] }

  const handleBatchSubmit = async () => {
    try {
      await ElMessageBox.confirm(`确定要批量提交选中的 ${selectedOrders.value.length} 个订单吗？`, '批量提交', { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' })
      batchLoading.value = true; let successCount = 0; let failCount = 0
      for (const order of selectedOrders.value) { try { await purchaseApi.updateOrderStatus(order.id, 'pending'); successCount++ } catch (error) { console.error(`订单 ${order.order_no} 提交失败:`, error); failCount++ } }
      if (successCount > 0) { ElMessage.success(`成功提交 ${successCount} 个订单${failCount > 0 ? `，${failCount} 个失败` : ''}`); clearSelection(); if (loadOrdersCallback) await loadOrdersCallback() }
      else ElMessage.error('批量提交失败')
    } catch (error) { if (error !== 'cancel') console.error('批量提交失败:', error) }
    finally { batchLoading.value = false }
  }

  const handleBatchApprove = async () => {
    try {
      await ElMessageBox.confirm(`确定要批量批准选中的 ${selectedOrders.value.length} 个订单吗？`, '批量批准', { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' })
      batchLoading.value = true; let successCount = 0; let failCount = 0
      for (const order of selectedOrders.value) { try { await purchaseApi.updateOrderStatus(order.id, 'approved'); successCount++ } catch (error) { console.error(`订单 ${order.order_no} 批准失败:`, error); failCount++ } }
      if (successCount > 0) { ElMessage.success(`成功批准 ${successCount} 个订单${failCount > 0 ? `，${failCount} 个失败` : ''}`); clearSelection(); if (loadOrdersCallback) await loadOrdersCallback() }
      else ElMessage.error('批量批准失败')
    } catch (error) { if (error !== 'cancel') console.error('批量批准失败:', error) }
    finally { batchLoading.value = false }
  }

  return {
    detailLoading, viewDialogVisible, viewData,
    receiveDialogVisible, receiveDialogLoading, receiveForm, receiveTableRef, totalReceiveQuantity,
    requisitionViewDialog, requisitionViewData,
    orderTableRef, selectedOrders, batchLoading, canBatchSubmit, canBatchApprove,
    orderStats, formatDate, formatCurrency, getStatusText, getStatusType,
    getCountdownText, getCountdownType,
    viewOrder, viewRequisition, updateStatus, deleteOrder,
    openReceiveDialog, handleReceiveQuantityChange, confirmReceive, updateReceiving,
    printOrder, getOrderStats,
    handleSelectionChange, clearSelection, handleBatchSubmit, handleBatchApprove
  }
}
