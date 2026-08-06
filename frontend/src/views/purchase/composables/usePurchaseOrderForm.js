import { formatLocalDate } from '@/utils/format';
/**
 * usePurchaseOrderForm.js
 * @description 采购订单表单逻辑的组合式函数（从 PurchaseOrders.vue 抽取）
 * 包含：表单数据、物料操作、供应商选择、提交逻辑
 */
import { ref, reactive, nextTick } from 'vue'
import { ElMessage, ElMessageBox, ElLoading } from 'element-plus'
import { purchaseApi, supplierApi, baseDataApi } from '@/api'
import { parseListData, parseResponseData } from '@/utils/responseParser'
import { searchMaterials } from '@/utils/searchConfig'
import { useFinanceStore } from '@/stores/finance'
import { storeToRefs } from 'pinia'
import { DEFAULT_PURCHASE_DELIVERY_DAYS, DEFAULT_PURCHASE_VAT_RATE } from '@/constants/systemConstants'
import { formatDate } from '@/utils/helpers/dateUtils'

/**
 * 辅助函数：将物料数据源的字段统一赋值到订单行目标对象
 * @param {Object} target - 目标对象（orderForm.items[index]）
 * @param {Object} source - 数据源（搜索结果/选中物料）
 */
function assignMaterialFields(target, source) {
  target.materialId = source.id || source.materialId || null
  target.materialCode = source.code || source.materialCode || ''
  target.materialName = source.name || source.materialName || ''
  target.specification = source.specs || source.specification || ''
  target.specs = source.specs || source.specification || ''
  target.unit = source.unitName || source.unit || ''
  target.unitName = source.unitName || source.unit || ''
  target.unitId = source.unitId || null
}

/**
 * 辅助函数：清空行的物料字段
 */
function clearMaterialFields(target) {
  target.materialId = null
  target.materialCode = ''
  target.materialName = ''
  target.specification = ''
  target.specs = ''
  target.unit = ''
  target.unitName = ''
  target.unitId = null
}

function getResponsePayload(response) {
  return parseResponseData(response, {})
}

function normalizePriceMap(response) {
  const payload = getResponsePayload(response)
  return payload && typeof payload === 'object' ? payload : {}
}

const BATCH_MATERIAL_QUERY_LIMIT = 100
const chunkArray = (items, size) => {
  const chunks = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

async function getMaterialsByIdsInChunks(ids) {
  const materials = []
  for (const chunk of chunkArray(ids, BATCH_MATERIAL_QUERY_LIMIT)) {
    const response = await baseDataApi.getMaterialsByIds(chunk)
    materials.push(...parseListData(response, { enableLog: false }))
  }
  return materials
}

async function getLatestPricesInChunks(materialIds, supplierId) {
  const priceMap = {}
  for (const chunk of chunkArray(materialIds, BATCH_MATERIAL_QUERY_LIMIT)) {
    const response = await purchaseApi.getLatestPrices({ materialIds: chunk, supplierId: supplierId || '' })
    Object.assign(priceMap, normalizePriceMap(response))
  }
  return priceMap
}

const isBlankAmount = (value) => value === null || value === undefined || value === ''
const toNumberOrNull = (value) => {
  if (isBlankAmount(value)) return null
  const normalized = typeof value === 'string' ? value.replace(/,/g, '') : value
  const number = Number(normalized)
  return Number.isNaN(number) ? null : number
}
const normalizeTaxRate = (rate, fallback = DEFAULT_PURCHASE_VAT_RATE) => {
  const number = toNumberOrNull(rate)
  if (number === null) return fallback
  return number > 1 ? number / 100 : number
}

const AUTO_FILL_PRICE_SOURCES = new Set([
  'supplier_metal_range',
  'supplier_history',
  'supplier_receipt_history',
  'other_supplier_history',
  'material_cost'
])
const SAME_SUPPLIER_PRICE_SOURCES = new Set(['supplier_metal_range', 'supplier_history', 'supplier_receipt_history'])

function canAutoFillPurchasePrice(priceInfo) {
  return priceInfo && Number(priceInfo.price) > 0 && priceInfo.autoFill !== false && AUTO_FILL_PRICE_SOURCES.has(priceInfo.source)
}

function canRefreshForSupplier(priceInfo) {
  return canAutoFillPurchasePrice(priceInfo) && SAME_SUPPLIER_PRICE_SOURCES.has(priceInfo.source)
}

function getPurchasePriceMessage(priceInfo) {
  const priceText = `￥${Number(priceInfo.price).toFixed(2)}`
  if (priceInfo.source === 'supplier_metal_range') {
    const metalText = priceInfo.metalPrice != null ? `，金属价 ${Number(priceInfo.metalPrice).toFixed(0)}` : ''
    const bandText = priceInfo.metalPriceBandLabel ? `，区间 ${priceInfo.metalPriceBandLabel}` : ''
    return `已按当日金属价自动匹配区间价: ${priceText}${metalText}${bandText}`
  }
  if (priceInfo.source === 'supplier_history') return `已自动带入该供应商最近成交价: ${priceText}`
  if (priceInfo.source === 'supplier_receipt_history') return `已自动带入该供应商最近收货价: ${priceText}`
  if (priceInfo.source === 'other_supplier_history') return `已参考其他供应商历史价: ${priceText}`
  if (priceInfo.source === 'material_cost') return `已带入物料当前成本价: ${priceText}`
  return `已带入采购参考价: ${priceText}`
}

export function usePurchaseOrderForm(loadOrdersCallback) {
  const financeStore = useFinanceStore()
  const { vatRateOptions, defaultVATRate } = storeToRefs(financeStore)

  // 格式化税率显示
  const formatTaxRate = (rate) => {
    const normalizedRate = toNumberOrNull(rate)
    if (normalizedRate === null) return '-'
    return `${(normalizeTaxRate(normalizedRate, 0) * 100).toFixed(0)}%`
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
    orderNumber: '', orderDate: formatLocalDate(new Date()),
    expectedDeliveryDate: '', supplierId: '', supplierName: '',
    contactPerson: '', contactPhone: '', notes: '',
    requisitionId: null, requisitionNumber: '', status: 'draft',
    taxRate: DEFAULT_PURCHASE_VAT_RATE, subtotal: 0, taxAmount: 0, items: []
  })

  const orderRules = {
    orderDate: [{ required: true, message: '请选择订单日期', trigger: 'blur' }],
    expectedDeliveryDate: [{ required: true, message: '请选择预计到货日期', trigger: 'blur' }],
    supplierId: [{ required: true, message: '请选择供应商', trigger: 'change' }]
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
      const res = await supplierApi.getSuppliers({ page: 1, pageSize: 50 })
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
      const supplier = parseResponseData(res)
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
      orderForm.supplierName = supplier.name
      orderForm.contactPerson = supplier.contactPerson || ''
      orderForm.contactPhone = supplier.contactPhone || ''
      if (!suppliers.value.find(s => s.id === supplier.id)) suppliers.value.push(supplier)
    }
    const materialIds = [...new Set(orderForm.items.map(item => item.materialId).filter(Boolean))]
    if (materialIds.length > 0) {
      let updatedCount = 0
      try {
        const priceMap = await getLatestPricesInChunks(materialIds, supplierId)
        orderForm.items.forEach(item => {
          const priceInfo = priceMap[String(item.materialId)]
          if (canRefreshForSupplier(priceInfo)) {
            item.price = priceInfo.price
            item.priceSource = priceInfo.source
            item.metalSymbol = priceInfo.metalSymbol || null
            item.metalPrice = priceInfo.metalPrice ?? null
            item.metalPriceMin = priceInfo.metalPriceMin ?? null
            item.metalPriceMax = priceInfo.metalPriceMax ?? null
            item.metalPriceBandLabel = priceInfo.metalPriceBandLabel || null
            item.metalPriceSchemeId = priceInfo.metalPriceSchemeId || null
            item.metalPriceItemId = priceInfo.metalPriceItemId || null
            recalculatePrice(item)
            updatedCount++
          }
        })
      } catch (error) {
        console.warn('批量重算物料单价失败:', error)
      }
      if (updatedCount > 0) ElMessage.success(`已根据新供应商的历史成交记录，自动刷新了 ${updatedCount} 项物料单价`)
    }
  }

  const addMaterialRow = () => {
    orderForm.items.push({
      materialId: null, materialCode: '', materialName: '', specification: '', specs: '',
      unit: '', unitName: '', unitId: null, quantity: '', price: '', totalPrice: null,
      taxRate: defaultVATRate.value, taxAmount: 0, materialDisplay: ''
    })
  }

  const removeItem = (index) => { orderForm.items.splice(index, 1) }

  const recalculatePrice = (item) => {
    const quantity = toNumberOrNull(item.quantity)
    if (quantity === null || quantity <= 0) { ElMessage.warning('数量必须大于0'); item.quantity = 0.01 }
    const normalizedQuantity = toNumberOrNull(item.quantity) ?? 0.01
    const price = toNumberOrNull(item.price)
    if (price === null) {
      item.totalPrice = null
      item.taxAmount = null
      calculateTotalAmount()
      return
    }
    item.price = price
    item.totalPrice = normalizedQuantity * price
    item.taxAmount = item.totalPrice * normalizeTaxRate(item.taxRate, defaultVATRate.value)
    calculateTotalAmount()
  }

  const formatQuantity = (item) => {
    if (item.quantity && !isNaN(item.quantity)) item.quantity = parseFloat(item.quantity).toFixed(1)
  }

  const calculateTotalAmount = () => {
    const materialItems = orderForm.items.filter(item => item.materialId)
    const hasUnknownAmount = materialItems.some(item => toNumberOrNull(item.price) === null || toNumberOrNull(item.totalPrice) === null)
    if (hasUnknownAmount) {
      orderForm.subtotal = null
      orderForm.taxAmount = null
      return '-'
    }
    const subtotal = materialItems.reduce((total, item) => total + (toNumberOrNull(item.totalPrice) ?? 0), 0)
    const taxAmount = materialItems.reduce((total, item) => total + (toNumberOrNull(item.taxAmount) ?? 0), 0)
    orderForm.subtotal = subtotal; orderForm.taxAmount = taxAmount
    return (subtotal + taxAmount).toFixed(2)
  }

  const fetchMaterialSuggestions = async (query, callback) => {
    if (!query || query.length < 1) { callback([]); return }
    try {
      const searchResults = await searchMaterials(baseDataApi, query.trim(), { includeAll: true })
      const suggestions = searchResults.map(item => ({
        value: item.code || '无编码', code: item.code || '无编码', name: item.name || '未命名',
        specs: item.specification || item.specs || '', stockQuantity: item.stockQuantity || 0,
        id: item.id, unitName: item.unitName || '个', unitId: item.unitId,
        costPrice: item.costPrice ?? null,
        taxRate: item.taxRate ?? null, supplierId: item.supplierId
      }))
      filteredProducts.value = suggestions; callback(suggestions)
    } catch (error) { console.error('搜索物料失败:', error); ElMessage.error('搜索物料失败'); callback([]) }
  }

  const handleMaterialSelect = async (item, index) => {
    assignMaterialFields(orderForm.items[index], item)
    if (item.taxRate !== undefined && item.taxRate !== null) orderForm.items[index].taxRate = parseFloat(item.taxRate)
    try {
      const res = await purchaseApi.getLatestPrice({
        materialId: item.id,
        supplierId: orderForm.supplierId || item.supplierId || '',
      })
      const priceInfo = parseResponseData(res, {})
      if (canAutoFillPurchasePrice(priceInfo)) {
        orderForm.items[index].price = priceInfo.price
        orderForm.items[index].priceSource = priceInfo.source
        orderForm.items[index].metalSymbol = priceInfo.metalSymbol || null
        orderForm.items[index].metalPrice = priceInfo.metalPrice ?? null
        orderForm.items[index].metalPriceMin = priceInfo.metalPriceMin ?? null
        orderForm.items[index].metalPriceMax = priceInfo.metalPriceMax ?? null
        orderForm.items[index].metalPriceBandLabel = priceInfo.metalPriceBandLabel || null
        orderForm.items[index].metalPriceSchemeId = priceInfo.metalPriceSchemeId || null
        orderForm.items[index].metalPriceItemId = priceInfo.metalPriceItemId || null
        ElMessage({ message: getPurchasePriceMessage(priceInfo), type: 'success', duration: 2000 })
      } else { orderForm.items[index].price = '' }
    } catch (e) {
      console.error('获取实时指导价抛出异常，执行降级策略:', e)
      const defaultPrice = toNumberOrNull(item.costPrice)
      orderForm.items[index].price = defaultPrice && defaultPrice > 0 ? defaultPrice : ''
    }
    recalculatePrice(orderForm.items[index])
    if (!orderForm.supplierId && item.supplierId) orderForm.supplierId = item.supplierId
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
      orderForm.items[index].materialDisplay = ''
      return
    }
    const materialCode = displayValue.split(' - ')[0]
    const selectedMaterial = filteredProducts.value.find(m => (m.code || m.materialCode || m.id) === materialCode)
    if (selectedMaterial) {
      assignMaterialFields(orderForm.items[index], selectedMaterial)
      orderForm.items[index].materialDisplay = displayValue
      recalculatePrice(orderForm.items[index])
    }
  }

  const handleMaterialChange = (materialCode, index) => {
    if (!materialCode) {
      clearMaterialFields(orderForm.items[index])
      return
    }
    const selectedMaterial = filteredProducts.value.find(m => (m.code || m.materialCode || m.id) === materialCode)
    if (selectedMaterial) {
      assignMaterialFields(orderForm.items[index], selectedMaterial)
      recalculatePrice(orderForm.items[index])
    }
  }

  const formatMaterialLabel = (item) => {
    const code = item.code || item.materialCode || item.id || ''
    const name = item.name || item.materialName || item.title || item.productName || ''
    const specs = item.specs || item.specification || item.model || ''
    let label = code; if (name) label += ` - ${name}`; if (specs) label += ` - ${specs}`; return label
  }

  // ========== 表单操作 ==========
  const resetOrderForm = () => {
    const deliveryDate = new Date()
    deliveryDate.setDate(deliveryDate.getDate() + DEFAULT_PURCHASE_DELIVERY_DAYS)
    Object.assign(orderForm, {
      orderNumber: '', orderDate: formatLocalDate(new Date()),
      expectedDeliveryDate: formatLocalDate(deliveryDate),
      supplierId: '', supplierName: '', contactPerson: '', contactPhone: '',
      notes: '', requisitionId: null, requisitionNumber: '', status: 'draft',
      taxRate: defaultVATRate.value, subtotal: 0, taxAmount: 0, items: []
    })
  }

  // formatDate 使用 @/utils/helpers/dateUtils 公共实现（已通过 import 引入）

  const loadOrderDetails = async (id) => {
    orderDialog.loading = true
    try {
      const res = await purchaseApi.getOrder(id)
      if (res.data) {
        const data = parseResponseData(res)
        const processedItems = (data.items || []).map(item => {
          const taxRate = normalizeTaxRate(item.taxRate, defaultVATRate.value)
          const quantity = toNumberOrNull(item.quantity) ?? 0
          const price = toNumberOrNull(item.price ?? item.unitPrice)
          const explicitTotalPrice = toNumberOrNull(item.totalPrice ?? item.amount)
          const totalPrice = explicitTotalPrice ?? (price === null ? null : quantity * price)
          const explicitTaxAmount = toNumberOrNull(item.taxAmount)
          const taxAmount = explicitTaxAmount ?? (totalPrice === null ? null : totalPrice * taxRate)
          return { ...item, taxRate: taxRate, taxAmount: taxAmount, price, quantity, totalPrice: totalPrice }
        })
        Object.assign(orderForm, {
          orderNumber: data.orderNo, orderDate: formatDate(data.orderDate),
          expectedDeliveryDate: formatDate(data.expectedDeliveryDate),
          supplierId: String(data.supplierId || ''),
          supplierName: data.supplierName,
          contactPerson: data.contactPerson,
          contactPhone: data.contactPhone,
          notes: data.notes || data.remarks, status: data.status || 'draft',
          requisitionId: data.requisitionId,
          requisitionNumber: data.requisitionNumber,
          items: processedItems
        })
        await ensureSupplierExists(data.supplierId)
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
      const invalidPriceRows = orderForm.items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.materialId && toNumberOrNull(item.price) === null)
        .map(({ index }) => index + 1)
      if (invalidPriceRows.length > 0) {
        ElMessage.error(`第 ${invalidPriceRows.join(', ')} 行采购单价缺失，请确认价格权限或维护采购价后再提交`)
        return
      }
      const validItems = orderForm.items.filter(item => item.materialId)
      const subtotal = validItems.reduce((sum, item) => sum + ((toNumberOrNull(item.quantity) ?? 0) * (toNumberOrNull(item.price) ?? 0)), 0)
      const taxAmount = validItems.reduce((sum, item) => {
        const quantity = toNumberOrNull(item.quantity) ?? 0
        const price = toNumberOrNull(item.price) ?? 0
        const totalPrice = quantity * price
        return sum + (toNumberOrNull(item.taxAmount) ?? (totalPrice * normalizeTaxRate(item.taxRate, defaultVATRate.value)))
      }, 0)
      // 表单内部字段 → HTTP camelCase body（边界转换，不做 camel||snake 双读）
      const formDataToSubmit = {
        orderDate: orderForm.orderDate,
        metalSymbol: orderForm.items.find((item) => item.metalSymbol)?.metalSymbol || null,
        metalPrice: orderForm.items.find((item) => item.metalPrice != null)?.metalPrice ?? null,
        metalPriceSource:
          orderForm.items.find((item) => item.metalPriceSource || item.priceSource === 'supplier_metal_range')
            ?.metalPriceSource ||
          (orderForm.items.some((item) => item.priceSource === 'supplier_metal_range') ? 'metal_prices' : null),
        metalPriceSchemeId:
          orderForm.items.find((item) => item.metalPriceSchemeId)?.metalPriceSchemeId || null,
        supplierId: orderForm.supplierId,
        expectedDeliveryDate: orderForm.expectedDeliveryDate,
        contactPerson: orderForm.contactPerson,
        contactPhone: orderForm.contactPhone,
        notes: orderForm.notes,
        totalAmount: Number((subtotal + taxAmount).toFixed(2)),
        taxRate: normalizeTaxRate(orderForm.taxRate, defaultVATRate.value),
        taxAmount: Number(taxAmount.toFixed(2)),
        subtotal: Number(subtotal.toFixed(2)),
        status: 'draft',
        requisitionId: orderForm.requisitionId || null,
        requisitionNumber: orderForm.requisitionNumber || '',
        items: validItems.map((item) => {
          const quantity = toNumberOrNull(item.quantity) ?? 0
          const price = toNumberOrNull(item.price) ?? 0
          const taxRate = normalizeTaxRate(item.taxRate, defaultVATRate.value)
          const totalPrice = Number((quantity * price).toFixed(2))
          return {
            materialId: item.materialId,
            materialCode: item.materialCode,
            materialName: item.materialName,
            specification: item.specification,
            unit: item.unit,
            unitId: item.unitId,
            quantity,
            price,
            totalPrice,
            taxRate,
            taxAmount: Number((totalPrice * taxRate).toFixed(2)),
            priceSource: item.priceSource || null,
            metalSymbol: item.metalSymbol || null,
            metalPrice: item.metalPrice ?? null,
            metalPriceMin: item.metalPriceMin ?? null,
            metalPriceMax: item.metalPriceMax ?? null,
            metalPriceBandLabel: item.metalPriceBandLabel || null,
            metalPriceSchemeId: item.metalPriceSchemeId || null,
            metalPriceItemId: item.metalPriceItemId || null,
          }
        }),
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
    .then(() => { orderForm.requisitionId = null; orderForm.requisitionNumber = ''; ElMessage.success('已移除关联的采购申请') }).catch(() => {})
  }

  const handleMaterialSelectionChange = (selection) => { selectedMaterials.value = selection }

  const loadRequisitions = async () => {
    try {
      requisitionDialogLoading.value = true
      const response = await purchaseApi.getOrderRequisitions({ page: requisitionPagination.current, pageSize: requisitionPagination.size, requisitionNo: requisitionSearchKeyword.value, status: 'approved' })
      const requisitionItems = parseListData(response, { enableLog: false })
      const approvedRequisitions = requisitionItems.filter(item => item.status === 'approved' && !item.isFullyOrdered)
      requisitionList.value = approvedRequisitions
      requisitionPagination.total = approvedRequisitions.length
      const allUnorderedMaterials = []
      approvedRequisitions.forEach(req => {
        if (req.materials && req.materials.length > 0) {
          req.materials.forEach((material, idx) => {
            if (!material.orderedQuantity || parseFloat(material.orderedQuantity) === 0) {
              allUnorderedMaterials.push({ ...material, requisitionId: req.id, requisitionNumber: req.requisitionNumber, uniqueKey: `${req.id}_${material.materialCode}_${idx}` })
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
        orderForm.requisitionId = firstMaterial.requisitionId
        orderForm.requisitionNumber = firstMaterial.requisitionNumber
      }
      const loadingInstance = ElLoading.service({ lock: true, text: '正在同步最新物料价格和税率...', background: 'color-mix(in srgb, var(--ds-black) 70%, transparent)' })
      try {
        let addedCount = 0
        const selectedMaterialIds = [...new Set(selectedMaterials.value.map(item => item.materialId).filter(Boolean))]
        const detailMap = {}
        let priceMap = {}
        try {
          const [materials, prices] = await Promise.all([
            getMaterialsByIdsInChunks(selectedMaterialIds),
            getLatestPricesInChunks(selectedMaterialIds, orderForm.supplierId)
          ])
          materials.forEach(material => {
            detailMap[String(material.id)] = material
          })
          priceMap = prices
        } catch (error) {
          console.warn('批量同步物料详情或价格失败，将使用请购单数据降级处理:', error)
        }
        const materialsWithDetails = selectedMaterials.value.map(item => {
          const detail = detailMap[String(item.materialId)] || null
          const priceInfo = priceMap[String(item.materialId)] || {}
          const latestPrice = canAutoFillPurchasePrice(priceInfo)
            ? toNumberOrNull(priceInfo.price)
            : toNumberOrNull(detail?.costPrice)
          return { ...item, latestDetail: detail, latestPrice }
        })
        for (const item of materialsWithDetails) {
          const existingIndex = orderForm.items.findIndex(i => i.materialId === item.materialId)
          let latestTaxRate = defaultVATRate.value
          if (item.latestDetail) {
            latestTaxRate = normalizeTaxRate(item.latestDetail.taxRate, defaultVATRate.value)
            if (!orderForm.supplierId && item.latestDetail.supplierId) orderForm.supplierId = item.latestDetail.supplierId
          }
          if (existingIndex >= 0) {
            orderForm.items[existingIndex].quantity += parseFloat(item.quantity)
            if (toNumberOrNull(orderForm.items[existingIndex].price) === null && item.latestPrice > 0) orderForm.items[existingIndex].price = item.latestPrice
            if (!orderForm.items[existingIndex].taxRate && latestTaxRate > 0) orderForm.items[existingIndex].taxRate = latestTaxRate
            recalculatePrice(orderForm.items[existingIndex])
          } else {
            const specs = item.materialSpecs || item.specification || item.specs || ''
            orderForm.items.push({ materialId: item.materialId, materialCode: item.materialCode || '', materialName: item.materialName || '', specification: specs, specs, unit: item.unit, unitName: item.unit, unitId: item.unitId, quantity: parseFloat(item.quantity), price: item.latestPrice ?? '', taxRate: latestTaxRate, totalPrice: null })
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
