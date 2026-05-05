/**
 * usePurchaseOrderForm.js
 * @description 采购订单表单逻辑的组合式函数（从 PurchaseOrders.vue 抽取）
 * 包含：表单数据、物料操作、供应商选择、提交逻辑
 */
import { ref, reactive, nextTick } from 'vue'
import { ElMessage, ElMessageBox, ElLoading } from 'element-plus'
import { purchaseApi, supplierApi, baseDataApi } from '@/services/api'
import { parseListData } from '@/utils/responseParser'
import { searchMaterials } from '@/utils/searchConfig'
import { useFinanceStore } from '@/stores/finance'
import { storeToRefs } from 'pinia'
import { DEFAULT_DELIVERY_DAYS, DEFAULT_VAT_RATE } from '@/constants/purchaseConstants'
import { formatDate } from '@/utils/helpers/dateUtils'

/**
 * 辅助函数：将物料数据源的字段统一赋值到订单行目标对象
 * @param {Object} target - 目标对象（orderForm.items[index]）
 * @param {Object} source - 数据源（搜索结果/选中物料）
 */
function assignMaterialFields(target, source) {
  target.material_id = source.id || source.material_id || null
  target.material_code = source.code || source.material_code || ''
  target.material_name = source.name || source.material_name || ''
  target.specification = source.specs || source.specification || ''
  target.specs = source.specs || source.specification || ''
  target.unit = source.unit_name || source.unit || ''
  target.unit_name = source.unit_name || source.unit || ''
  target.unit_id = source.unit_id || null
}

/**
 * 辅助函数：清空行的物料字段
 */
function clearMaterialFields(target) {
  target.material_id = null
  target.material_code = ''
  target.material_name = ''
  target.specification = ''
  target.specs = ''
  target.unit = ''
  target.unit_name = ''
  target.unit_id = null
}

export function usePurchaseOrderForm(loadOrdersCallback) {
  const financeStore = useFinanceStore()
  const { vatRateOptions, defaultVATRate } = storeToRefs(financeStore)

  // 格式化税率显示
  const formatTaxRate = (rate) => {
    if (rate === null || rate === undefined) return '0%'
    return `${(rate * 100).toFixed(0)}%`
  }

  // 供应商数据
  const suppliers = ref([])
  const filteredSuppliers = ref([])
  const supplierLoading = ref(false)

  // 物料搜索
  const filteredProducts = ref([])
  const materialsLoading = ref(false)
  const materialSearchLoading = ref(false)

  // 对话框控制
  const orderFormRef = ref(null)
  const orderDialog = reactive({ visible: false, isEdit: false, editId: null, loading: false })

  // 表单数据
  const orderForm = reactive({
    order_number: '', order_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: '', supplier_id: '', supplier_name: '',
    contact_person: '', contact_phone: '', notes: '',
    requisition_id: null, requisition_number: '', status: 'draft',
    tax_rate: DEFAULT_VAT_RATE, subtotal: 0, tax_amount: 0, items: []
  })

  const orderRules = {
    order_date: [{ required: true, message: '请选择订单日期', trigger: 'blur' }],
    expected_delivery_date: [{ required: true, message: '请选择预计到货日期', trigger: 'blur' }],
    supplier_id: [{ required: true, message: '请选择供应商', trigger: 'change' }]
  }

  // 组件引用
  const materialSelectRefs = ref({})
  const quantityInputRefs = ref({})
  const setMaterialSelectRef = (el, index) => { if (el) materialSelectRefs.value[index] = el }
  const setQuantityInputRef = (el, index) => { if (el) quantityInputRefs.value[index] = el }

  // 采购申请相关
  const requisitionDialogVisible = ref(false)
  const requisitionDialogLoading = ref(false)
  const requisitionSearchKeyword = ref('')
  const requisitionList = ref([])
  const unorderedMaterialsList = ref([])
  const selectedMaterials = ref([])
  const materialTableRef = ref(null)
  const requisitionPagination = reactive({ current: 1, size: 10, total: 0 })

  // ========== 供应商操作 ==========
  const loadSuppliers = async () => {
    try {
      const res = await supplierApi.getSuppliers({ page: 1, pageSize: 100 })
      suppliers.value = parseListData(res, { enableLog: false })
      filteredSuppliers.value = [...suppliers.value]
    } catch (error) {
      console.error('获取供应商列表失败:', error)
      suppliers.value = []; filteredSuppliers.value = []
    }
  }

  const ensureSupplierExists = async (supplierId) => {
    if (!supplierId) return
    const idNum = Number(supplierId)
    if (!idNum || suppliers.value.some(s => s.id === idNum)) {
      const supplier = suppliers.value.find(s => s.id === idNum)
      if (supplier && !filteredSuppliers.value.some(s => s.id === idNum)) filteredSuppliers.value.unshift(supplier)
      return
    }
    try {
      const res = await supplierApi.getSupplier(idNum)
      const supplier = res.data?.data || res.data || res
      if (supplier && supplier.id) {
        if (!suppliers.value.some(s => s.id === supplier.id)) suppliers.value.unshift(supplier)
        if (!filteredSuppliers.value.some(s => s.id === supplier.id)) filteredSuppliers.value.unshift(supplier)
      }
    } catch (error) { console.warn(`无法获取供应商详情 (ID: ${idNum}):`, error) }
  }

  const searchSuppliers = async (query) => {
    if (!query || query.length < 1) { filteredSuppliers.value = suppliers.value.slice(0, 50); return }
    supplierLoading.value = true
    try {
      const res = await supplierApi.getSuppliers({ page: 1, pageSize: 50, keyword: query.trim() })
      const results = parseListData(res, { enableLog: false })
      filteredSuppliers.value = results
      results.forEach(item => { if (!suppliers.value.find(s => s.id === item.id)) suppliers.value.push(item) })
    } catch (error) { console.error('搜索供应商失败:', error); filteredSuppliers.value = [] }
    finally { supplierLoading.value = false }
  }

  const handleSupplierFocus = async () => {
    if (filteredSuppliers.value.length === 0) {
      supplierLoading.value = true
      try {
        const res = await supplierApi.getSuppliers({ page: 1, pageSize: 50 })
        const results = parseListData(res, { enableLog: false })
        filteredSuppliers.value = results
        results.forEach(item => { if (!suppliers.value.find(s => s.id === item.id)) suppliers.value.push(item) })
      } catch (error) { console.error('加载供应商列表失败:', error) }
      finally { supplierLoading.value = false }
    }
  }

  const handleSupplierChange = async (supplierId) => {
    let supplier = suppliers.value.find(s => String(s.id) === String(supplierId))
    if (!supplier) supplier = filteredSuppliers.value.find(s => String(s.id) === String(supplierId))
    if (supplier) {
      orderForm.supplier_name = supplier.name
      orderForm.contact_person = supplier.contact_person || ''
      orderForm.contact_phone = supplier.contact_phone || ''
      if (!suppliers.value.find(s => s.id === supplier.id)) suppliers.value.push(supplier)
    }
    let updatedCount = 0
    for (let i = 0; i < orderForm.items.length; i++) {
      const item = orderForm.items[i]
      if (item.material_id) {
        try {
          const res = await purchaseApi.getLatestPrice({ material_id: item.material_id, supplier_id: supplierId })
          if (res && res.data && res.data.price > 0 && res.data.source === 'supplier_history') {
            item.price = res.data.price; recalculatePrice(item); updatedCount++
          }
        } catch { console.warn(`重算物料 ${item.material_code} 的单价失败`) }
      }
    }
    if (updatedCount > 0) ElMessage.success(`已根据新供应商的历史成交记录，自动刷新了 ${updatedCount} 项物料单价`)
  }

  // ========== 物料操作 ==========
  const addMaterialRow = () => {
    orderForm.items.push({
      material_id: null, material_code: '', material_name: '', specification: '', specs: '',
      unit: '', unit_name: '', unit_id: null, quantity: '', price: '', total_price: 0,
      tax_rate: defaultVATRate.value, tax_amount: 0, material_display: ''
    })
  }

  const removeItem = (index) => { orderForm.items.splice(index, 1) }

  const recalculatePrice = (item) => {
    if (item.quantity <= 0) { ElMessage.warning('数量必须大于0'); item.quantity = 0.01 }
    item.total_price = item.quantity * item.price
    item.tax_amount = item.total_price * (item.tax_rate || 0)
  }

  const formatQuantity = (item) => {
    if (item.quantity && !isNaN(item.quantity)) item.quantity = parseFloat(item.quantity).toFixed(1)
  }

  const calculateTotalAmount = () => {
    const subtotal = orderForm.items.reduce((total, item) => total + (item.quantity * item.price), 0)
    const taxAmount = orderForm.items.reduce((total, item) => total + (item.tax_amount || 0), 0)
    orderForm.subtotal = subtotal; orderForm.tax_amount = taxAmount
    return (subtotal + taxAmount).toFixed(2)
  }

  const fetchMaterialSuggestions = async (query, callback) => {
    if (!query || query.length < 1) { callback([]); return }
    try {
      const searchResults = await searchMaterials(baseDataApi, query.trim(), { pageSize: 500, includeAll: true })
      const suggestions = searchResults.map(item => ({
        value: item.code || '无编码', code: item.code || '无编码', name: item.name || '未命名',
        specs: item.specification || item.specs || '', stock_quantity: item.stock_quantity || 0,
        id: item.id, unit_name: item.unit_name || '个', unit_id: item.unit_id,
        cost_price: item.cost_price || 0, price: item.price || 0,
        tax_rate: item.tax_rate || 0, supplier_id: item.supplier_id
      }))
      filteredProducts.value = suggestions; callback(suggestions)
    } catch (error) { console.error('搜索物料失败:', error); ElMessage.error('搜索物料失败'); callback([]) }
  }

  const handleMaterialSelect = async (item, index) => {
    assignMaterialFields(orderForm.items[index], item)
    if (item.tax_rate !== undefined && item.tax_rate !== null) orderForm.items[index].tax_rate = parseFloat(item.tax_rate)
    try {
      const res = await purchaseApi.getLatestPrice({ material_id: item.id, supplier_id: orderForm.supplier_id || item.supplier_id || '' })
      if (res && res.data && res.data.price > 0) {
        orderForm.items[index].price = res.data.price
        let sourceMsg = ''
        if (res.data.source === 'supplier_history') sourceMsg = `已自动带入该供应商最近成交价: ￥${res.data.price}`
        else if (res.data.source === 'other_supplier_history') sourceMsg = `已参考其他供应商历史价: ￥${res.data.price}`
        else sourceMsg = `已带入物料预估参考价: ￥${res.data.price}`
        ElMessage({ message: sourceMsg, type: 'success', duration: 2000 })
      } else { orderForm.items[index].price = 0 }
    } catch (e) {
      console.error('获取实时指导价抛出异常，执行降级策略:', e)
      const defaultPrice = parseFloat(item.cost_price) || parseFloat(item.price) || 0
      orderForm.items[index].price = defaultPrice > 0 ? defaultPrice : 0
    }
    recalculatePrice(orderForm.items[index])
    if (!orderForm.supplier_id && item.supplier_id) orderForm.supplier_id = item.supplier_id
    nextTick(() => { const quantityInput = quantityInputRefs.value[index]; if (quantityInput) quantityInput.focus() })
  }

  const handleMaterialEnter = (index) => {
    if (filteredProducts.value.length > 0) handleMaterialSelect(filteredProducts.value[0], index)
  }

  const handleQuantityEnter = () => {
    addMaterialRow()
    nextTick(() => {
      const newIndex = orderForm.items.length - 1
      const materialSelect = materialSelectRefs.value[newIndex]
      if (materialSelect) materialSelect.focus()
    })
  }

  const handleMaterialDisplayChange = (displayValue, index) => {
    if (!displayValue) {
      clearMaterialFields(orderForm.items[index])
      orderForm.items[index].material_display = ''
      return
    }
    const materialCode = displayValue.split(' - ')[0]
    const selectedMaterial = filteredProducts.value.find(m => (m.code || m.material_code || m.id) === materialCode)
    if (selectedMaterial) {
      assignMaterialFields(orderForm.items[index], selectedMaterial)
      orderForm.items[index].material_display = displayValue
      recalculatePrice(orderForm.items[index])
    }
  }

  const handleMaterialChange = (materialCode, index) => {
    if (!materialCode) {
      clearMaterialFields(orderForm.items[index])
      return
    }
    const selectedMaterial = filteredProducts.value.find(m => (m.code || m.material_code || m.id) === materialCode)
    if (selectedMaterial) {
      assignMaterialFields(orderForm.items[index], selectedMaterial)
      recalculatePrice(orderForm.items[index])
    }
  }

  const formatMaterialLabel = (item) => {
    const code = item.code || item.material_code || item.id || ''
    const name = item.name || item.material_name || item.title || item.product_name || ''
    const specs = item.specs || item.specification || item.model || ''
    let label = code; if (name) label += ` - ${name}`; if (specs) label += ` - ${specs}`; return label
  }

  // ========== 表单操作 ==========
  const resetOrderForm = () => {
    const deliveryDate = new Date()
    deliveryDate.setDate(deliveryDate.getDate() + DEFAULT_DELIVERY_DAYS)
    Object.assign(orderForm, {
      order_number: '', order_date: new Date().toISOString().split('T')[0],
      expected_delivery_date: deliveryDate.toISOString().split('T')[0],
      supplier_id: '', supplier_name: '', contact_person: '', contact_phone: '',
      notes: '', requisition_id: null, requisition_number: '', status: 'draft',
      tax_rate: defaultVATRate.value, subtotal: 0, tax_amount: 0, items: []
    })
  }

  // formatDate 使用 @/utils/helpers/dateUtils 公共实现（已通过 import 引入）

  const loadOrderDetails = async (id) => {
    orderDialog.loading = true
    try {
      const res = await purchaseApi.getOrder(id)
      if (res.data) {
        const data = res.data?.data || res.data
        const processedItems = (data.items || []).map(item => {
          let taxRate = parseFloat(item.tax_rate || 0)
          if (taxRate > 1) taxRate = taxRate / 100
          if (!taxRate || taxRate === 0) taxRate = defaultVATRate.value
          const quantity = parseFloat(item.quantity || 0); const price = parseFloat(item.price || item.unit_price || 0)
          const totalPrice = parseFloat(item.total_price || item.amount || (quantity * price) || 0)
          const taxAmount = (item.tax_amount && parseFloat(item.tax_amount) > 0) ? parseFloat(item.tax_amount) : totalPrice * taxRate
          return { ...item, tax_rate: taxRate, tax_amount: taxAmount, price, quantity, total_price: totalPrice }
        })
        Object.assign(orderForm, {
          order_number: data.order_no || data.orderNo, order_date: formatDate(data.order_date || data.orderDate),
          expected_delivery_date: formatDate(data.expected_delivery_date || data.expectedDeliveryDate),
          supplier_id: String(data.supplier_id || data.supplierId || ''),
          supplier_name: data.supplier_name || data.supplierName,
          contact_person: data.contact_person || data.contactPerson,
          contact_phone: data.contact_phone || data.contactPhone,
          notes: data.notes || data.remarks, status: data.status || 'draft',
          requisition_id: data.requisition_id || data.requisitionId,
          requisition_number: data.requisition_number || data.requisitionNumber,
          items: processedItems
        })
        await ensureSupplierExists(data.supplier_id || data.supplierId)
      }
    } catch (error) { console.error('获取采购订单详情失败:', error); ElMessage.error('获取采购订单详情失败') }
    finally { orderDialog.loading = false }
  }

  const openOrderDialog = async (id) => {
    await loadSuppliers()
    if (id) { orderDialog.isEdit = true; orderDialog.editId = id; await loadOrderDetails(id) }
    else { orderDialog.isEdit = false; orderDialog.editId = null; resetOrderForm() }
    orderDialog.visible = true
  }

  const handleCreate = () => { openOrderDialog() }
  const editOrder = (id) => { openOrderDialog(id) }

  const submitOrderForm = async () => {
    if (orderForm.items.length === 0) { ElMessage.warning('请至少添加一个物料'); return }
    try {
      await orderFormRef.value.validate()
      const formDataToSubmit = {
        order_date: orderForm.order_date, supplier_id: orderForm.supplier_id,
        expected_delivery_date: orderForm.expected_delivery_date,
        contact_person: orderForm.contact_person, contact_phone: orderForm.contact_phone,
        notes: orderForm.notes, total_amount: parseFloat(calculateTotalAmount()),
        tax_rate: orderForm.tax_rate || DEFAULT_VAT_RATE, tax_amount: orderForm.tax_amount || 0,
        subtotal: orderForm.subtotal || 0, status: 'draft',
        requisition_id: orderForm.requisition_id || null,
        requisition_number: orderForm.requisition_number || '',
        items: orderForm.items.map(item => ({
          material_id: item.material_id, material_code: item.material_code,
          material_name: item.material_name, specification: item.specification,
          unit: item.unit, unit_id: item.unit_id, quantity: parseFloat(item.quantity),
          price: parseFloat(item.price), total_price: parseFloat(item.quantity * item.price),
          tax_rate: parseFloat(item.tax_rate || 0), tax_amount: parseFloat(item.tax_amount || 0)
        }))
      }
      if (orderDialog.isEdit) { await purchaseApi.updateOrder(orderDialog.editId, formDataToSubmit); ElMessage.success('采购订单更新成功') }
      else { await purchaseApi.createOrder(formDataToSubmit); ElMessage.success('采购订单创建成功') }
      orderDialog.visible = false
      if (loadOrdersCallback) loadOrdersCallback()
    } catch (error) { console.error('提交表单失败:', error); ElMessage.error(error.message || '提交失败，请检查表单') }
  }

  // ========== 采购申请相关 ==========
  const searchRequisitions = () => { requisitionPagination.current = 1; loadRequisitions() }
  const openRequisitionDialog = () => { requisitionDialogVisible.value = true; searchRequisitions() }
  const removeRequisition = () => {
    ElMessageBox.confirm('确定要移除关联的采购申请吗？', '提示', { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' })
    .then(() => { orderForm.requisition_id = null; orderForm.requisition_number = ''; ElMessage.success('已移除关联的采购申请') }).catch(() => {})
  }

  const handleMaterialSelectionChange = (selection) => { selectedMaterials.value = selection }

  const loadRequisitions = async () => {
    try {
      requisitionDialogLoading.value = true
      const response = await purchaseApi.getOrderRequisitions({ page: requisitionPagination.current, pageSize: requisitionPagination.size, requisitionNo: requisitionSearchKeyword.value, status: 'approved' })
      const requisitionItems = parseListData(response, { enableLog: false })
      const approvedRequisitions = requisitionItems.filter(item => item.status === 'approved' && !item.is_fully_ordered)
      requisitionList.value = approvedRequisitions
      requisitionPagination.total = approvedRequisitions.length
      const allUnorderedMaterials = []
      approvedRequisitions.forEach(req => {
        if (req.materials && req.materials.length > 0) {
          req.materials.forEach((material, idx) => {
            if (!material.ordered_quantity || parseFloat(material.ordered_quantity) === 0) {
              allUnorderedMaterials.push({ ...material, requisition_id: req.id, requisition_number: req.requisition_number, uniqueKey: `${req.id}_${material.material_code}_${idx}` })
            }
          })
        }
      })
      unorderedMaterialsList.value = allUnorderedMaterials
    } catch (error) { console.error('加载申请单列表失败:', error); ElMessage.error('加载申请单列表失败') }
    finally { requisitionDialogLoading.value = false }
  }

  const confirmMaterialSelection = async () => {
    if (!selectedMaterials.value || selectedMaterials.value.length === 0) { ElMessage.warning('请选择至少一个物料'); return }
    try {
      let keepExistingItems = true
      if (orderForm.items.length > 0) {
        keepExistingItems = await ElMessageBox.confirm('是否保留当前已添加的物料？', '提示', { confirmButtonText: '是', cancelButtonText: '否', type: 'warning' }).then(() => true).catch(() => false)
        if (!keepExistingItems) orderForm.items = []
      }
      if (selectedMaterials.value.length > 0) {
        const firstMaterial = selectedMaterials.value[0]
        orderForm.requisition_id = firstMaterial.requisition_id
        orderForm.requisition_number = firstMaterial.requisition_number
      }
      const loadingInstance = ElLoading.service({ lock: true, text: '正在同步最新物料价格和税率...', background: 'rgba(0, 0, 0, 0.7)' })
      try {
        let addedCount = 0
        const materialsWithDetails = await Promise.all(selectedMaterials.value.map(async (item) => {
          try {
            const response = await baseDataApi.getMaterial(item.material_id)
            const detail = response.data || response
            let latestPrice = 0
            try {
              const priceRes = await purchaseApi.getLatestPrice({ material_id: item.material_id, supplier_id: orderForm.supplier_id || '' })
              if (priceRes && priceRes.data && priceRes.data.price > 0) latestPrice = priceRes.data.price
            } catch { console.warn(`获取物料 ${item.material_code} 历史报价失败，降级使用物料主数据价格`) }
            if (latestPrice === 0) latestPrice = parseFloat(detail.cost_price) || parseFloat(detail.price) || 0
            return { ...item, latestDetail: detail, latestPrice }
          } catch (e) { console.warn(`获取物料 ${item.material_code} 详情失败，将使用申请单中的数据`, e); return { ...item, latestDetail: null, latestPrice: 0 } }
        }))
        for (const item of materialsWithDetails) {
          const existingIndex = orderForm.items.findIndex(i => i.material_id === item.material_id)
          let latestTaxRate = 0
          if (item.latestDetail) {
            latestTaxRate = parseFloat(item.latestDetail.tax_rate) || 0
            if (!orderForm.supplier_id && item.latestDetail.supplier_id) orderForm.supplier_id = item.latestDetail.supplier_id
          }
          if (existingIndex >= 0) {
            orderForm.items[existingIndex].quantity += parseFloat(item.quantity)
            if (orderForm.items[existingIndex].price === 0 && item.latestPrice > 0) orderForm.items[existingIndex].price = item.latestPrice
            if (!orderForm.items[existingIndex].tax_rate && latestTaxRate > 0) orderForm.items[existingIndex].tax_rate = latestTaxRate
            recalculatePrice(orderForm.items[existingIndex])
          } else {
            const specs = item.material_specs || item.specification || item.specs || ''
            orderForm.items.push({ material_id: item.material_id, material_code: item.material_code || '', material_name: item.material_name || '', specification: specs, specs, unit: item.unit, unit_name: item.unit, unit_id: item.unit_id, quantity: parseFloat(item.quantity), price: item.latestPrice, tax_rate: latestTaxRate, total_price: 0 })
            recalculatePrice(orderForm.items[orderForm.items.length - 1])
          }
          addedCount++
        }
        orderForm.status = 'draft'
        requisitionDialogVisible.value = false
        ElMessage.success(`成功添加 ${addedCount} 个物料`)
      } finally { loadingInstance.close() }
    } catch (error) { console.error('添加物料失败:', error); ElMessage.error('添加物料失败: ' + (error.message || '未知错误')) }
  }

  return {
    financeStore, vatRateOptions, defaultVATRate, formatTaxRate,
    suppliers, filteredSuppliers, supplierLoading,
    filteredProducts, materialsLoading, materialSearchLoading,
    orderFormRef, orderDialog, orderForm, orderRules,
    materialSelectRefs, quantityInputRefs, setMaterialSelectRef, setQuantityInputRef,
    requisitionDialogVisible, requisitionDialogLoading, requisitionSearchKeyword,
    requisitionList, unorderedMaterialsList, selectedMaterials, materialTableRef, requisitionPagination,
    loadSuppliers, ensureSupplierExists, searchSuppliers, handleSupplierFocus, handleSupplierChange,
    addMaterialRow, removeItem, recalculatePrice, formatQuantity, calculateTotalAmount,
    fetchMaterialSuggestions, handleMaterialSelect, handleMaterialEnter, handleQuantityEnter,
    handleMaterialDisplayChange, handleMaterialChange, formatMaterialLabel,
    resetOrderForm, loadOrderDetails, openOrderDialog, handleCreate, editOrder, submitOrderForm,
    searchRequisitions, openRequisitionDialog, removeRequisition,
    handleMaterialSelectionChange, loadRequisitions, confirmMaterialSelection
  }
}
