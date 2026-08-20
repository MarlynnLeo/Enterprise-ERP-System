import { formatLocalDate } from '@/utils/format';
/**
 * useOrderForm.js
 * @description 销售订单表单逻辑的组合式函数（从 SalesOrders.vue 抽取）
 * 包含：表单数据、验证规则、金额计算、物料操作、客户选择、提交逻辑
 */
import { ref, reactive, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { salesApi, baseDataApi } from '@/api'
import { parseListData } from '@/utils/responseParser'
import { searchMaterials } from '@/utils/searchConfig'
import { loadCustomerOptions, searchCustomerOptions, loadMaterialOptions } from '@/utils/optionLoaders'
import { checkInventory } from '@/composables/useInventoryCheck'
import { useFinanceStore } from '@/stores/finance'
import { storeToRefs } from 'pinia'

/** 默认交期天数 */
const DEFAULT_DELIVERY_DAYS = 21
const isBlankAmount = (value) => value === null || value === undefined || value === ''
const toNumberOrNull = (value) => {
  if (isBlankAmount(value)) return null
  const normalized = typeof value === 'string' ? value.replace(/,/g, '') : value
  const number = Number(normalized)
  return Number.isNaN(number) ? null : number
}
const normalizeTaxRate = (rate, fallback = 0) => {
  const number = toNumberOrNull(rate)
  if (number === null) return fallback
  return number > 1 ? number / 100 : number
}

const BATCH_MATERIAL_QUERY_LIMIT = 100
const chunkArray = (items, size) => {
  const chunks = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

const createEmptyOrderItem = (defaultTaxRate = 0) => ({
  id: '',
  materialId: '',
  materialName: '',
  materialCode: '',
  name: '',
  code: '',
  specification: '',
  quantity: '',
  unitName: '',
  unitId: '',
  unitPrice: null,
  amount: 0,
  taxRate: defaultTaxRate,
  taxAmount: 0,
  remark: ''
})

async function getMaterialsByCodesInChunks(codes) {
  const materials = []
  for (const chunk of chunkArray(codes, BATCH_MATERIAL_QUERY_LIMIT)) {
    const response = await baseDataApi.getMaterialsByCodes(chunk)
    materials.push(...parseListData(response, { enableLog: false }))
  }
  return materials
}

export function useOrderForm(fetchDataCallback, updateParamsCallback) {
  // 财务 store
  const financeStore = useFinanceStore()
  const { vatRateOptions, defaultVATRate } = storeToRefs(financeStore)

  // 对话框控制
  const dialogVisible = ref(false)
  const dialogLoading = ref(false)
  const dialogType = ref('add')

  // 表单引用
  const formRef = ref(null)
  const contractCodeInput = ref(null)

  // 客户列表和产品列表
  const customers = ref([])
  const filteredCustomers = ref([])
  const customerSearchLoading = ref(false)
  const products = ref([])
  const filteredProducts = ref([])
  const materialsLoading = ref(false)

  // 表单数据
  const form = reactive({
    customerId: '',
    customerName: '',
    contractCode: '',
    contact: '',
    phone: '',
    address: '',
    deliveryDate: '',
    status: 'pending',
    items: [],
    remark: '',
    subtotal: 0,
    taxAmount: 0,
    totalAmount: 0
  })

  // 表单验证规则
  const rules = {
    customerId: [
      { required: true, message: '请选择客户', trigger: 'change' }
    ],
    deliveryDate: [
      { required: true, message: '请选择交付日期', trigger: 'change' }
    ]
  }

  // 组件引用管理
  const materialSelectRefs = ref({})
  const quantityInputRefs = ref({})

  const setMaterialSelectRef = (el, index) => {
    if (el) materialSelectRefs.value[index] = el
  }

  const setQuantityInputRef = (el, index) => {
    if (el) quantityInputRefs.value[index] = el
  }

  // 简化监听器
  watch(() => products.value.length, (newLength) => {
    if (newLength > 0 && filteredProducts.value.length === 0) {
      filteredProducts.value = [...products.value]
    }
  })

  // ========== 金额计算 ==========

  const calculateTotalAmount = () => {
    const materialItems = form.items.filter(item => item.materialId)
    const hasUnknownAmount = materialItems.some(item => toNumberOrNull(item.unitPrice) === null || toNumberOrNull(item.amount) === null)
    if (hasUnknownAmount) {
      form.subtotal = null
      form.taxAmount = null
      form.totalAmount = null
      return
    }
    const subtotal = materialItems.reduce((total, item) => total + (toNumberOrNull(item.amount) ?? 0), 0)
    const taxAmount = materialItems.reduce((total, item) => total + (toNumberOrNull(item.taxAmount) ?? 0), 0)
    form.subtotal = subtotal
    form.taxAmount = taxAmount
    form.totalAmount = subtotal + taxAmount
  }

  watch(() => form.items, () => {
    calculateTotalAmount()
  }, { deep: true })

  const calculateItemAmount = (index) => {
    if (index < 0 || index >= form.items.length) return
    const item = form.items[index]
    if (!item) return

    let quantity = toNumberOrNull(item.quantity)
    const unitPrice = toNumberOrNull(item.unitPrice)

    if (quantity === null) quantity = 0
    item.quantity = quantity
    if (unitPrice === null) {
      item.amount = null
      item.taxAmount = null
      calculateTotalAmount()
      return
    }
    item.unitPrice = unitPrice
    item.amount = quantity * unitPrice
    const taxRate = normalizeTaxRate(item.taxRate, 0)
    item.taxAmount = item.amount * taxRate
    calculateTotalAmount()
  }

  // ========== 客户操作 ==========

  const mapCustomerOption = (customer) => ({
    id: customer.id,
    code: customer.customerCode || `C${customer.id}`,
    name: customer.name,
    contactPerson: customer.contactPerson,
    contactPhone: customer.contactPhone,
    address: customer.address
  })

  const fetchCustomers = async () => {
    try {
      // 拉全量启用客户，不再被 pageSize=50 截断
      const customersData = await loadCustomerOptions()
      customers.value = (customersData || []).map(mapCustomerOption)
      filteredCustomers.value = [...customers.value]
    } catch (error) {
      console.error('获取客户数据失败:', error)
      ElMessage.error('获取客户数据失败')
      customers.value = []
      filteredCustomers.value = []
    }
  }

  const searchCustomers = (query) => {
    customerSearchLoading.value = true
    const keyword = String(query || '').trim()
    ;(async () => {
      // 无关键字：拉全量启用客户；有关键字：服务端按编码/名称搜
      const remoteCustomers = keyword
        ? await searchCustomerOptions(keyword)
        : await loadCustomerOptions()
      customers.value = remoteCustomers.map(mapCustomerOption)
      filteredCustomers.value = [...customers.value]
      customerSearchLoading.value = false
    })().catch(error => {
      console.error('搜索客户失败:', error)
      filteredCustomers.value = []
      customerSearchLoading.value = false
    })
  }

  const handleCustomerChange = (customerId) => {
    if (!Array.isArray(customers.value)) {
      console.error('customers.value不是数组:', customers.value)
      ElMessage.error('客户数据格式错误')
      return
    }
    const selectedCustomer = customers.value.find(c => c.id === customerId)
    if (selectedCustomer) {
      form.customerName = selectedCustomer.name
      form.contact = selectedCustomer.contactPerson || ''
      form.phone = selectedCustomer.contactPhone || ''
      form.address = selectedCustomer.address || ''
    }
  }

  const handleCustomerEnterKey = () => {
    if (filteredCustomers.value && filteredCustomers.value.length > 0) {
      const firstCustomer = filteredCustomers.value[0]
      form.customerId = firstCustomer.id
      handleCustomerChange(firstCustomer.id)
      ElMessage.success(`已自动选择客户: ${firstCustomer.code} - ${firstCustomer.name}`)
      nextTick(() => {
        if (contractCodeInput.value) contractCodeInput.value.focus()
      })
    } else if (customers.value && customers.value.length > 0) {
      const firstCustomer = customers.value[0]
      form.customerId = firstCustomer.id
      handleCustomerChange(firstCustomer.id)
      ElMessage.success(`已自动选择客户: ${firstCustomer.code} - ${firstCustomer.name}`)
      nextTick(() => {
        if (contractCodeInput.value) contractCodeInput.value.focus()
      })
    } else {
      ElMessage.warning('没有可选择的客户，请先加载客户数据')
    }
  }

  // ========== 物料操作 ==========

  const addMaterial = () => {
    form.items.push(createEmptyOrderItem(defaultVATRate.value))
  }

  const removeMaterial = (index) => {
    form.items.splice(index, 1)
  }

  const fetchMaterialSuggestions = async (query, callback) => {
    if (!query || query.length < 1) {
      callback([])
      return
    }
    try {
      const searchResults = await searchMaterials(baseDataApi, query.trim(), {
        includeAll: true
      })
      const suggestions = searchResults.map(item => ({
        value: item.code || '无编码', code: item.code || '无编码',
        name: item.name || '未命名',
        specs: item.specification || item.specs || '',
        stockQuantity: item.stockQuantity || 0, id: item.id,
        unitName: item.unitName || '个', unitId: item.unitId,
        price: item.price ?? null
      }))
      filteredProducts.value = suggestions
      callback(suggestions)
    } catch {
      ElMessage.error('搜索物料失败')
      callback([])
    }
  }

  const handleMaterialSelect = (item, index) => {
    const materialId = Number(item.id)
    if (!materialId || isNaN(materialId)) {
      console.error('物料ID无效:', item.id)
      ElMessage.error('物料ID无效，请重新选择')
      return
    }
    form.items[index].materialId = materialId
    form.items[index].code = item.code
    form.items[index].materialCode = item.code
    form.items[index].name = item.name
    form.items[index].materialName = item.name
    form.items[index].specification = item.specs
    form.items[index].unitName = item.unitName
    form.items[index].unitId = item.unitId
    const defaultPrice = toNumberOrNull(item.price)
    if (defaultPrice !== null && defaultPrice > 0) {
      form.items[index].unitPrice = defaultPrice
      const quantity = parseFloat(form.items[index].quantity) || 0
      form.items[index].amount = quantity * defaultPrice
      calculateTotalAmount()
    }
    nextTick(() => {
      const quantityInput = quantityInputRefs.value[index]
      if (quantityInput) quantityInput.focus()
    })
  }

  const handleMaterialClear = (index) => {
    Object.assign(form.items[index], {
      materialId: '',
      code: '',
      materialCode: '',
      name: '',
      materialName: '',
      specification: '',
      unitName: '',
      unitId: '',
      unitPrice: null,
      amount: 0,
      taxAmount: 0
    })
  }

  const handleMaterialEnter = async (index) => {
    const inputCode = form.items[index].code?.trim()
    if (!inputCode) { ElMessage.warning('请输入物料编码'); return }

    let exactMatch = filteredProducts.value.find(m => {
      const codeMatch = m.code === inputCode || m.code.toLowerCase() === inputCode.toLowerCase()
      const specsMatch = m.specs === inputCode || m.specs?.toLowerCase() === inputCode.toLowerCase()
      return codeMatch || specsMatch
    })
    if (exactMatch) { handleMaterialSelect(exactMatch, index); return }

    try {
      const res = await baseDataApi.getMaterials({ keyword: inputCode, page: 1, pageSize: 20 })
      const materials = parseListData(res, { enableLog: false })
      exactMatch = materials.find(m => {
        const codeMatch = (m.code || '').toLowerCase() === inputCode.toLowerCase()
        const specsMatch = (m.specs || m.specification || '').toLowerCase() === inputCode.toLowerCase()
        return codeMatch || specsMatch
      })
      if (exactMatch) {
        const materialItem = {
          id: exactMatch.id, code: exactMatch.code || exactMatch.materialCode || '',
          name: exactMatch.name || exactMatch.materialName || '',
          specs: exactMatch.specs || exactMatch.specification || '',
          stockQuantity: exactMatch.stockQuantity || 0,
          unitName: exactMatch.unitName || exactMatch.unit || '', unitId: exactMatch.unitId
        }
        handleMaterialSelect(materialItem, index); return
      }
      if (filteredProducts.value.length > 0) {
        const firstMaterial = filteredProducts.value[0]
        const displayInfo = firstMaterial.specs ? `${firstMaterial.code} (${firstMaterial.specs})` : firstMaterial.code
        ElMessage.info(`未找到精确匹配 "${inputCode}"，已自动选择: ${displayInfo}`)
        handleMaterialSelect(firstMaterial, index); return
      }
      ElMessage.warning(`未找到包含 "${inputCode}" 的物料`)
    } catch {
      if (filteredProducts.value.length > 0) {
        const firstMaterial = filteredProducts.value[0]
        const displayInfo = firstMaterial.specs ? `${firstMaterial.code} (${firstMaterial.specs})` : firstMaterial.code
        ElMessage.info(`已自动选择: ${displayInfo}`)
        handleMaterialSelect(firstMaterial, index)
      } else {
        ElMessage.error('查找物料失败，请重试')
      }
    }
  }

  const handleQuantityEnter = () => {
    addMaterial()
    nextTick(() => {
      const newIndex = form.items.length - 1
      const materialSelect = materialSelectRefs.value[newIndex]
      if (materialSelect) materialSelect.focus()
    })
  }

  // checkInventory 使用 @/composables/useInventoryCheck 公共实现

  // ========== 表单提交 ==========

  const handleSubmit = async () => {
    if (!form.customerId) { ElMessage.error('请选择客户'); return }
    if (form.items.length === 0) { ElMessage.error('请添加至少一项产品'); return }

    const invalidItems = []
    form.items.forEach((item, index) => { if (!item.materialId) invalidItems.push(index + 1) })
    if (invalidItems.length > 0) {
      ElMessage.error(`第 ${invalidItems.join(', ')} 行物料未选择，请选择物料后再提交`); return
    }

    const incompleteItems = []
    form.items.forEach((item, index) => {
      const quantity = Number(item.quantity)
      if (!quantity || quantity <= 0) incompleteItems.push(index + 1)
    })
    if (incompleteItems.length > 0) {
      ElMessage.error(`第 ${incompleteItems.join(', ')} 行数量不正确，请检查后再提交`); return
    }

    const missingPriceItems = []
    form.items.forEach((item, index) => {
      if (item.materialId && toNumberOrNull(item.unitPrice) === null) missingPriceItems.push(index + 1)
    })
    if (missingPriceItems.length > 0) {
      ElMessage.error(`第 ${missingPriceItems.join(', ')} 行销售单价缺失，请确认价格权限或维护售价后再提交`)
      return
    }

    try {
      const insufficientItems = await checkInventory(form.items)
      let orderStatus
      let shouldGeneratePlans = false

      if (dialogType.value === 'edit') {
        orderStatus = form.status || 'pending'
        if (insufficientItems.length > 0) {
          const itemMessages = insufficientItems.map(item =>
            `${item.materialName || '未知物料'}: 需要 ${item.quantity}, 库存 ${item.currentStock}`)
          const alertMessage = `以下物料库存不足:\n${itemMessages.join('\n')}\n\n是否继续保存并生成生产/采购计划?`
          try {
            await ElMessageBox.confirm(alertMessage, '库存不足警告', {
              confirmButtonText: '继续保存', cancelButtonText: '取消', type: 'warning',
            })
            shouldGeneratePlans = true
          } catch { return }
        }
      } else {
        if (insufficientItems.length > 0) {
          const itemMessages = insufficientItems.map(item =>
            `${item.materialName || '未知物料'}: 需要 ${item.quantity}, 库存 ${item.currentStock}`)
          const alertMessage = `以下物料库存不足:\n${itemMessages.join('\n')}\n\n是否仍要创建订单?`
          try {
            await ElMessageBox.confirm(alertMessage, '库存不足警告', {
              confirmButtonText: '继续创建', cancelButtonText: '取消', type: 'warning',
            })
            orderStatus = 'in_production'
            shouldGeneratePlans = true
          } catch { return }
        } else {
          orderStatus = 'ready_to_ship'
        }
      }

      dialogLoading.value = true
      const contractCodeVal = form.contractCode || ''
      const customerIdVal = form.customerId
      const postData = {
        customer_id: customerIdVal,
        contract_code: contractCodeVal,
        delivery_date: form.deliveryDate,
        order_date: formatLocalDate(new Date()),
        updated_at: new Date().toISOString(),
        status: orderStatus,
        should_generate_plans: shouldGeneratePlans,
        subtotal: form.subtotal ?? 0,
        total_amount: form.totalAmount ?? 0,
        notes: form.remark || '',
        items: form.items.map(item => {
          const quantity = toNumberOrNull(item.quantity) ?? 0
          const unitPrice = toNumberOrNull(item.unitPrice)
          const taxRate = normalizeTaxRate(item.taxRate, defaultVATRate.value)
          const amount = quantity * unitPrice
          const taxAmount = amount * taxRate
          return {
            material_id: item.materialId, quantity, unit_price: unitPrice,
            amount, tax_percent: taxRate, tax_amount: taxAmount,
            specification: item.specification, remark: item.remark || ''
          }
        })
      }

      let orderSaved = false
      try {
        if (dialogType.value === 'edit') {
          await salesApi.updateOrder(form.id, postData)
          ElMessage.success('订单更新成功')
          orderSaved = true
        } else {
          await salesApi.createOrder(postData)
          ElMessage.success('订单创建成功')
          if (updateParamsCallback) updateParamsCallback({ page: 1 })
          orderSaved = true
        }
        dialogVisible.value = false
      } catch (error) {
        const action = dialogType.value === 'edit' ? '更新' : '创建'
        console.error(`${action}订单失败:`, error)
        ElMessage.error(`${action}订单失败: ` + (error.message || '未知错误'))
      } finally {
        dialogLoading.value = false
        if (orderSaved && fetchDataCallback) await fetchDataCallback()
      }
    } catch (error) {
      console.error('提交过程中发生错误:', error)
      ElMessage.error('提交过程中发生错误: ' + (error.message || '未知错误'))
    }
  }

  // ========== 新增/编辑入口 ==========

  const handleAdd = async () => {
    dialogType.value = 'add'
    Object.keys(form).forEach(key => {
      if (key === 'items') {
        form[key] = [createEmptyOrderItem(defaultVATRate.value)]
      } else if (key === 'deliveryDate') {
        const today = new Date(); const deliveryDate = new Date(today)
        deliveryDate.setDate(today.getDate() + DEFAULT_DELIVERY_DAYS)
        form[key] = formatLocalDate(deliveryDate)
      } else if (key === 'subtotal' || key === 'taxAmount' || key === 'totalAmount') {
        form[key] = 0
      } else {
        form[key] = ''
      }
    })
    const productsArray = Array.isArray(products.value) ? products.value : []
    filteredProducts.value = [...productsArray]
    if (customers.value.length === 0) {
      await fetchCustomers()
    } else {
      filteredCustomers.value = [...customers.value]
    }
    if (products.value.length === 0) {
      try {
        materialsLoading.value = true
        // 与客户下拉一致：分页拉全量启用物料，避免只显示 50 条
        const materialsData = await loadMaterialOptions()
        products.value = (materialsData || []).map(material => ({
          id: material.id, code: material.code || '', value: material.code || '',
          name: material.name || '', materialName: material.name || '',
          specs: material.specs || material.specification || '',
          drawingNo: material.drawingNo || '',
          stockQuantity: material.stockQuantity || 0,
          label: `${material.code || ''} - ${material.name || ''} ${material.specs ? `(${material.specs})` : ''} [库存:${material.stockQuantity || 0}]`,
          specification: material.specification || material.specs || '',
          unitId: material.unitId, unitName: material.unitName || '个',
          price: material.price ?? null
        })).filter(item => item.id)
        filteredProducts.value = [...products.value]
      } catch (error) {
        console.error('加载物料数据失败:', error)
      } finally {
        materialsLoading.value = false
      }
    }
    dialogVisible.value = true
  }

  const handleEdit = async (row) => {
    dialogType.value = 'edit'
    Object.keys(form).forEach(key => {
      if (key === 'items') form[key] = []
      else form[key] = ''
    })
    dialogVisible.value = true
    dialogLoading.value = true
    try {
      const response = await salesApi.getOrder(row.id)
      const orderDetail = response.data
      const contractCodeVal = orderDetail.contractCode || row.contractCode || ''
      const customerIdVal = orderDetail.customerId || row.customerId || ''
      const customerNameVal = orderDetail.customerName || row.customerName || row.customer || ''
      Object.assign(form, {
        id: orderDetail.id,
        customerId: customerIdVal,
        customerName: customerNameVal,
        deliveryDate: orderDetail.deliveryDate || row.deliveryDate || '',
        address: orderDetail.address || row.address || '',
        contact: orderDetail.contactPerson || orderDetail.contact || row.contact || '',
        phone: orderDetail.contactPhone || orderDetail.phone || row.phone || '',
        contractCode: contractCodeVal,
        status: orderDetail.status || row.status || 'pending',
        remark: orderDetail.remark || orderDetail.remarks || orderDetail.notes || row.remark || '',
        items: []
      })
      const orderItems = orderDetail.items || row.items || []
      if (Array.isArray(orderItems) && orderItems.length > 0) {
        form.items = orderItems.map(item => {
          const quantity = toNumberOrNull(item.quantity) ?? 0
          const unitPrice = toNumberOrNull(item.unitPrice)
          let amount = toNumberOrNull(item.amount)
          if (amount === null && unitPrice !== null) amount = quantity * unitPrice
          const taxRate = normalizeTaxRate(
            item.taxRate !== undefined ? item.taxRate : item.taxPercent,
            defaultVATRate.value
          )
          const taxAmount = toNumberOrNull(item.taxAmount)
            ?? (amount === null ? null : parseFloat((amount * taxRate).toFixed(2)))
          return {
            ...item,
            code: item.materialCode || item.code || '',
            materialCode: item.materialCode || item.code || '',
            name: item.materialName || item.name || '',
            materialName: item.materialName || item.name || '',
            materialId: item.materialId || '',
            specification: item.specification || item.specs || '',
            quantity,
            unitPrice,
            unitName: item.unitName || '个',
            unitId: item.unitId || '',
            amount,
            taxRate,
            taxAmount,
            remark: item.remark || item.remarks || ''
          }
        })
        // 异步补充缺失的 material_id
        const missingMaterialCodes = [...new Set(form.items.filter(item => !item.materialId && item.code).map(item => item.code))]
        if (missingMaterialCodes.length > 0) {
          try {
            const materials = await getMaterialsByCodesInChunks(missingMaterialCodes)
            const materialsByCode = new Map(
              materials
                .filter(material => material.code)
                .map(material => [String(material.code).toLowerCase(), material])
            )
            form.items.forEach((item) => {
              const exactMatch = materialsByCode.get(String(item.code || '').toLowerCase())
              if (!item.materialId && exactMatch) {
                item.materialId = exactMatch.id
                item.materialCode = exactMatch.code || item.code
                item.materialName = exactMatch.name || item.materialName
                item.specification = exactMatch.specs || exactMatch.specification || item.specification
                item.unitId = exactMatch.unitId || item.unitId
                item.unitName = exactMatch.unitName || item.unitName
              }
            })
          } catch (error) { console.error('批量补充物料ID失败:', error) }
        }
      }
    } catch (error) {
      console.error('获取订单详情失败:', error)
      ElMessage.error('获取订单详情失败，请重试')
      dialogLoading.value = false
      return
    } finally {
      dialogLoading.value = false
    }
    calculateTotalAmount()
    filteredProducts.value = [...products.value]
    if (!form.customerId && form.customerName && Array.isArray(customers.value)) {
      const matchedCustomer = customers.value.find(c => c.name === form.customerName || c.name === form.customer)
      if (matchedCustomer) form.customerId = matchedCustomer.id
    }
  }

  return {
    // 对话框控制
    dialogVisible, dialogLoading, dialogType,
    // 表单
    formRef, contractCodeInput, form, rules,
    // 客户
    customers, filteredCustomers, customerSearchLoading,
    fetchCustomers, searchCustomers, handleCustomerChange, handleCustomerEnterKey,
    // 产品/物料
    products, filteredProducts, materialsLoading,
    materialSelectRefs, quantityInputRefs,
    setMaterialSelectRef, setQuantityInputRef,
    addMaterial, removeMaterial,
    fetchMaterialSuggestions, handleMaterialSelect, handleMaterialClear,
    handleMaterialEnter, handleQuantityEnter,
    // 金额
    calculateItemAmount, calculateTotalAmount,
    // 提交
    handleSubmit, handleAdd, handleEdit,
    // 税率
    vatRateOptions, defaultVATRate, financeStore
  }
}
